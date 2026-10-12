import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMintListing } from "@/lib/sources/mint";

const html = readFileSync("tests/fixtures/mint-startups.html", "utf8");

describe("Mint start-ups listing parser", () => {
  const items = parseMintListing(html);

  it("extracts startup articles with absolute urls, headlines and unique urls", () => {
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(new Set(items.map((i) => i.sourceUrl)).size).toBe(items.length);
    for (const i of items) {
      expect(i.sourceUrl).toMatch(/^https:\/\/www\.livemint\.com\/companies\/start-ups\/.+\.html$/);
      expect(i.headline.length).toBeGreaterThan(10);
    }
  });

  it("dates each article from its id (first-publish time), consistent with the card day", () => {
    const d = items.find((i) => /dailyobjects/.test(i.sourceUrl));
    expect(d?.publishedAt?.toISOString().slice(0, 10)).toBe("2026-10-08");
    expect(d?.headline).toContain("DailyObjects raises");
  });

  it("carries the ItemList description as the snippet when present", () => {
    expect(items.some((i) => i.snippet)).toBe(true);
  });

  it("returns nothing (not a crash) for an unrelated page", () => {
    expect(parseMintListing("<html><body><p>hello</p></body></html>")).toEqual([]);
  });
});
