import { MemoryBudget } from "@/lib/contacts/budget";
import { GithubProvider, type GithubFetch } from "@/lib/contacts/github";
import type { PageFetcher } from "@/lib/contacts/http";
import { enrichStartupContacts, type ContactDeps, type ContactStore } from "@/lib/contacts/pipeline";
import { RobotsGuard } from "@/lib/contacts/robots";
import type { WebSearch } from "@/lib/contacts/search";
import { contactKey, type ContactStatus, type FounderRef, type StartupRef, type StoredContact } from "@/lib/contacts/types";
import { MxChecker, type DnsResolver } from "@/lib/contacts/verify";

export class MemoryStore implements ContactStore {
  startups = new Map<string, StartupRef>();
  founders = new Map<string, FounderRef[]>();
  contacts = new Map<string, StoredContact[]>();
  drafts: { startupId: string; recipient: string | null }[] = [];
  saves = 0;
  failSaveFor: string | null = null;

  addStartup(id: string, over: Partial<StartupRef> = {}, founders: FounderRef[] = []) {
    this.startups.set(id, { id, name: "Nimbus AI", website: "https://nimbus.example/", domain: "nimbus.example", contactStatus: "pending", contactCheckedAt: null, ...over });
    this.founders.set(id, founders);
  }
  async loadStartup(id: string) { return this.startups.get(id) ?? null; }
  async loadFounders(id: string) { return this.founders.get(id) ?? []; }
  async loadContacts(id: string) { return structuredClone(this.contacts.get(id) ?? []); }
  async saveContacts(id: string, c: StoredContact[]) {
    if (this.failSaveFor === id) throw new Error("db write failed");
    this.saves++;
    this.contacts.set(id, structuredClone(c));
  }
  async setPreferred(id: string, key: string | null) {
    for (const c of this.contacts.get(id) ?? []) c.isPreferred = key != null && contactKey(c) === key;
  }
  async updateStartup(id: string, p: { status: ContactStatus; checkedAt: string; error: string | null }) {
    const s = this.startups.get(id)!;
    s.contactStatus = p.status;
    s.contactCheckedAt = p.checkedAt;
  }
  async applyRecipientToOpenDrafts(id: string, _name: string | null, email: string) {
    this.drafts.push({ startupId: id, recipient: email });
    return 1;
  }
  preferred(id: string) { return (this.contacts.get(id) ?? []).find((c) => c.isPreferred) ?? null; }
}

/** Fake website: path → html. Unlisted paths 404. `/robots.txt` may be provided. */
export function fakeSite(pages: Record<string, string>, opts: { down?: boolean; origin?: string } = {}): PageFetcher {
  const origin = opts.origin ?? "https://nimbus.example";
  return async (url) => {
    if (opts.down) throw new Error("fetch failed");
    const u = new URL(url);
    const key = u.origin + u.pathname;
    const body = pages[key] ?? pages[u.pathname];
    if (body == null) return { url, status: 404, contentType: "text/html", text: "" };
    void origin;
    return { url, status: 200, contentType: u.pathname === "/robots.txt" ? "text/plain" : "text/html", text: body };
  };
}

export const resolver = (mxFor: (d: string) => boolean | "error" = () => true): DnsResolver => ({
  async resolveMx(d) {
    const r = mxFor(d);
    if (r === "error") throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
    if (!r) throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
    return [{ exchange: `mx.${d}`, priority: 10 }];
  },
  async resolve4() { throw Object.assign(new Error("nx"), { code: "ENODATA" }); },
  async resolve6() { throw Object.assign(new Error("nx"), { code: "ENODATA" }); },
});

export function githubWith(handler: (url: string) => { status?: number; json?: unknown; remaining?: number }): GithubProvider {
  const fetcher: GithubFetch = async (url) => {
    const r = handler(url);
    return { status: r.status ?? 200, json: r.json ?? null, remaining: r.remaining ?? 50 };
  };
  return new GithubProvider(fetcher, { wait: async () => undefined } as never);
}

export function makeDeps(store: MemoryStore, over: Partial<ContactDeps> & { fetcher: PageFetcher }): ContactDeps {
  return {
    store,
    robots: new RobotsGuard(over.fetcher),
    mx: new MxChecker(resolver()),
    github: null,
    search: null,
    verifier: null,
    budget: new MemoryBudget(),
    config: { maxPages: 8, reenrichDays: 14, verifierMonthlyLimit: 40, maxVerificationsPerCompany: 3, crawlDelayMs: 0 },
    now: () => new Date("2026-10-12T10:00:00Z"),
    ...over,
  };
}

export const FOUNDERS: FounderRef[] = [
  { id: "f1", name: "Asha Rao", role: "Co-founder & CEO" },
  { id: "f2", name: "Vikram Shah", role: "Co-founder & CTO" },
];

export const noSearch: WebSearch | null = null;
export { enrichStartupContacts };
