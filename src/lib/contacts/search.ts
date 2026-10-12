import { assertPublicHttpUrl } from "@/lib/net/safe-fetch";
import type { AIService } from "@/lib/gemini/service";
import { errorMessage } from "@/lib/util/text";
import type { Budget } from "./budget";
import type { PageFetcher } from "./http";
import type { RobotsGuard } from "./robots";
import type { FounderRef } from "./types";

export interface SearchPage {
  url: string;
  html: string;
}
export interface SearchOutcome {
  pages: SearchPage[];
  /** Addresses the model mentioned (NOT yet seen on any fetched page; must be treated as unverified). */
  modelEmails: string[];
  notes: string[];
  budgetExhausted: boolean;
}
export interface WebSearch {
  search(ctx: { companyName: string; domain: string | null; founders: FounderRef[] }): Promise<SearchOutcome>;
}

const SOCIAL = ["linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com", "tiktok.com", "reddit.com", "quora.com", "t.me", "wa.me", "whatsapp.com"];
export const isSocial = (host: string) => SOCIAL.some((d) => host === d || host.endsWith(`.${d}`));

/** Follow ONE redirect hop (Gemini grounding links are wrapped redirects) without fetching the target. */
export async function resolveRedirect(url: string): Promise<string> {
  const u = await assertPublicHttpUrl(url);
  if (!/(^|\.)vertexaisearch\.cloud\.google\.com$|(^|\.)google\.com$/.test(u.hostname)) return url;
  const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
  await res.body?.cancel();
  const loc = res.headers.get("location");
  return loc ? new URL(loc, u).toString() : url;
}

/**
 * Compliant free search: Gemini with Google Search grounding (the same free-tier mechanism the research stage
 * already uses). Search itself is Google's grounded API, no scraping of result pages and no CAPTCHA handling.
 * We never trust the model's text for an address: the cited pages are fetched (robots.txt respected) and the
 * address must literally appear on them.
 */
export class GroundedWebSearch implements WebSearch {
  constructor(
    private readonly ai: AIService,
    private readonly fetcher: PageFetcher,
    private readonly robots: RobotsGuard,
    private readonly budget: Budget,
    private readonly opts: { monthlyLimit: number; maxPages: number; resolve?: (url: string) => Promise<string> },
  ) {}

  async search(ctx: { companyName: string; domain: string | null; founders: FounderRef[] }): Promise<SearchOutcome> {
    const out: SearchOutcome = { pages: [], modelEmails: [], notes: [], budgetExhausted: false };
    if (!(await this.budget.consume("gemini_search", this.opts.monthlyLimit))) {
      out.budgetExhausted = true;
      out.notes.push("monthly web-search budget exhausted");
      return out;
    }
    const names = ctx.founders.map((f) => f.name).join(", ") || "the founders";
    const res = await this.ai.generateGrounded({
      task: "contact_search",
      system:
        "You find PUBLICLY PUBLISHED professional contact emails using Google Search. Report an email only if it literally appears on a page you found; give the page URL. Never guess or construct addresses. If nothing is published, say 'none found'.",
      prompt: `Company: "${ctx.companyName}"${ctx.domain ? ` (website domain ${ctx.domain})` : ""}. Founders: ${names}.\nSearch for professionally published email addresses of the founders (e.g. on the company site, their personal site, interviews, press pages, investor or directory profiles) and the company's published contact email. List each address with the exact page URL where it is published.`,
    });
    for (const m of res.text.matchAll(/[a-z0-9][a-z0-9._%+-]*@(?:[a-z0-9-]+\.)+[a-z]{2,}/gi)) out.modelEmails.push(m[0].toLowerCase());

    const resolve = this.opts.resolve ?? resolveRedirect;
    for (const s of res.sources) {
      if (out.pages.length >= this.opts.maxPages) break;
      try {
        const target = await resolve(s.url);
        const host = new URL(target).hostname;
        if (isSocial(host)) continue;
        if (!(await this.robots.allowed(target))) {
          out.notes.push(`robots.txt disallows ${target}`);
          continue;
        }
        const page = await this.fetcher(target);
        if (page.status < 400 && /html|text/i.test(page.contentType)) out.pages.push({ url: page.url, html: page.text });
      } catch (err) {
        out.notes.push(`${s.url}: ${errorMessage(err)}`);
      }
    }
    return out;
  }
}
