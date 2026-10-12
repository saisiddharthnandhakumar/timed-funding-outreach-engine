import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import type { AIService } from "@/lib/gemini/service";
import { generateLinkedInDm } from "@/lib/gemini/tasks";
import type { StartupProfile } from "@/lib/gemini/schemas";
import type { PipelineLogger } from "@/lib/pipeline/logger";
import { SupabaseBudget } from "@/lib/contacts/budget";
import { errorMessage } from "@/lib/util/text";

export interface LinkedInTarget {
  url: string;
  name: string;
  role: string | null;
}

const PROFILE_URL = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9%_\-]+/gi;
const clean = (u: string) => u.replace(/^http:/i, "https:").replace(/^https:\/\/[a-z]{2,3}\.linkedin/i, "https://www.linkedin").replace(/\/+$/, "");
const slugOf = (u: string) => decodeURIComponent(u.split("/in/")[1] ?? "").toLowerCase();
/** A profile slug normally contains part of the person's name; this guards against the model pairing a name with the wrong URL. */
export const slugMatchesName = (url: string, name: string) => name.toLowerCase().split(/\s+/).some((t) => t.length >= 3 && slugOf(url).includes(t.replace(/[^a-z]/g, "")));

/** Pull "Name | Role | URL" lines out of the grounded answer; keep only people whose URL fits their name. */
export function parseTargets(text: string, known: { name: string }[]): LinkedInTarget[] {
  const out: LinkedInTarget[] = [];
  for (const line of text.split("\n")) {
    const urls = line.match(PROFILE_URL);
    if (!urls) continue;
    const url = clean(urls[0]);
    const parts = line.replace(PROFILE_URL, "").split(/\s*\|\s*|\s+[–—-]\s+|:\s+|\s{2,}/).map((p) => p.replace(/[*_`[\]()]/g, "").trim()).filter(Boolean);
    const knownMatch = known.find((k) => line.toLowerCase().includes(k.name.toLowerCase()));
    const name = knownMatch?.name ?? parts[0];
    if (!name || name.split(/\s+/).length > 5 || !slugMatchesName(url, name)) continue;
    const role = parts.find((p, i) => i > 0 && p !== name && p.length < 60) ?? null;
    if (!out.some((t) => t.url === url)) out.push({ url, name, role });
  }
  return out;
}

const SENIORITY = /founder|ceo|chief executive|co-?founder|cto|coo|managing director|head|director|vp|president/i;

/**
 * Look up a LinkedIn profile for a founder, else another senior member of the team, with Google-grounded search
 * (no scraping of LinkedIn itself). A URL is accepted only if the answer names it AND the search actually cited
 * linkedin.com, and its slug has to fit the person's name.
 */
export async function findLinkedInTarget(
  ai: AIService,
  input: { companyName: string; domain: string | null; founders: { name: string; role: string | null; linkedin_url: string | null }[] },
): Promise<LinkedInTarget | null> {
  if (!(await new SupabaseBudget().consume("gemini_search", env().CONTACT_SEARCH_MONTHLY_BUDGET))) return null;
  const names = input.founders.map((f) => `${f.name}${f.role ? ` (${f.role})` : ""}`).join(", ");
  const res = await ai.generateGrounded({
    task: "linkedin_search",
    system:
      "You find PUBLIC LinkedIn profile URLs using Google Search. Report a profile only if a search result shows it. Never guess or construct a URL. Answer with one line per person in exactly this format: Full Name | Role | https://www.linkedin.com/in/... . If you find nothing, say 'none found'.",
    prompt: `Company: "${input.companyName}"${input.domain ? ` (${input.domain})` : ""}. Known founders: ${names || "unknown"}.\nFind the LinkedIn profile of a founder first. If no founder profile is found, find another senior member of the team (CEO, CTO, head of growth, head of partnerships).`,
  });
  const cited = res.sources.some((s) => /linkedin\.com/i.test(`${s.title ?? ""} ${s.url}`));
  if (!cited) return null;
  const targets = parseTargets(res.text, input.founders);
  const isFounder = (t: LinkedInTarget) => input.founders.some((f) => f.name.toLowerCase() === t.name.toLowerCase());
  return targets.find(isFounder) ?? targets.find((t) => SENIORITY.test(t.role ?? "")) ?? targets[0] ?? null;
}

export type LinkedInOutcome = { status: "created"; target: LinkedInTarget } | { status: "not_found" } | { status: "skipped"; reason: string } | { status: "failed"; message: string };

/**
 * For a draft with no usable email, find a person on LinkedIn and write a cold DM for the scout to send by hand
 * (LinkedIn forbids automated messaging, so nothing is ever sent from here). Never throws.
 */
export async function attachLinkedInDm(ai: AIService, outreachId: string, opts: { force?: boolean; log?: PipelineLogger } = {}): Promise<LinkedInOutcome> {
  try {
    const row = (await db().from("outreach").select("id,startup_id,funding_round_id,recipient_email,linkedin_message,fit_assessments(positive_signals),funding_rounds(stage,amount,currency)").eq("id", outreachId).maybeSingle()).data as
      | { id: string; startup_id: string; recipient_email: string | null; linkedin_message: string | null; fit_assessments: { positive_signals: string[] } | null; funding_rounds: { stage: string; amount: number | null; currency: string | null } | null }
      | null;
    if (!row) return { status: "skipped", reason: "draft not found" };
    if (!opts.force && (row.recipient_email || row.linkedin_message)) return { status: "skipped", reason: row.recipient_email ? "has an email recipient" : "already has a LinkedIn DM" };

    const startup = (await db().from("startups").select("name,domain,profile_json").eq("id", row.startup_id).single()).data as { name: string; domain: string | null; profile_json: StartupProfile | null } | null;
    if (!startup?.profile_json) return { status: "skipped", reason: "startup not researched yet" };
    const founders = ((await db().from("founders").select("name,role,linkedin_url").eq("startup_id", row.startup_id)).data ?? []) as { name: string; role: string | null; linkedin_url: string | null }[];

    const target = await findLinkedInTarget(ai, { companyName: startup.name, domain: startup.domain, founders });
    if (!target) {
      await opts.log?.event("startup", row.startup_id, "linkedin_not_found", `${startup.name}: no LinkedIn profile found for a founder or team member`);
      return { status: "not_found" };
    }
    const dm = await generateLinkedInDm(ai, {
      senderName: env().OUTREACH_SENDER_NAME ?? "Rohit",
      acceleratorName: env().ACCELERATOR_NAME ?? "our accelerator",
      profile: startup.profile_json,
      funding: { stage: row.funding_rounds?.stage ?? "unknown", amount: row.funding_rounds?.amount == null ? null : Number(row.funding_rounds.amount), currency: row.funding_rounds?.currency ?? null },
      recipientName: target.name,
      recipientRole: target.role,
      positiveSignals: row.fit_assessments?.positive_signals ?? [],
    });
    const res = await db().from("outreach").update({ linkedin_url: target.url, linkedin_recipient: target.name, linkedin_role: target.role, linkedin_message: dm.message.trim() }).eq("id", outreachId);
    if (res.error) throw new Error(res.error.message);
    await opts.log?.event("outreach", outreachId, "linkedin_dm_created", `${startup.name}: LinkedIn DM drafted for ${target.name}`, { url: target.url });
    return { status: "created", target };
  } catch (err) {
    await opts.log?.event("outreach", outreachId, "linkedin_failed", errorMessage(err));
    return { status: "failed", message: errorMessage(err) };
  }
}
