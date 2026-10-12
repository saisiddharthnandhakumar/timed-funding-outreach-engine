import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRow } from "@/types/domain";

/**
 * Pins how the EXISTING sources are turned into articles, so extending discovery can't change them.
 * (ET Entrepreneur / ET Startups / Inc42 / YourStory are RSS, Entrackr is a news sitemap.)
 */
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/net/safe-fetch", () => ({ safeFetch: fetchMock, assertPublicHttpUrl: async (u: string) => new URL(u) }));

import { createAdapter } from "@/lib/sources/registry";
import { NewsSitemapAdapter, RssAdapter } from "@/lib/sources/feeds";
import { looksLikeFundingNews } from "@/lib/pipeline/prefilter";

const row = (key: string, type: string, feed_url: string | null): SourceRow => ({
  id: key, key, name: key, type, base_url: "https://x.example", feed_url, enabled: true, poll_interval_minutes: 120,
  last_polled_at: null, last_success_at: null, last_items_found: 0, last_error: null, last_error_at: null,
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Acme AI raises $2M seed</title><link>https://news.example/acme</link><description>&lt;p&gt;Seed round&lt;/p&gt;</description><pubDate>Mon, 12 Oct 2026 10:00:00 +0530</pubDate></item>
<item><title>No link here</title></item></channel></rss>`;
const SITEMAP = `<?xml version="1.0"?><urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
<url><loc>https://entrackr.example/a</loc><news:news><news:publication_date>2026-10-12T05:00:00+00:00</news:publication_date><news:title>Beta raises Rs 5 Cr</news:title><news:keywords>funding</news:keywords></news:news></url></urlset>`;

beforeEach(() => fetchMock.mockReset());

describe("existing source adapters (regression)", () => {
  it("maps the five live source rows to the same generic adapters as before", () => {
    for (const k of ["et_entrepreneur", "inc42_buzz", "yourstory", "et_startups"]) expect(createAdapter(row(k, "rss", "https://f.example/feed"))).toBeInstanceOf(RssAdapter);
    expect(createAdapter(row("entrackr", "sitemap", "https://f.example/sm.xml"))).toBeInstanceOf(NewsSitemapAdapter);
  });

  it("still requires a feed_url and a known type for unregistered keys", () => {
    expect(() => createAdapter(row("custom", "rss", null))).toThrow(/no feed_url/);
    expect(() => createAdapter(row("custom", "ftp", "https://x"))).toThrow(/No adapter/);
  });

  it("parses RSS into normalised articles and skips items without a link", async () => {
    fetchMock.mockResolvedValue({ status: 200, text: RSS, contentType: "application/xml", url: "https://f.example/feed" });
    const items = await createAdapter(row("inc42_buzz", "rss", "https://f.example/feed")).fetchLatest();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sourceUrl: "https://news.example/acme", headline: "Acme AI raises $2M seed", snippet: "Seed round" });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-10-12T04:30:00.000Z");
  });

  it("parses a Google-News sitemap", async () => {
    fetchMock.mockResolvedValue({ status: 200, text: SITEMAP, contentType: "application/xml", url: "https://f.example/sm.xml" });
    const items = await createAdapter(row("entrackr", "sitemap", "https://f.example/sm.xml")).fetchLatest();
    expect(items).toEqual([expect.objectContaining({ sourceUrl: "https://entrackr.example/a", headline: "Beta raises Rs 5 Cr", snippet: "Keywords: funding" })]);
  });

  it("fails loudly (so the pipeline records a source error) on HTTP errors and empty feeds", async () => {
    fetchMock.mockResolvedValue({ status: 503, text: "", contentType: "text/html", url: "x" });
    await expect(createAdapter(row("yourstory", "rss", "https://f.example/feed")).fetchLatest()).rejects.toThrow(/HTTP 503/);
    fetchMock.mockResolvedValue({ status: 200, text: "<rss><channel></channel></rss>", contentType: "application/xml", url: "x" });
    await expect(createAdapter(row("yourstory", "rss", "https://f.example/feed")).fetchLatest()).rejects.toThrow(/no items/);
  });

  it("keeps the prefilter's behaviour for funding vs noise headlines", () => {
    expect(looksLikeFundingNews("Acme raises $2M in seed round", null)).toBe(true);
    expect(looksLikeFundingNews("Sensex ends higher as stocks rally", "market wrap")).toBe(false);
  });
});
