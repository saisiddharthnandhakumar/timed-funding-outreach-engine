import { SearchHttpError, type SearchHit, type SearchOptions, type SearchProvider } from "./types";

/** Serper.dev: Google results as JSON (title, link, snippet). Best for finding the right URL. */
export class SerperProvider implements SearchProvider {
  readonly name = "serper" as const;
  constructor(
    private readonly apiKey: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const res = await this.http("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: opts.country ?? "in", num: opts.num ?? 8 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new SearchHttpError(this.name, res.status, await res.text().catch(() => ""));
    const json = (await res.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
    return (json.organic ?? []).flatMap((o) => (typeof o.link === "string" && /^https?:\/\//.test(o.link) ? [{ title: o.title ?? "", url: o.link, snippet: o.snippet ?? "" }] : []));
  }
}
