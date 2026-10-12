import { errorMessage } from "@/lib/util/text";
import { isNotOfficial } from "@/lib/research/website";
import type { SearchService } from "@/lib/websearch";
import { registrableDomain } from "./names";
import type { PageFetcher } from "./http";
import type { RobotsGuard } from "./robots";
import { isSocial, type SearchOutcome, type WebSearch } from "./search";
import type { FounderRef } from "./types";

type Ctx = { companyName: string; domain: string | null; founders: FounderRef[] };

/**
 * Contact-page discovery through a web-search API (Serper/Tavily). The search only finds PAGES; each is then fetched
 * with our own robots-aware fetcher and the pipeline extracts addresses that literally appear on it. Nothing a
 * search snippet or summary says is ever treated as an address, so `modelEmails` is always empty here.
 */
export class ApiWebSearch implements WebSearch {
  constructor(
    private readonly api: Pick<SearchService, "find">,
    private readonly fetcher: PageFetcher,
    private readonly robots: RobotsGuard,
    private readonly opts: { maxPages: number },
  ) {}

  /** The queries worth spending credits on: the company's own contact page, then each founder (max two). */
  static queries(ctx: Ctx): string[] {
    const q: string[] = [];
    q.push(ctx.domain ? `site:${registrableDomain(ctx.domain)} contact email` : `"${ctx.companyName}" contact us email`);
    for (const f of ctx.founders.slice(0, 2)) q.push(`"${f.name}" "${ctx.companyName}" email`);
    return q;
  }

  async search(ctx: Ctx): Promise<SearchOutcome> {
    const out: SearchOutcome = { pages: [], modelEmails: [], notes: [], budgetExhausted: false };
    const company = ctx.domain ? registrableDomain(ctx.domain) : null;
    const urls: string[] = [];
    for (const query of ApiWebSearch.queries(ctx)) {
      for (const hit of await this.api.find(query, { num: 6 })) {
        try {
          const host = new URL(hit.url).hostname;
          if (isSocial(host) || isNotOfficial(host) || urls.includes(hit.url)) continue;
          urls.push(hit.url);
        } catch {
          /* skip a malformed url */
        }
      }
    }
    // The company's own pages first (most likely to hold its addresses), then third-party pages such as interviews.
    urls.sort((a, b) => Number(!!company && registrableDomain(new URL(b).hostname) === company) - Number(!!company && registrableDomain(new URL(a).hostname) === company));
    for (const url of urls) {
      if (out.pages.length >= this.opts.maxPages) break;
      try {
        if (!(await this.robots.allowed(url))) {
          out.notes.push(`robots.txt disallows ${url}`);
          continue;
        }
        const page = await this.fetcher(url);
        if (page.status < 400 && /html|text/i.test(page.contentType)) out.pages.push({ url: page.url, html: page.text });
      } catch (err) {
        out.notes.push(`${url}: ${errorMessage(err)}`);
      }
    }
    return out;
  }
}

/** Runs searches in order and stops at the first that yields pages, so Gemini's quota is only spent when the API found nothing. */
export class ChainedWebSearch implements WebSearch {
  constructor(private readonly searches: WebSearch[]) {}

  async search(ctx: Ctx): Promise<SearchOutcome> {
    const merged: SearchOutcome = { pages: [], modelEmails: [], notes: [], budgetExhausted: false };
    for (const s of this.searches) {
      const r = await s.search(ctx);
      merged.notes.push(...r.notes);
      merged.budgetExhausted = r.budgetExhausted;
      if (r.pages.length) return { ...r, notes: merged.notes };
      merged.modelEmails.push(...r.modelEmails);
    }
    return merged;
  }
}
