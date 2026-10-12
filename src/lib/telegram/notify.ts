import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/util/text";
import { sendTelegram, type TelegramConfig, type TelegramResult } from "./client";
import { deadlineMessage, foundMessage, HOUR, windowEnd, type DraftFacts } from "./messages";

/** Each kind is sent at most once per draft (enforced by a unique index on the claim row). */
export type NotificationKind = "found" | "deadline";

export interface NotifyStore {
  draft(outreachId: string): Promise<DraftFacts | null>;
  /** Drafts that have not gone out (generated / draft_created / approved), newest first. */
  openDrafts(): Promise<DraftFacts[]>;
  /** Atomically record that (kind, draft) is being sent. false = someone already has. */
  claim(kind: NotificationKind, outreachId: string, meta: Record<string, unknown>): Promise<boolean>;
  /** Undo a claim whose message could not be delivered, so a later sweep retries it. */
  release(kind: NotificationKind, outreachId: string): Promise<void>;
}

export interface NotifyDeps {
  store: NotifyStore;
  config: TelegramConfig | null;
  send?: (cfg: TelegramConfig, html: string) => Promise<TelegramResult>;
  now?: () => Date;
  windowHours: number;
  leadHours: number;
  appUrl: string | null;
}

export type NotifyOutcome = "sent" | "skipped" | "failed";

const draftUrl = (d: NotifyDeps, id: string) => (d.appUrl ? `${d.appUrl}/drafts/${id}` : null);
const nowOf = (d: NotifyDeps) => (d.now ?? (() => new Date()))();
const leftMs = (d: NotifyDeps, f: DraftFacts) => windowEnd(f.announcedAt, d.windowHours).getTime() - nowOf(d).getTime();

async function deliver(d: NotifyDeps, kind: NotificationKind, f: DraftFacts, html: string): Promise<{ outcome: NotifyOutcome; error?: string }> {
  if (!d.config) return { outcome: "skipped" };
  if (!(await d.store.claim(kind, f.outreachId, { startup: f.startupName }))) return { outcome: "skipped" };
  const res = await (d.send ?? sendTelegram)(d.config, html);
  if (res.ok) return { outcome: "sent" };
  await d.store.release(kind, f.outreachId).catch(() => undefined);
  return { outcome: "failed", error: res.error };
}

/** "A startup has been found and an email has been drafted." Safe to call twice: the second call is a no-op. */
export async function notifyDraftReady(d: NotifyDeps, outreachId: string): Promise<{ outcome: NotifyOutcome; error?: string }> {
  if (!d.config) return { outcome: "skipped" };
  const f = await d.store.draft(outreachId);
  if (!f || !["generated", "draft_created", "approved"].includes(f.status)) return { outcome: "skipped" };
  const r = await deliver(d, "found", f, foundMessage(f, nowOf(d), d.windowHours, draftUrl(d, f.outreachId)));
  // The message already says how little time is left; a second alert seconds later would just be noise.
  if (r.outcome === "sent" && leftMs(d, f) <= d.leadHours * HOUR) await d.store.claim("deadline", f.outreachId, { startup: f.startupName, with: "found" });
  return r;
}

export interface SweepResult {
  found: number;
  reminders: number;
  failures: string[];
}

/**
 * Looks at every draft that has not gone out and sends what is due:
 *  - the "found" message, if it was never delivered (Telegram set up late, or a send failed earlier);
 *  - the "time is running out" message, once, when `leadHours` or less remain of the outreach window.
 * Cheap enough to run every few minutes. Windows that have already closed are left alone.
 */
export async function runTelegramSweep(d: NotifyDeps): Promise<SweepResult> {
  const result: SweepResult = { found: 0, reminders: 0, failures: [] };
  if (!d.config) return result;
  for (const f of await d.store.openDrafts()) {
    const left = leftMs(d, f);
    if (left <= 0) continue;
    const found = await notifyDraftReady(d, f.outreachId);
    if (found.outcome === "sent") result.found++;
    if (found.outcome === "failed") result.failures.push(`${f.startupName}: ${found.error}`);
    if (left <= d.leadHours * HOUR) {
      const r = await deliver(d, "deadline", f, deadlineMessage(f, nowOf(d), d.windowHours, draftUrl(d, f.outreachId)));
      if (r.outcome === "sent") result.reminders++;
      if (r.outcome === "failed") result.failures.push(`${f.startupName}: ${r.error}`);
    }
  }
  return result;
}

// ───────────────────────────── production wiring ─────────────────────────────

const SELECT =
  "id,status,recipient_email,startups(name,description),funding_rounds(stage,amount,currency,earliest_source_published_at,created_at),fit_assessments(total_score)";

function toFacts(r: any): DraftFacts {
  return {
    outreachId: r.id,
    status: r.status,
    startupName: r.startups?.name ?? "A startup",
    description: r.startups?.description ?? null,
    stage: r.funding_rounds?.stage ?? null,
    amount: r.funding_rounds?.amount ?? null,
    currency: r.funding_rounds?.currency ?? null,
    score: r.fit_assessments?.total_score ?? null,
    recipientEmail: r.recipient_email ?? null,
    announcedAt: new Date(r.funding_rounds?.earliest_source_published_at ?? r.funding_rounds?.created_at ?? Date.now()),
  };
}

export class SupabaseNotifyStore implements NotifyStore {
  async draft(id: string) {
    const { data, error } = await db().from("outreach").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(`telegram draft: ${error.message}`);
    return data ? toFacts(data) : null;
  }
  async openDrafts() {
    const { data, error } = await db().from("outreach").select(SELECT).in("status", ["generated", "draft_created", "approved"]).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(`telegram drafts: ${error.message}`);
    return (data ?? []).map(toFacts);
  }
  async claim(kind: NotificationKind, outreachId: string, meta: Record<string, unknown>) {
    const { error } = await db().from("pipeline_events").insert({ entity_type: "outreach", entity_id: outreachId, event_type: `telegram_${kind}`, message: `Telegram ${kind} alert`, metadata_json: meta });
    if (!error) return true;
    if (error.code === "23505") return false; // unique index: already sent
    throw new Error(`telegram claim: ${error.message}`);
  }
  async release(kind: NotificationKind, outreachId: string) {
    await db().from("pipeline_events").delete().eq("entity_id", outreachId).eq("event_type", `telegram_${kind}`);
  }
}

export function telegramConfig(): TelegramConfig | null {
  const e = env();
  return e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID ? { token: e.TELEGRAM_BOT_TOKEN, chatId: e.TELEGRAM_CHAT_ID } : null;
}

export function appBaseUrl(): string | null {
  const raw = env().APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  return raw ? raw.replace(/\/+$/, "") : null;
}

export function telegramDeps(): NotifyDeps {
  const e = env();
  return { store: new SupabaseNotifyStore(), config: telegramConfig(), windowHours: e.OUTREACH_WINDOW_HOURS, leadHours: e.TELEGRAM_REMINDER_LEAD_HOURS, appUrl: appBaseUrl() };
}

/** For the pipeline: never throws, returns a one-line problem or null. */
export async function notifyDraftReadySafely(outreachId: string): Promise<string | null> {
  try {
    const r = await notifyDraftReady(telegramDeps(), outreachId);
    return r.outcome === "failed" ? `telegram: ${r.error}` : null;
  } catch (err) {
    return `telegram: ${errorMessage(err)}`;
  }
}
