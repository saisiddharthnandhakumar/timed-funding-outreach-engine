import { describe, expect, it } from "vitest";
import { FOUNDERS, MemoryStore, enrichStartupContacts, fakeSite, makeDeps } from "./helpers";

const O = "https://found.example";
const page = (body: string) => `<html><body>${body}</body></html>`;

/** A startup with NO stored website: contact search must find the site itself and then scrape its contact pages. */
describe("contact search without a stored website", () => {
  class Store extends MemoryStore {
    saved: string[] = [];
    async saveWebsite(_id: string, website: string) { this.saved.push(website); }
  }
  const pages = {
    [`${O}/`]: page(`<a href="/contact">Contact us</a>`),
    [`${O}/contact`]: page(`<p>Partnerships: <a href="mailto:hello@found.example">hello@found.example</a></p>`),
  };

  it("resolves the website, stores it, crawls the contact page and prefers the published company email", async () => {
    const store = new Store();
    store.addStartup("s1", { website: null, domain: null, name: "Found Co" }, [FOUNDERS[0]]);
    const deps = makeDeps(store, { fetcher: fakeSite(pages), resolveWebsite: async (name) => (name === "Found Co" ? `${O}/` : null) });
    const out = await enrichStartupContacts(deps, "s1");
    expect(store.saved).toEqual([`${O}/`]);
    expect(out).toMatchObject({ status: "completed", preferredType: "company", preferredEmail: "hello@found.example" });
    expect(out.warnings.join(" ")).not.toMatch(/no official website/);
  });

  it("still reports 'no website' (and doesn't fail) when the resolver finds nothing", async () => {
    const store = new Store();
    store.addStartup("s1", { website: null, domain: null, name: "Found Co" }, [FOUNDERS[0]]);
    const out = await enrichStartupContacts(makeDeps(store, { fetcher: fakeSite(pages), resolveWebsite: async () => null }), "s1");
    expect(store.saved).toEqual([]);
    expect(out.status).not.toBe("completed");
    expect(out.warnings.join(" ")).toMatch(/no official website/);
  });

  it("does nothing new for a startup that already has a website", async () => {
    const store = new Store();
    store.addStartup("s1", { website: `${O}/`, domain: "found.example", name: "Found Co" }, [FOUNDERS[0]]);
    let called = false;
    await enrichStartupContacts(makeDeps(store, { fetcher: fakeSite(pages), resolveWebsite: async () => { called = true; return null; } }), "s1");
    expect(called).toBe(false);
  });
});
