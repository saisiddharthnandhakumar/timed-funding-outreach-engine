import { defaultFetcher, RateLimiter, RetryableHttpError, withRetry, type PageFetcher } from "@/lib/contacts/http";
import { safeFetch } from "@/lib/net/safe-fetch";
import { RobotsGuard } from "@/lib/contacts/robots";
import { canonicalizeUrl, errorMessage } from "@/lib/util/text";
import type { FetchedPage, SiteContext } from "./types";

const CACHE_TTL_MS = 10 * 60_000;
const DEFAULT_GAP_MS = 600;

/**
 * Conservative fetching for first-party investor sites: robots.txt is honoured, requests to one host are spaced,
 * transient failures are retried a bounded number of times (by the shared fetcher), and identical GETs inside a
 * process are served from a short cache so a run never asks twice for the same page.
 */
export function createSiteContext(opts: {
  now?: Date;
  windowDays?: number;
  maxPages?: number;
  knownUrls?: Set<string>;
  fetcher?: PageFetcher;
  /** Raise the per-response size cap above the shared default (e.g. a site whose index page is ~3 MB). */
  maxBytes?: number;
  gapMs?: number;
  notes?: string[];
}): SiteContext {
  const fetcher: PageFetcher =
    opts.fetcher ??
    (opts.maxBytes
      ? (url) =>
          withRetry(async () => {
            const res = await safeFetch(url, { timeoutMs: 15_000, maxBytes: opts.maxBytes });
            if (res.status === 429 || res.status >= 500) throw new RetryableHttpError(res.status, `HTTP ${res.status} for ${url}`);
            return res;
          })
      : defaultFetcher);
  const robots = new RobotsGuard(fetcher);
  const limiter = new RateLimiter(opts.gapMs ?? DEFAULT_GAP_MS);
  const cache = new Map<string, { at: number; page: Promise<FetchedPage> }>();
  const known = opts.knownUrls ?? new Set<string>();

  return {
    now: opts.now ?? new Date(),
    windowDays: opts.windowDays ?? 14,
    maxPages: opts.maxPages ?? 12,
    isKnownUrl: (url) => known.has(canonicalizeUrl(url)),
    note: (m) => void opts.notes?.push(m),
    fetch(url) {
      const hit = cache.get(url);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.page;
      const page = (async (): Promise<FetchedPage> => {
        if (!(await robots.allowed(url))) throw new Error(`robots.txt disallows ${url}`);
        await limiter.wait(new URL(url).host);
        const res = await fetcher(url);
        return { url: res.url, status: res.status, text: res.text };
      })();
      cache.set(url, { at: Date.now(), page });
      // Don't cache failures: the next caller should get a fresh attempt.
      page.catch((err) => {
        cache.delete(url);
        opts.notes?.push(`${url}: ${errorMessage(err)}`);
      });
      return page;
    },
  };
}
