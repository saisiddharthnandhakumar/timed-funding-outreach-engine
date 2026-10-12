export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  /** Max results wanted (providers may return fewer). */
  num?: number;
  /** ISO country code to bias results (default "in": this product tracks Indian startups). */
  country?: string;
}

/** A web search API. Implementations never log or expose their key. */
export interface SearchProvider {
  readonly name: "serper" | "tavily";
  search(query: string, opts?: SearchOptions): Promise<SearchHit[]>;
}

export class SearchHttpError extends Error {
  constructor(readonly provider: string, readonly status: number, detail: string) {
    super(`${provider} search failed: HTTP ${status}${detail ? ` (${detail.slice(0, 160)})` : ""}`);
  }
}
