import { describe, expect, it } from "vitest";
import { SearchService } from "@/lib/websearch";
import { SerperProvider } from "@/lib/websearch/serper";
import { TavilyProvider } from "@/lib/websearch/tavily";
import { researchSearchDocs } from "@/lib/websearch/research";
import { MemoryBudget } from "@/lib/contacts/budget";
import { resolveOfficialWebsite } from "@/lib/research/website";
import { pickProfileFromHits } from "@/lib/outreach/linkedin";
import { ApiWebSearch, ChainedWebSearch } from "@/lib/contacts/search-api";
import { RobotsGuard } from "@/lib/contacts/robots";
import type { SearchHit, SearchProvider } from "@/lib/websearch/types";

const hit = (url: string, title = "", snippet = ""): SearchHit => ({ url, title, snippet });
const fake = (name: "serper" | "tavily", impl: (q: string) => SearchHit[] | Error): SearchProvider & { calls: string[] } => {
  const calls: string[] = [];
  return { name, calls, async search(q) { calls.push(q); const r = impl(q); if (r instanceof Error) throw r; return r; } };
};
const svc = (serper?: SearchProvider, tavily?: SearchProvider, limits = { serper: 100, tavily: 100 }) => new SearchService({ serper, tavily }, new MemoryBudget(), limits);

describe("SearchService", () => {
  it("finds pages with Serper, falls back to Tavily when Serper fails, and never throws", async () => {
    const s = fake("serper", () => new Error("HTTP 429"));
    const t = fake("tavily", () => [hit("https://a.example")]);
    const service = svc(s, t);
    expect(await service.find("q")).toEqual([hit("https://a.example")]);
    expect(service.notes.join(" ")).toMatch(/serper: .*429/);
    expect(await svc(s).find("q")).toEqual([]);
  });

  it("uses Tavily first for research context", async () => {
    const s = fake("serper", () => [hit("https://s.example")]);
    const t = fake("tavily", () => [hit("https://t.example")]);
    expect((await svc(s, t).context("q"))[0].url).toBe("https://t.example");
    expect(s.calls).toEqual([]);
  });

  it("stops calling a provider once its monthly budget is used, so a free plan can't be exceeded", async () => {
    const s = fake("serper", () => [hit("https://s.example")]);
    const service = svc(s, undefined, { serper: 2, tavily: 0 });
    await service.find("a"); await service.find("b");
    expect(await service.find("c")).toEqual([]);
    expect(s.calls).toHaveLength(2);
    expect(service.notes.join(" ")).toMatch(/budget used up/);
  });
});

describe("providers", () => {
  it("Serper: sends the key in a header (not the URL), asks for India, and maps organic results", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const http = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ organic: [{ title: "T", link: "https://x.example/", snippet: "S" }, { title: "bad", link: "javascript:x" }] })); }) as unknown as typeof fetch;
    const out = await new SerperProvider("SECRET", http).search("tessolve", { num: 3 });
    expect(out).toEqual([{ title: "T", url: "https://x.example/", snippet: "S" }]);
    expect(seen!.url).not.toContain("SECRET");
    expect((seen!.init.headers as Record<string, string>)["X-API-KEY"]).toBe("SECRET");
    expect(JSON.parse(seen!.init.body as string)).toMatchObject({ q: "tessolve", gl: "in", num: 3 });
  });

  it("Tavily: bearer auth, basic depth, maps content to snippets; errors never contain the key", async () => {
    const ok = (async () => new Response(JSON.stringify({ results: [{ title: "A", url: "https://a.example", content: "text" }] }))) as unknown as typeof fetch;
    expect(await new TavilyProvider("SECRET", ok).search("q")).toEqual([{ title: "A", url: "https://a.example", snippet: "text" }]);
    const bad = (async () => new Response("quota", { status: 432 })) as unknown as typeof fetch;
    await expect(new TavilyProvider("SECRET", bad).search("q")).rejects.toThrow(/HTTP 432/);
    await expect(new TavilyProvider("SECRET", bad).search("q")).rejects.not.toThrow(/SECRET/);
  });
});

const page = (title: string, extra = "") => `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>${"Acme Robotics builds robots. ".repeat(40)}</p>${extra}</body></html>`;

describe("website lookup through search", () => {
  const fetcher = async (url: string) => {
    const pages: Record<string, string> = { "https://acmerobots.io/": page("Acme Robotics"), "https://tracxn.com/": page("Acme Robotics profile") };
    if (!pages[url]) throw new Error("fetch failed");
    return { url, status: 200, contentType: "text/html", text: pages[url] };
  };
  it("skips directories and social, verifies the remaining site names the company", async () => {
    const search = svc(fake("serper", () => [hit("https://tracxn.com/d/acme"), hit("https://www.linkedin.com/company/acme"), hit("https://acmerobots.io/about")]));
    const r = await resolveOfficialWebsite("Acme Robotics Pvt Ltd", { dns: async () => false, fetcher, search });
    expect(r?.url).toBe("https://acmerobots.io/");
  });
  it("returns nothing when no result is verifiably the company", async () => {
    const search = svc(fake("serper", () => [hit("https://tracxn.com/d/acme")]));
    expect(await resolveOfficialWebsite("Acme Robotics", { dns: async () => false, fetcher, search })).toBeNull();
  });
});

