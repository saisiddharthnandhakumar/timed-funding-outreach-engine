import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { antler, parsePortfolioCards } from "@/lib/investors/sites/antler";

const html = readFileSync("tests/fixtures/investors/antler-portfolio.html", "utf8");

describe("antler portfolio cards", () => {
  const cards = parsePortfolioCards(html);

  it("parses name, location, sector, year and website", () => {
    const apni = cards.find((c) => c.name === "ApniBus");
    expect(apni).toBeDefined();
    expect(apni?.location).toBe("India");
    expect(apni?.year).toBeGreaterThan(2015);
    expect(apni?.website).toMatch(/^https?:\/\//);
    expect(apni?.sector).toBeTruthy();
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it("returns [] for unrelated or empty markup", () => {
    expect(parsePortfolioCards("<html><body>nothing</body></html>")).toEqual([]);
    expect(parsePortfolioCards("")).toEqual([]);
  });

  it("is registered as an unsupported site with no roles and no fetch methods", () => {
    expect(antler.key).toBe("antler_india");
    expect(antler.roles).toEqual([]);
    expect(antler.discover).toBeUndefined();
    expect(antler.findEntry).toBeUndefined();
  });
});
