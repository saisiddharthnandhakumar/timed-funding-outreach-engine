import { describe, expect, it } from "vitest";
import { MemoryBudget } from "@/lib/contacts/budget";
import { candidateFromHunter, HunterFinder, type FounderEmailFinder, type HunterHit } from "@/lib/contacts/hunter";
import { enrichStartupContacts } from "@/lib/contacts/pipeline";
import { QuotaExhaustedError } from "@/lib/contacts/verify";
import { fakeSite, FOUNDERS, makeDeps, MemoryStore } from "./helpers";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("HunterFinder", () => {
  it("calls Email Finder with the key in a header, never in the URL, and maps the response", async () => {
    let seen: { url: URL; headers: Headers } | null = null;
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      seen = { url, headers: new Headers(init.headers) };
      return json(200, { data: { email: "Asha@Nimbus.example", score: 94, verification: { status: "valid" }, sources: [{ uri: "https://nimbus.example/team", still_on_page: true }, { uri: "https://old.example", still_on_page: false }] } });
    }) as unknown as typeof fetch;
    const hit = await new HunterFinder("secret-key", fetchImpl).find({ domain: "nimbus.example", firstName: "asha", lastName: "rao" });
    expect(hit).toEqual({ email: "asha@nimbus.example", score: 94, verification: "valid", sourceUrls: ["https://nimbus.example/team"] });
    expect(seen!.url.searchParams.get("domain")).toBe("nimbus.example");
    expect(seen!.url.toString()).not.toContain("secret-key");
    expect(seen!.headers.get("x-api-key")).toBe("secret-key");
  });

  it("returns null when Hunter has no address, and signals an exhausted quota on 429/402", async () => {
    const make = (status: number, body: unknown = {}) => new HunterFinder("k", (async () => json(status, body)) as unknown as typeof fetch);
    const q = { domain: "nimbus.example", firstName: "asha", lastName: "rao" };
    expect(await make(200, { data: { email: null } }).find(q)).toBeNull();
    expect(await make(404).find(q)).toBeNull();
    await expect(make(429).find(q)).rejects.toBeInstanceOf(QuotaExhaustedError);
    await expect(make(402).find(q)).rejects.toBeInstanceOf(QuotaExhaustedError);
    await expect(make(401).find(q)).rejects.toThrow(/API key/);
    await expect(make(500).find(q)).rejects.toThrow(/HTTP 500/);
  });
});

describe("candidateFromHunter", () => {
  const hit = (over: Partial<HunterHit> = {}): HunterHit => ({ email: "asha@nimbus.example", score: 90, verification: "valid", sourceUrls: [], ...over });

  it("only a valid mailbox becomes provider_verified", () => {
    expect(candidateFromHunter(FOUNDERS[0], hit(), "nimbus.example")).toMatchObject({ status: "provider_verified", source: "hunter", founderName: "Asha Rao" });
    expect(candidateFromHunter(FOUNDERS[0], hit({ verification: "accept_all" }), "nimbus.example")!.status).toBe("domain_valid_only");
    expect(candidateFromHunter(FOUNDERS[0], hit({ verification: null }), "nimbus.example")!.status).toBe("domain_valid_only");
  });

  it("rejects an address on a different domain", () => {
    expect(candidateFromHunter(FOUNDERS[0], hit({ email: "asha@elsewhere.example" }), "nimbus.example")).toBeNull();
  });
});

describe("pipeline with Hunter", () => {
  const finder = (answer: (first: string) => HunterHit | null, calls: string[] = []): FounderEmailFinder => ({
    name: "hunter",
    find: async ({ firstName }) => {
      calls.push(firstName);
      return answer(firstName);
    },
  });
  const setup = (f: FounderEmailFinder, budget = new MemoryBudget(), limit = 20) => {
    const store = new MemoryStore();
    store.addStartup("s1", {}, FOUNDERS);
    const deps = makeDeps(store, { fetcher: fakeSite({}), finder: f, budget });
    deps.config.finderMonthlyLimit = limit;
    return { deps, store };
  };

  it("a Hunter-valid founder address is preferred and prefills the draft", async () => {
    const calls: string[] = [];
    const { deps, store } = setup(finder((first) => (first === "asha" ? { email: "asha@nimbus.example", score: 95, verification: "valid", sourceUrls: [] } : null), calls));
    const out = await enrichStartupContacts(deps, "s1");
    expect(out).toMatchObject({ preferredType: "founder", preferredEmail: "asha@nimbus.example" });
    expect(store.preferred("s1")).toMatchObject({ status: "provider_verified", source: "hunter" });
    expect(store.drafts).toEqual([{ startupId: "s1", recipient: "asha@nimbus.example" }]);
    expect(calls).toEqual(["asha", "vikram"]);
  });

  it("an accept_all answer is stored but never used for outreach", async () => {
    const { deps, store } = setup(finder((first) => ({ email: `${first}@nimbus.example`, score: 80, verification: "accept_all", sourceUrls: [] })));
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.preferredEmail).toBeNull();
    expect(store.contacts.get("s1")!.filter((c) => c.source === "hunter").every((c) => c.status === "domain_valid_only")).toBe(true);
    expect(store.drafts).toEqual([]);
  });

  it("stops at the monthly budget and says so", async () => {
    const calls: string[] = [];
    const { deps } = setup(finder(() => null, calls), new MemoryBudget(), 1);
    const out = await enrichStartupContacts(deps, "s1");
    expect(calls).toHaveLength(1);
    expect(out.warnings.join(" ")).toContain("monthly email-finder budget exhausted");
  });

  it("a founder who already has a confirmed address costs no lookup", async () => {
    const calls: string[] = [];
    const store = new MemoryStore();
    store.addStartup("s1", {}, [FOUNDERS[0]]);
    const site = fakeSite({ "/team": `<html><body><p>Asha Rao, CEO — <a href="mailto:asha@nimbus.example">asha@nimbus.example</a></p></body></html>`, "/": `<html><body><a href="/team">Team</a></body></html>` });
    const deps = makeDeps(store, { fetcher: site, finder: finder(() => null, calls) });
    await enrichStartupContacts(deps, "s1");
    expect(store.preferred("s1")?.status).toBe("publicly_confirmed");
    expect(calls).toEqual([]);
  });

  it("a Hunter outage degrades to a warning; the run still completes", async () => {
    const { deps } = setup({ name: "hunter", find: async () => { throw new Error("Hunter email finder HTTP 500"); } });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.status).not.toBe("completed");
    expect(out.warnings.join(" ")).toContain("HTTP 500");
  });
});
