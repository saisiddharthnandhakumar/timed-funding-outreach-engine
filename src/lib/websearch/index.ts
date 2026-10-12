import { env } from "@/lib/env";
import { SupabaseBudget, type Budget } from "@/lib/contacts/budget";
import { errorMessage } from "@/lib/util/text";
import { SerperProvider } from "./serper";
import { TavilyProvider } from "./tavily";
import type { SearchHit, SearchOptions, SearchProvider } from "./types";

export type { SearchHit, SearchOptions, SearchProvider } from "./types";

/**
 * Serper and Tavily behind one budgeted interface. Both are optional (no key → no service), both are capped per month
 * so a free plan is never exceeded, and a failure of one never breaks the caller: it returns what the other found, or [].
 * Search results are only ever used to find pages to fetch or context for research; an address in a snippet is never trusted.
 */
export class SearchService {
  constructor(
    private readonly providers: { serper?: SearchProvider; tavily?: SearchProvider },
    private readonly budget: Budget,
    private readonly limits: { serper: number; tavily: number },
    readonly notes: string[] = [],
  ) {}

  private async run(p: SearchProvider | undefined, query: string, opts?: SearchOptions): Promise<SearchHit[] | null> {
    if (!p) return null;
    try {
      if (!(await this.budget.consume(p.name, this.limits[p.name]))) {
        this.notes.push(`${p.name}: monthly search budget used up`);
        return null;
      }
      return await p.search(query, opts);
    } catch (err) {
      this.notes.push(`${p.name}: ${errorMessage(err)}`);
      return null;
    }
  }

  /** Find pages (a company's site, a profile, a contact page): Serper's Google results first, Tavily if that is unavailable. */
  async find(query: string, opts?: SearchOptions): Promise<SearchHit[]> {
    return (await this.run(this.providers.serper, query, opts)) ?? (await this.run(this.providers.tavily, query, opts)) ?? [];
  }

  /** Context for research: Tavily's page text first, Serper's snippets if that is unavailable. */
  async context(query: string, opts?: SearchOptions): Promise<SearchHit[]> {
    return (await this.run(this.providers.tavily, query, opts)) ?? (await this.run(this.providers.serper, query, opts)) ?? [];
  }
}

let cached: SearchService | null | undefined;

/** The production service, or null when neither key is configured. */
export function getSearch(): SearchService | null {
  if (cached !== undefined) return cached;
  const e = env();
  const serper = e.SERPER_API_KEY ? new SerperProvider(e.SERPER_API_KEY) : undefined;
  const tavily = e.TAVILY_API_KEY ? new TavilyProvider(e.TAVILY_API_KEY) : undefined;
  cached = serper || tavily ? new SearchService({ serper, tavily }, new SupabaseBudget(), { serper: e.SERPER_MONTHLY_BUDGET, tavily: e.TAVILY_MONTHLY_BUDGET }) : null;
  return cached;
}
