import { SearchHttpError, type SearchHit, type SearchOptions, type SearchProvider } from "./types";

/** Tavily: search built for AI use, returning cleaned page text per result. Best for research context. */
export class TavilyProvider implements SearchProvider {
  readonly name = "tavily" as const;
  constructor(
    private readonly apiKey: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const res = await this.http("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, search_depth: "basic", max_results: opts.num ?? 5, include_answer: false }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new SearchHttpError(this.name, res.status, await res.text().catch(() => ""));
    const json = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (json.results ?? []).flatMap((r) => (typeof r.url === "string" && /^https?:\/\//.test(r.url) ? [{ title: r.title ?? "", url: r.url, snippet: (r.content ?? "").slice(0, 1500) }] : []));
  }
}