describe("LinkedIn profile from search hits", () => {
  it("requires the profile slug to fit the person and the hit to mention the company", () => {
    const hits = [
      hit("https://www.linkedin.com/in/someone-else", "Someone Else - CEO - Acme | LinkedIn", "Acme"),
      hit("https://in.linkedin.com/in/asha-rao-123", "Asha Rao - Co-founder - Acme Robotics | LinkedIn", "Acme Robotics"),
    ];
    expect(pickProfileFromHits(hits, { company: "Acme Robotics", name: "Asha Rao", role: "CEO" })).toEqual({ url: "https://www.linkedin.com/in/asha-rao-123", name: "Asha Rao", role: "CEO" });
    expect(pickProfileFromHits([hit("https://www.linkedin.com/in/asha-rao-123", "Asha Rao - Designer | LinkedIn", "Other Co")], { company: "Acme Robotics", name: "Asha Rao" })).toBeNull();
  });
  it("accepts a profile that doesn't name the company only when other results tie the person to it", () => {
    const profile = hit("https://www.linkedin.com/in/srini-chinamilli-9468a82", "Srini Chinamilli - San Jose, California", "500+ connections");
    const news = hit("https://www.tessolve.com/news/ceo", "Tessolve Co-founder & CEO Srini Chinamilli featured", "Srini Chinamilli, CEO of Tessolve");
    expect(pickProfileFromHits([profile, news], { company: "Tessolve Semiconductor", name: "Srini Chinamilli" })?.url).toBe("https://www.linkedin.com/in/srini-chinamilli-9468a82");
    expect(pickProfileFromHits([profile], { company: "Tessolve Semiconductor", name: "Srini Chinamilli" })).toBeNull(); // no corroboration
    const unrelated = hit("https://news.example/x", "Some other story", "nothing relevant");
    expect(pickProfileFromHits([profile, unrelated], { company: "Tessolve Semiconductor", name: "Srini Chinamilli" })).toBeNull();
  });
  it("reads an unnamed founder from the result title", () => {
    const r = pickProfileFromHits([hit("https://www.linkedin.com/in/ravi-menon-9", "Ravi Menon - Founder & CEO - Acme Robotics | LinkedIn", "")], { company: "Acme Robotics" });
    expect(r).toMatchObject({ url: "https://www.linkedin.com/in/ravi-menon-9", name: "Ravi Menon", role: "Founder & CEO" });
  });
});

describe("contact-page discovery through search", () => {
  const pages: Record<string, string> = {
    "https://acme.example/contact": "<html><body>Write to <a href='mailto:hello@acme.example'>hello@acme.example</a></body></html>",
    "https://press.example/interview": "<html><body>Interview</body></html>",
  };
  const fetcher = async (url: string) => {
    if (url.endsWith("/robots.txt")) return { url, status: 404, contentType: "text/plain", text: "" };
    if (!pages[url]) return { url, status: 404, contentType: "text/html", text: "" };
    return { url, status: 200, contentType: "text/html", text: pages[url] };
  };
  const ctx = { companyName: "Acme", domain: "acme.example", founders: [{ id: "f", name: "Asha Rao", role: "CEO" }] };

  it("fetches company pages first, skips social, and never takes an address from a snippet", async () => {
    const search = svc(fake("serper", () => [hit("https://press.example/interview", "t", "ask asha@fake.example"), hit("https://www.linkedin.com/in/x"), hit("https://acme.example/contact")]));
    const out = await new ApiWebSearch(search, fetcher as never, new RobotsGuard(fetcher as never), { maxPages: 4 }).search(ctx);
    expect(out.pages.map((p) => p.url)).toEqual(["https://acme.example/contact", "https://press.example/interview"]);
    expect(out.modelEmails).toEqual([]);
  });

  it("asks for the site's contact page and each founder, at most three searches", () => {
    expect(ApiWebSearch.queries({ ...ctx, founders: [...ctx.founders, { id: "g", name: "B", role: null }, { id: "h", name: "C", role: null }] })).toEqual(["site:acme.example contact email", '"Asha Rao" "Acme" email', '"B" "Acme" email']);
  });

  it("only falls through to the next search (Gemini) when the first found no pages", async () => {
    let second = 0;
    const empty = { async search() { return { pages: [], modelEmails: [], notes: [], budgetExhausted: false }; } };
    const next = { async search() { second++; return { pages: [{ url: "u", html: "h" }], modelEmails: [], notes: [], budgetExhausted: false }; } };
    const withPages = { async search() { return { pages: [{ url: "p", html: "h" }], modelEmails: [], notes: [], budgetExhausted: false }; } };
    expect((await new ChainedWebSearch([empty, next]).search(ctx)).pages).toHaveLength(1);
    expect(second).toBe(1);
    await new ChainedWebSearch([withPages, next]).search(ctx);
    expect(second).toBe(1);
  });
});

describe("research context", () => {
  it("keeps substantive non-social results (max four) as web_search documents", async () => {
    const long = "x".repeat(120);
    const s = { async context() { return [hit("https://linkedin.com/posts/a", "p", long), hit("https://a.example", "A", long), hit("https://b.example", "B", "short"), hit("https://c.example", "C", long)]; } };
    const docs = await researchSearchDocs("Acme", s as never);
    expect(docs.map((d) => d.url)).toEqual(["https://a.example", "https://c.example"]);
    expect(docs[0]).toMatchObject({ kind: "web_search", title: "A" });
    expect(await researchSearchDocs("Acme", null)).toEqual([]);
  });
});
