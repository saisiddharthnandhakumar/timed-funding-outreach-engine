import type { PageFetcher } from "./http";

interface Rules {
  allow: string[];
  disallow: string[];
  /** Server/robots could not be read and policy says assume closed. */
  denyAll: boolean;
}

const OUR_TOKENS = ["timedfundingoutreachengine", "*"];

function parse(body: string): Rules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: { agents: string[]; allow: string[]; disallow: string[]; sawRule: boolean } | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || cur.sawRule) {
        cur = { agents: [], allow: [], disallow: [], sawRule: false };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === "allow" || key === "disallow")) {
      cur.sawRule = true;
      if (val) (key === "allow" ? cur.allow : cur.disallow).push(val);
    }
  }
  // The most specific matching group wins (our token before "*").
  for (const token of OUR_TOKENS) {
    const g = groups.filter((x) => x.agents.includes(token));
    if (g.length) return { allow: g.flatMap((x) => x.allow), disallow: g.flatMap((x) => x.disallow), denyAll: false };
  }
  return { allow: [], disallow: [], denyAll: false };
}

function matches(pattern: string, path: string): boolean {
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

/** robots.txt guard: 4xx/missing = allowed, 5xx/unreadable = not allowed (be conservative). Cached per origin. */
export class RobotsGuard {
  private readonly cache = new Map<string, Promise<Rules>>();
  constructor(private readonly fetcher: PageFetcher) {}

  private rulesFor(origin: string): Promise<Rules> {
    let p = this.cache.get(origin);
    if (!p) {
      p = this.fetcher(`${origin}/robots.txt`).then(
        (res) => (res.status >= 500 ? { allow: [], disallow: [], denyAll: true } : res.status >= 400 ? { allow: [], disallow: [], denyAll: false } : parse(res.text)),
        (err) => {
          // 5xx after retries → closed; other failures (DNS, timeout) → closed too: if we can't read policy we don't crawl.
          void err;
          return { allow: [], disallow: [], denyAll: true };
        },
      );
      this.cache.set(origin, p);
    }
    return p;
  }

  async allowed(rawUrl: string): Promise<boolean> {
    const url = new URL(rawUrl);
    const rules = await this.rulesFor(url.origin);
    if (rules.denyAll) return false;
    const path = url.pathname + url.search;
    let best: { len: number; allow: boolean } | null = null;
    for (const p of rules.disallow) if (matches(p, path) && (!best || p.length > best.len)) best = { len: p.length, allow: false };
    for (const p of rules.allow) if (matches(p, path) && (!best || p.length >= best.len)) best = { len: p.length, allow: true };
    return best ? best.allow : true;
  }
}
