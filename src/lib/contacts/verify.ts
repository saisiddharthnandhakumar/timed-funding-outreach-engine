import { promises as dns } from "node:dns";

const SYNTAX = /^[a-z0-9._%+-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

export function isSyntaxValid(email: string): boolean {
  const e = email.trim();
  if (e.length > 254 || !SYNTAX.test(e)) return false;
  const [local] = e.split("@");
  return !local.includes("..") && !local.startsWith(".") && !local.endsWith(".");
}

export interface DnsResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

const DEFINITE_NO = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

/**
 * "Can this domain receive mail at all?" via MX (falling back to A/AAAA per RFC 5321).
 * true/false = DNS answer; null = lookup inconclusive (timeout, SERVFAIL).
 * A valid MX does NOT prove that a specific mailbox exists.
 */
export class MxChecker {
  private readonly cache = new Map<string, Promise<boolean | null>>();
  constructor(private readonly resolver: DnsResolver = dns) {}

  check(domain: string): Promise<boolean | null> {
    const d = domain.toLowerCase();
    let p = this.cache.get(d);
    if (!p) {
      p = this.lookup(d);
      this.cache.set(d, p);
    }
    return p;
  }

  private async lookup(domain: string): Promise<boolean | null> {
    try {
      const mx = await this.resolver.resolveMx(domain);
      if (mx.length) return !(mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".")); // RFC 7505 "null MX"
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (!DEFINITE_NO.has(code)) return null;
    }
    try {
      if ((await this.resolver.resolve4(domain)).length) return true;
    } catch (err) {
      if (!DEFINITE_NO.has((err as { code?: string }).code ?? "")) return null;
    }
    try {
      return (await this.resolver.resolve6(domain)).length > 0;
    } catch (err) {
      return DEFINITE_NO.has((err as { code?: string }).code ?? "") ? false : null;
    }
  }
}

/** Result of an optional provider mailbox check. */
export type ProviderVerdict = "valid" | "invalid" | "accept_all" | "unknown";

export interface EmailVerifier {
  readonly name: string;
  verify(email: string): Promise<ProviderVerdict>;
}

/** Hunter's email-verifier endpoint (free plan: limited monthly verifications). Optional; used only with HUNTER_API_KEY. */
export class HunterVerifier implements EmailVerifier {
  readonly name = "hunter";
  constructor(private readonly apiKey: string, private readonly fetchJson: typeof fetch = fetch) {}
  async verify(email: string): Promise<ProviderVerdict> {
    const url = new URL("https://api.hunter.io/v2/email-verifier");
    url.searchParams.set("email", email);
    const res = await this.fetchJson(url, { headers: { "X-API-KEY": this.apiKey }, signal: AbortSignal.timeout(15_000) }); // key in a header, never in the URL
    if (res.status === 429 || res.status === 402 || res.status === 403) throw new QuotaExhaustedError("hunter");
    if (!res.ok) throw new Error(`Hunter verifier HTTP ${res.status}`);
    const status = ((await res.json()) as { data?: { status?: string } }).data?.status;
    if (status === "valid") return "valid";
    if (status === "invalid") return "invalid";
    if (status === "accept_all") return "accept_all";
    return "unknown";
  }
}

export class QuotaExhaustedError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} quota exhausted`);
  }
}
