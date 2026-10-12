import { describe, expect, it } from "vitest";
import { enrichMany } from "@/lib/contacts/pipeline";
import type { WebSearch } from "@/lib/contacts/search";
import { MemoryBudget } from "@/lib/contacts/budget";
import { FOUNDERS, MemoryStore, enrichStartupContacts, fakeSite, githubWith, makeDeps, resolver } from "./helpers";
import { MxChecker } from "@/lib/contacts/verify";

const O = "https://nimbus.example";
const page = (body: string) => `<html><body>${body}</body></html>`;
const HOME = page(`<a href="/team">Team</a> <a href="/contact">Contact</a>`);

function setup(pages: Record<string, string>, founders = FOUNDERS, over: Record<string, unknown> = {}) {
  const store = new MemoryStore();
  store.addStartup("s1", {}, founders);
  const fetcher = fakeSite({ [`${O}/`]: HOME, ...pages });
  const deps = makeDeps(store, { fetcher, ...over });
  return { store, deps, fetcher };
}

describe("contact enrichment pipeline (all external services mocked)", () => {
  it("1. one founder with a published email → preferred founder contact, publicly_confirmed, draft prefilled", async () => {
    const { store, deps } = setup({ [`${O}/team`]: page(`<div><h3>Asha Rao</h3><p>Co-founder &amp; CEO</p><a href="mailto:asha@nimbus.example">Email</a></div>`) }, [FOUNDERS[0]]);
    const out = await enrichStartupContacts(deps, "s1");
    expect(out).toMatchObject({ status: "completed", preferredType: "founder", preferredEmail: "asha@nimbus.example" });
    expect(store.preferred("s1")).toMatchObject({ kind: "founder", status: "publicly_confirmed", sourceUrl: `${O}/team`, founderName: "Asha Rao" });
    expect(store.startups.get("s1")!.contactStatus).toBe("completed");
    expect(store.drafts).toEqual([{ startupId: "s1", recipient: "asha@nimbus.example" }]);
  });

  it("2. several founders with several published emails → all kept, one preferred (the CEO)", async () => {
    const { store, deps } = setup({
      [`${O}/team`]: page(`<div><h3>Vikram Shah</h3><a href="mailto:vikram@nimbus.example">x</a></div><div><h3>Asha Rao</h3><a href="mailto:asha@nimbus.example">x</a></div>`),
    });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.founderEmails).toBe(2);
    const founderRows = store.contacts.get("s1")!.filter((c) => c.kind === "founder" && c.status === "publicly_confirmed");
    expect(founderRows.map((c) => c.email).sort()).toEqual(["asha@nimbus.example", "vikram@nimbus.example"]);
    expect(store.preferred("s1")!.email).toBe("asha@nimbus.example");
  });

  it("3. founder identified, no founder email → falls back to the published company email", async () => {
    const { store, deps } = setup({ [`${O}/contact`]: page(`<p>Write to hello@nimbus.example or support@nimbus.example</p>`) });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out).toMatchObject({ status: "completed", preferredType: "company", preferredEmail: "hello@nimbus.example" });
    expect(store.preferred("s1")).toMatchObject({ kind: "company", mailboxRole: "general", status: "publicly_confirmed" });
  });

  it("4. founder email found through a free API (GitHub) when the site has none", async () => {
    const github = githubWith((url) => {
      if (url.includes("/search/users")) return { json: { items: [{ login: "ashar" }] } };
      if (url.includes("/users/ashar")) return { json: { login: "ashar", html_url: "https://github.com/ashar", name: "Asha Rao", company: "Nimbus AI", blog: "https://nimbus.example", bio: null, email: "asha.rao@gmail.com" } };
      return { status: 404 };
    });
    const { store, deps } = setup({}, [FOUNDERS[0]], { github });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out).toMatchObject({ status: "completed", preferredType: "founder", preferredEmail: "asha.rao@gmail.com" });
    expect(store.preferred("s1")).toMatchObject({ source: "github", status: "publicly_confirmed", sourceUrl: "https://github.com/ashar" });
  });

  it("4b. a same-named GitHub user with no tie to the company is ignored", async () => {
    const github = githubWith((url) => {
      if (url.includes("/search/users")) return { json: { items: [{ login: "otherasha" }] } };
      if (url.includes("/users/")) return { json: { login: "otherasha", html_url: "u", name: "Asha Rao", company: "Some Other Co", blog: "https://elsewhere.dev", bio: "dev", email: "asha@elsewhere.dev" } };
      return { status: 404 };
    });
    const { store, deps } = setup({}, [FOUNDERS[0]], { github });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.preferredEmail).toBeNull();
    expect((store.contacts.get("s1") ?? []).some((c) => c.email === "asha@elsewhere.dev")).toBe(false);
  });

  it("5. only guessed founder emails + a published company email → company is preferred; guesses stored but never used", async () => {
    const { store, deps } = setup({ [`${O}/contact`]: page(`<p>info@nimbus.example</p>`) });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.preferredType).toBe("company");
    const guesses = store.contacts.get("s1")!.filter((c) => c.status === "pattern_guessed");
    expect(guesses.length).toBeGreaterThan(0);
    expect(guesses.every((g) => !g.isPreferred && g.source === "pattern")).toBe(true);
    expect(store.drafts[0].recipient).toBe("info@nimbus.example");
  });

  it("5b. guesses alone never become the preferred contact or fill a draft", async () => {
    const { store, deps } = setup({});
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.status).toBe("not_found");
    expect(store.preferred("s1")).toBeNull();
    expect(store.drafts).toEqual([]);
  });

  it("6. no founder email, no company email → not_found (and a contact form is used only if one exists)", async () => {
    const { store, deps } = setup({ [`${O}/team`]: page(`<h3>Asha Rao</h3><p>CEO</p>`) });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out).toMatchObject({ status: "not_found", preferredType: "not_found", preferredEmail: null });
    expect(store.startups.get("s1")!.contactStatus).toBe("not_found");

    const withForm = setup({ [`${O}/contact`]: page(`<form><input name="email"><textarea name="m"></textarea></form>`) });
    const o2 = await enrichStartupContacts(withForm.deps, "s1");
    expect(o2).toMatchObject({ status: "completed", preferredType: "contact_form", preferredEmail: null });
    expect(withForm.store.drafts).toEqual([]); // a form is not an email recipient
  });

  it("7. API quota exhausted (GitHub rate limit, search budget) → pipeline continues and records why", async () => {
    const github = githubWith(() => ({ status: 403, json: { message: "rate limit" }, remaining: 0 }));
    const search: WebSearch = { search: async () => ({ pages: [], modelEmails: [], notes: ["monthly web-search budget exhausted"], budgetExhausted: true }) };
    const { deps } = setup({ [`${O}/contact`]: page(`<p>team@nimbus.example</p>`) }, FOUNDERS, { github, search });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.status).toBe("completed"); // website still delivered a company email
    expect(out.preferredEmail).toBe("team@nimbus.example");
    expect(out.warnings.join(" ")).toMatch(/github: API quota exhausted/);
    expect(out.warnings.join(" ")).toMatch(/budget exhausted/);
  });

  it("8a. website down → status failed when every attempted source failed (retried next run, not cached)", async () => {
    const store = new MemoryStore();
    store.addStartup("s1", {}, FOUNDERS);
    const deps = makeDeps(store, { fetcher: fakeSite({}, { down: true }) });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.status).toBe("failed");
    expect(store.startups.get("s1")!.contactStatus).toBe("failed");
    // a failed result must not be treated as "recently checked"
    const again = await enrichStartupContacts(deps, "s1");
    expect(again.skippedReason).toBeUndefined();
  });

  it("8b. robots.txt blocks the crawl → nothing fetched from the site, run does not crash", async () => {
    const { deps, store } = setup({ "/robots.txt": "User-agent: *\nDisallow: /", [`${O}/team`]: page(`<a href="mailto:asha@nimbus.example">Asha Rao</a>`) });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.preferredEmail).toBeNull();
    expect(out.warnings.join(" ")).toMatch(/robots\.txt/);
    expect(store.startups.get("s1")!.contactStatus).not.toBe("pending");
  });

  it("9. repeated enrichment: skipped within the interval, forced re-run is idempotent and never downgrades", async () => {
    const { store, deps } = setup({ [`${O}/team`]: page(`<div><h3>Asha Rao</h3><a href="mailto:asha@nimbus.example">x</a></div>`) }, [FOUNDERS[0]]);
    await enrichStartupContacts(deps, "s1");
    const savesAfterFirst = store.saves;
    const second = await enrichStartupContacts(deps, "s1");
    expect(second).toMatchObject({ status: "skipped", skippedReason: "recent" });
    expect(store.saves).toBe(savesAfterFirst);

    // site now returns nothing; forced re-run keeps the confirmed address and creates no duplicates
    const deps2 = makeDeps(store, { fetcher: fakeSite({}) });
    const forced = await enrichStartupContacts(deps2, "s1", { force: true });
    expect(forced.preferredEmail).toBe("asha@nimbus.example");
    const rows = store.contacts.get("s1")!;
    expect(rows.filter((c) => c.email === "asha@nimbus.example")).toHaveLength(1);
    expect(rows.find((c) => c.email === "asha@nimbus.example")!.status).toBe("publicly_confirmed");

    // after the interval it re-checks on its own
    const later = makeDeps(store, { fetcher: fakeSite({}), now: () => new Date("2026-11-30T00:00:00Z") });
    expect((await enrichStartupContacts(later, "s1")).skippedReason).toBeUndefined();
  });

  it("10. a batch of 50 with partial failures: others complete; concurrency is bounded", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 50; i++) store.addStartup(`s${i}`, { name: `Co${i}` }, [FOUNDERS[0]]);
    store.failSaveFor = "s7";
    let live = 0;
    let maxLive = 0;
    const base = fakeSite({ [`${O}/`]: HOME, [`${O}/contact`]: page(`<p>hello@nimbus.example</p>`) });
    const fetcher = async (u: string) => {
      live++;
      maxLive = Math.max(maxLive, live);
      await new Promise((r) => setTimeout(r, 2));
      live--;
      return base(u);
    };
    const deps = makeDeps(store, { fetcher });
    const outcomes = await enrichMany(deps, Array.from({ length: 50 }, (_, i) => `s${i}`), { concurrency: 3 });
    expect(outcomes).toHaveLength(50);
    expect(outcomes.filter((o) => o.status === "failed").map((o) => o.startupId)).toEqual(["s7"]);
    expect(outcomes.filter((o) => o.status === "completed")).toHaveLength(49);
    expect(maxLive).toBeLessThanOrEqual(3);
    expect(store.startups.get("s7")!.contactStatus).toBe("failed");
  });

  it("a domain with no mail server cannot make a confirmed contact", async () => {
    const { deps, store } = setup({ [`${O}/contact`]: page(`<p>hello@nimbus.example</p>`) }, FOUNDERS, { mx: new MxChecker(resolver(() => false)) });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out.preferredEmail).toBeNull();
    expect(store.contacts.get("s1")!.find((c) => c.email === "hello@nimbus.example")).toMatchObject({ status: "unverified", mxValid: false });
  });

  it("an optional provider upgrades a guessed founder email to provider_verified (budgeted); 'accept_all' does not", async () => {
    const verifier = { name: "hunter", verify: async (e: string) => (e.startsWith("asha@") ? ("valid" as const) : ("accept_all" as const)) };
    const { deps, store } = setup({}, [FOUNDERS[0]], { verifier, budget: new MemoryBudget() });
    const out = await enrichStartupContacts(deps, "s1");
    expect(out).toMatchObject({ preferredType: "founder", preferredEmail: "asha@nimbus.example" });
    expect(store.preferred("s1")!.status).toBe("provider_verified");
    expect(store.contacts.get("s1")!.find((c) => c.email === "asha.rao@nimbus.example")!.status).toBe("pattern_guessed");
  });

  it("web search: only addresses literally present on a fetched page count; model-only mentions stay unverified", async () => {
    const search: WebSearch = {
      search: async () => ({
        pages: [{ url: "https://press.example/nimbus-interview", html: page(`<p>Asha Rao, CEO of Nimbus, can be reached at asha@nimbus.example.</p>`) }],
        modelEmails: ["asha@nimbus.example", "ghost@nimbus.example"],
        notes: [], budgetExhausted: false,
      }),
    };
    const { deps, store } = setup({}, [FOUNDERS[0]], { search });
    const out = await enrichStartupContacts(deps, "s1");
    const rows = store.contacts.get("s1")!;
    expect(rows.find((c) => c.email === "asha@nimbus.example")).toMatchObject({ source: "web_search", sourceUrl: "https://press.example/nimbus-interview", status: "publicly_confirmed" });
    expect(rows.find((c) => c.email === "ghost@nimbus.example")).toMatchObject({ status: "unverified" });
    expect(out.preferredEmail).toBe("asha@nimbus.example");
  });
});
