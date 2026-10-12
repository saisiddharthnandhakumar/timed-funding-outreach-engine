import { safeFetch, type SafeFetchResult } from "@/lib/net/safe-fetch";
import { sleep } from "@/lib/util/text";

/** Everything that fetches a web page goes through this (default: the SSRF-hardened safeFetch). */
export type PageFetcher = (url: string) => Promise<SafeFetchResult>;

export class RetryableHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Exponential backoff with full jitter. */
export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; shouldRetry?: (err: unknown) => boolean } = {}): Promise<T> {
  const { retries = 2, baseMs = 500, shouldRetry = isTransient } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      await sleep(Math.random() * baseMs * 2 ** attempt);
    }
  }
}

function isTransient(err: unknown): boolean {
  if (err instanceof RetryableHttpError) return true;
  const name = (err as { name?: string })?.name;
  const msg = String((err as { message?: string })?.message ?? "");
  // timeouts / connection resets; NOT SSRF blocks or bad URLs
  return name === "TimeoutError" || name === "AbortError" || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket/i.test(msg);
}

export const defaultFetcher: PageFetcher = (url) =>
  withRetry(async () => {
    const res = await safeFetch(url, { timeoutMs: 10_000, maxBytes: 1_500_000 });
    if (res.status === 429 || res.status >= 500) throw new RetryableHttpError(res.status, `HTTP ${res.status} for ${url}`);
    return res;
  });

/** Minimum-interval limiter per key (e.g. per host, per provider). */
export class RateLimiter {
  private readonly next = new Map<string, number>();
  constructor(private readonly minIntervalMs: number) {}
  async wait(key: string): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next.get(key) ?? 0);
    this.next.set(key, at + this.minIntervalMs);
    if (at > now) await sleep(at - now);
  }
}
