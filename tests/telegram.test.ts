import { describe, expect, it } from "vitest";
import { esc, sendTelegram } from "@/lib/telegram/client";
import { deadlineMessage, foundMessage, formatLeft, HOUR, type DraftFacts } from "@/lib/telegram/messages";
import { notifyDraftReady, runTelegramSweep, type NotificationKind, type NotifyDeps, type NotifyStore } from "@/lib/telegram/notify";

const NOW = new Date("2026-10-12T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR);

const facts = (over: Partial<DraftFacts> = {}): DraftFacts => ({
  outreachId: "o1", status: "generated", startupName: "Nimbus AI", description: "Agents for ops teams", stage: "seed", amount: 18_000_000, currency: "INR",
  score: 82, recipientEmail: "asha@nimbus.example", announcedAt: hoursAgo(3), ...over,
});

class FakeStore implements NotifyStore {
  claims = new Set<string>();
  constructor(public drafts: DraftFacts[]) {}
  async draft(id: string) { return this.drafts.find((d) => d.outreachId === id) ?? null; }
  async openDrafts() { return this.drafts; }
  async claim(kind: NotificationKind, id: string) {
    const k = `${kind}:${id}`;
    if (this.claims.has(k)) return false;
    this.claims.add(k);
    return true;
  }
  async release(kind: NotificationKind, id: string) { this.claims.delete(`${kind}:${id}`); }
}

function setup(drafts: DraftFacts[], opts: { configured?: boolean; fail?: boolean } = {}) {
  const sent: string[] = [];
  const store = new FakeStore(drafts);
  const deps: NotifyDeps = {
    store, config: opts.configured === false ? null : { token: "123:SECRET", chatId: "42" }, now: () => NOW, windowHours: 24, leadHours: 2, appUrl: "https://app.example",
    send: async (_c, html) => {
      if (opts.fail) return { ok: false, error: "Telegram 500" };
      sent.push(html);
      return { ok: true };
    },
  };
  return { deps, store, sent };
}

describe("messages", () => {
  it("found message names the startup, funding, score, time left and links to the draft", () => {
    const m = foundMessage(facts(), NOW, 24, "https://app.example/drafts/o1");
    expect(m).toContain("<b>New startup found: Nimbus AI</b>");
    expect(m).toContain("Seed · ₹1.8 Cr");
    expect(m).toContain("82/100");
    expect(m).toContain("21h left");
    expect(m).toContain('<a href="https://app.example/drafts/o1">');
  });

  it("escapes HTML in names and says when there is no recipient", () => {
    const m = foundMessage(facts({ startupName: "A <b>&</b> Co", recipientEmail: null }), NOW, 24, null);
    expect(m).toContain("A &lt;b&gt;&amp;&lt;/b&gt; Co");
    expect(m).toContain("No founder email yet");
    expect(m).not.toContain("<a ");
  });

  it("deadline message shows the time left and when the window closes", () => {
    const m = deadlineMessage(facts({ announcedAt: hoursAgo(22), status: "approved" }), NOW, 24, "https://app.example/drafts/o1");
    expect(m).toContain("2h left to email Nimbus AI");
    expect(m).toContain("approved, ready to send");
  });

  it("formatLeft", () => {
    expect(formatLeft(90 * 60_000)).toBe("1h 30m");
    expect(formatLeft(45 * 60_000)).toBe("45m");
    expect(formatLeft(-5)).toBe("0m");
    expect(esc("<&>")).toBe("&lt;&amp;&gt;");
  });
});

describe("notifyDraftReady", () => {
  it("sends once; a repeat is a no-op", async () => {
    const { deps, sent } = setup([facts()]);
    expect((await notifyDraftReady(deps, "o1")).outcome).toBe("sent");
    expect((await notifyDraftReady(deps, "o1")).outcome).toBe("skipped");
    expect(sent).toHaveLength(1);
  });

  it("does nothing when Telegram is not configured, or the draft already went out", async () => {
    expect((await notifyDraftReady(setup([facts()], { configured: false }).deps, "o1")).outcome).toBe("skipped");
    expect((await notifyDraftReady(setup([facts({ status: "sent" })]).deps, "o1")).outcome).toBe("skipped");
  });

  it("a failed send releases the claim so the next attempt retries", async () => {
    const { deps, store } = setup([facts()], { fail: true });
    expect(await notifyDraftReady(deps, "o1")).toEqual({ outcome: "failed", error: "Telegram 500" });
    expect(store.claims.size).toBe(0);
  });

  it("when little time is left, the found message stands in for the reminder", async () => {
    const { deps, sent } = setup([facts({ announcedAt: hoursAgo(23) })]);
    await notifyDraftReady(deps, "o1");
    const sweep = await runTelegramSweep(deps);
    expect(sent).toHaveLength(1);
    expect(sweep.reminders).toBe(0);
  });
});

describe("runTelegramSweep", () => {
  it("reminds once when 2 hours or less remain, not before", async () => {
    const early = facts({ outreachId: "early", announcedAt: hoursAgo(20) }); // 4h left
    const due = facts({ outreachId: "due", startupName: "Orbit", announcedAt: hoursAgo(22.5) }); // 1.5h left
    const { deps, sent } = setup([early, due]);
    // both "found" alerts were delivered earlier
    await deps.store.claim("found", "early", {});
    await deps.store.claim("found", "due", {});

    const first = await runTelegramSweep(deps);
    expect(first).toMatchObject({ found: 0, reminders: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Orbit");
    expect(sent[0]).toContain("1h 30m left");

    const second = await runTelegramSweep(deps);
    expect(second.reminders).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("skips closed windows and drafts that are no longer open", async () => {
    const { deps, sent } = setup([facts({ outreachId: "late", announcedAt: hoursAgo(25) })]);
    await runTelegramSweep(deps);
    expect(sent).toHaveLength(0);
  });

  it("backfills a found alert that was never delivered", async () => {
    const { deps, sent } = setup([facts()]);
    const r = await runTelegramSweep(deps);
    expect(r.found).toBe(1);
    expect(sent[0]).toContain("New startup found");
  });

  it("reports delivery failures without throwing", async () => {
    const { deps } = setup([facts()], { fail: true });
    const r = await runTelegramSweep(deps);
    expect(r.failures).toEqual(["Nimbus AI: Telegram 500"]);
  });
});

describe("sendTelegram", () => {
  const cfg = { token: "123:SECRET", chatId: "42" };
  it("posts HTML to the bot's sendMessage endpoint", async () => {
    let call: { url: string; body: Record<string, unknown> } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      call = { url, body: JSON.parse(init.body as string) };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await sendTelegram(cfg, "<b>hi</b>", fetchImpl)).toEqual({ ok: true });
    expect(call!.url).toBe("https://api.telegram.org/bot123:SECRET/sendMessage");
    expect(call!.body).toMatchObject({ chat_id: "42", text: "<b>hi</b>", parse_mode: "HTML" });
  });

  it("surfaces Telegram's reason and never leaks the token", async () => {
    const bad = (async () => new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 })) as unknown as typeof fetch;
    expect(await sendTelegram(cfg, "x", bad)).toEqual({ ok: false, error: "Telegram 400: Bad Request: chat not found" });
    const down = (async () => { throw new Error("getaddrinfo failed for https://api.telegram.org/bot123:SECRET/sendMessage"); }) as unknown as typeof fetch;
    const r = await sendTelegram(cfg, "x", down);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
});
