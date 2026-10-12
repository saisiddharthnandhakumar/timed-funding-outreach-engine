import { registrableDomain, sameCompanyDomain, textMentionsName } from "./names";
import { normalizeCompanyName } from "@/lib/util/text";
import { isUsableEmail } from "./extract";
import { RateLimiter } from "./http";
import type { ContactCandidate, FounderRef } from "./types";

export interface GithubResponse {
  status: number;
  json: unknown;
  /** `x-ratelimit-remaining` header when present. */
  remaining: number | null;
}
export type GithubFetch = (url: string) => Promise<GithubResponse>;

export function realGithubFetch(token?: string): GithubFetch {
  return async (url) => {
    const res = await fetch(url, {
      headers: { accept: "application/vnd.github+json", "user-agent": "TimedFundingOutreachEngine/1.0", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(12_000),
    });
    const rem = res.headers.get("x-ratelimit-remaining");
    return { status: res.status, json: res.status === 204 ? null : await res.json().catch(() => null), remaining: rem == null ? null : Number(rem) };
  };
}

interface GhUser { login: string; html_url: string; name: string | null; company: string | null; blog: string | null; bio: string | null; email: string | null }
interface GhOrg { login: string; html_url: string; name: string | null; blog: string | null; email: string | null; description: string | null }

const hostOf = (blog: string | null): string | null => {
  if (!blog) return null;
  try {
    return new URL(/^https?:/i.test(blog) ? blog : `https://${blog}`).hostname;
  } catch {
    return null;
  }
};

/**
 * Free public-API discovery: a GitHub profile/org that voluntarily lists a public email.
 * We never mine commit metadata (privacy, and mostly noreply addresses). Unauthenticated GitHub allows
 * ~60 requests/hour (set GITHUB_TOKEN for 5000); when the quota is exhausted we stop and report it.
 */
export class GithubProvider {
  quotaExhausted = false;
  constructor(private readonly get: GithubFetch, private readonly limiter = new RateLimiter(1_000)) {}

  private async call<T>(url: string): Promise<T | null> {
    if (this.quotaExhausted) return null;
    await this.limiter.wait("github");
    const res = await this.get(url);
    if (res.remaining != null && res.remaining <= 1) this.quotaExhausted = true;
    if (res.status === 403 || res.status === 429) {
      this.quotaExhausted = true;
      return null;
    }
    if (res.status === 404 || res.status >= 400) return null;
    return res.json as T;
  }

  async founderEmail(founder: FounderRef, company: { name: string; domain: string | null }): Promise<ContactCandidate | null> {
    const found = await this.call<{ items?: { login: string }[] }>(`https://api.github.com/search/users?q=${encodeURIComponent(`${founder.name} in:name`)}&per_page=5`);
    const norm = normalizeCompanyName(company.name);
    for (const item of (found?.items ?? []).slice(0, 3)) {
      const u = await this.call<GhUser>(`https://api.github.com/users/${encodeURIComponent(item.login)}`);
      if (!u || !u.name || !textMentionsName(u.name, founder.name)) continue;
      const email = u.email?.toLowerCase() ?? null;
      if (!email || !isUsableEmail(email)) continue;
      const blogHost = hostOf(u.blog);
      const assoc: string[] = [];
      if (u.company && normalizeCompanyName(u.company).includes(norm) && norm.length >= 4) assoc.push(`GitHub company field "${u.company}"`);
      if (company.domain && blogHost && sameCompanyDomain(blogHost, company.domain)) assoc.push(`profile website ${blogHost}`);
      if (u.bio && norm.length >= 4 && normalizeCompanyName(u.bio).includes(norm)) assoc.push("bio mentions the company");
      if (company.domain && sameCompanyDomain(email.split("@")[1], company.domain)) assoc.push("email is on the company domain");
      if (assoc.length === 0) continue; // same name, no tie to this company: do not guess
      return {
        kind: "founder", email, contactUrl: null, founderId: founder.id, founderName: founder.name, mailboxRole: null,
        status: "publicly_confirmed", source: "github", sourceUrl: u.html_url,
        evidence: `GitHub profile "${u.login}" publishes this email; name matches; ${assoc.join("; ")}`, mxValid: null, confidence: 80,
      };
    }
    return null;
  }

  async companyEmail(company: { name: string; domain: string | null }): Promise<ContactCandidate | null> {
    const slugs = new Set<string>();
    const n = normalizeCompanyName(company.name);
    if (n.length >= 3) slugs.add(n);
    if (company.domain) slugs.add(registrableDomain(company.domain).split(".")[0]);
    for (const slug of slugs) {
      const o = await this.call<GhOrg>(`https://api.github.com/orgs/${encodeURIComponent(slug)}`);
      if (!o?.email || !isUsableEmail(o.email)) continue;
      const blogHost = hostOf(o.blog);
      const tied = (company.domain && blogHost && sameCompanyDomain(blogHost, company.domain)) || (company.domain && sameCompanyDomain(o.email.split("@")[1], company.domain));
      if (!tied) continue;
      return {
        kind: "company", email: o.email.toLowerCase(), contactUrl: null, founderId: null, founderName: null, mailboxRole: "general",
        status: "publicly_confirmed", source: "github", sourceUrl: o.html_url, evidence: `GitHub organization "${o.login}" publishes this contact email and links to the company website`, mxValid: null, confidence: 75,
      };
    }
    return null;
  }
}
