import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FetchedPage, SiteContext } from "@/lib/investors/types";
import { cardToEntry, indiaquotient, matchIqCard, parseIqPortfolio } from "@/lib/investors/sites/indiaquotient";

const html = readFileSync("tests/fixtures/investors/indiaquotient-portfolio.html", "utf8");

function fakeCtx(pages: Record<string, FetchedPage>) {
  const fetched: string[] = [];
  const ctx: SiteContext = {
    now: new Date("2026-10-12T00:00:00Z"),
    windowDays: 30,
    maxPages: 6,
    isKnownUrl: () => false,
    note: () => undefined,
    fetch: async (url) => {
      fetched.push(url);
      return pages[url] ?? { url, status: 404, text: "" };
    },
  };
  return { ctx, fetched };
}

describe("India Quotient portfolio parser", () => {
  const cards = parseIqPortfolio(html);

  it("parses unique cards with website, description, sector, founders and exit flag", () => {
    expect(cards.map((c) => c.slug)).toEqual(["convin-ai", "maino-ai", "topmate", "neodove", "supermilege", "sharechat"]);
    const neo = cards.find((c) => c.slug === "neodove")!;
    expect(neo.website).toBe("https://neodove.com/");
    expect(neo.description).toBe("Contact centre for lead management and telecalling");
    expect(neo.sector).toBe("Enterprise & Software");
    expect(neo.founders[0].name).toBe("Arpit Khandelwal");
    expect(neo.exited).toBe(true);
    expect(cards.find((c) => c.slug === "sharechat")!.exited).toBe(false);
  });

  it("returns [] for an unrelated page", () => {
    expect(parseIqPortfolio("<html><body><p>hi</p></body></html>")).toEqual([]);
  });

  it("matches by domain or by normalized name, never loosely", () => {
    expect(matchIqCard(cards, { name: "Convin Technologies Pvt Ltd", domain: null })?.slug).toBe("convin-ai");
    expect(matchIqCard(cards, { name: "Whatever", domain: "www.topmate.io" })?.slug).toBe("topmate");
    expect(matchIqCard(cards, { name: "Neo", domain: null })).toBeNull();
    expect(matchIqCard(cards, { name: "Nonexistent Robotics", domain: "nonexistent.example" })).toBeNull();
  });

  it("maps a card to a PortfolioEntry without inventing stage/year/rationale", () => {
    const e = cardToEntry(cards.find((c) => c.slug === "topmate")!);
    expect(e.stage).toBeNull();
    expect(e.partneredYear).toBeNull();
    expect(e.rationale).toEqual([]);
    expect(e.status).toBe("active");
    expect(e.pageUrl).toBe("https://www.indiaquotient.in/portfolio#topmate");
  });
});

describe("India Quotient site", () => {
  it("has no discovery role", () => {
    expect(indiaquotient.roles).toEqual(["enrichment", "verification"]);
    expect(indiaquotient.discover).toBeUndefined();
  });

  it("findEntry makes one listing fetch and returns the match; a miss returns null with no extra fetches", async () => {
    const url = "https://www.indiaquotient.in/portfolio";
    const { ctx, fetched } = fakeCtx({ [url]: { url, status: 200, text: html } });
    expect((await indiaquotient.findEntry!(ctx, { name: "Sharechat", domain: "sharechat.com" }))?.companyName).toBe("Sharechat");
    expect(await indiaquotient.findEntry!(ctx, { name: "Made Up Co", domain: null })).toBeNull();
    expect(fetched.every((u) => u === url)).toBe(true);
  });

  it("returns null on a non-200 listing", async () => {
    const { ctx } = fakeCtx({});
    expect(await indiaquotient.findEntry!(ctx, { name: "Topmate", domain: null })).toBeNull();
  });
});
