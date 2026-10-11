import { createHash } from "node:crypto";

/**
 * Trailing tokens that rarely distinguish one company from another in funding news
 * ("Nimbus" vs "Nimbus AI" vs "Nimbus Technologies Pvt Ltd"). Always keeps at least one token.
 */
const LEGAL_SUFFIXES = new Set([
  "pvt", "private", "ltd", "limited", "llp", "inc", "incorporated", "corp", "corporation", "llc",
  "technologies", "technology", "technologys", "solutions", "systems", "software", "india",
  "ai", "labs", "lab", "tech", "io", "app", "apps", "hq",
]);

/** Lowercase, strip accents/punctuation and generic suffixes: "Sunfox Technologies Pvt. Ltd." → "sunfox"; "Nimbus AI" → "nimbus". */
export function normalizeCompanyName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ");
  const tokens = base.split(/\s+/).filter(Boolean);
  if (tokens[0] === "the") tokens.shift();
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("");
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|source$|from$|ns_)/i;

/** Stable article identity: lowercase host without www, no fragment/tracking params/trailing slash. */
export function canonicalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  let out = u.toString();
  if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
  return out.replace(/^http:\/\//, "https://");
}

export function domainFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export function sha256(...parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\u0000");
  return h.digest("hex");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function hoursBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 3_600_000;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Run `fn` over items with bounded parallelism, preserving per-item error isolation. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
