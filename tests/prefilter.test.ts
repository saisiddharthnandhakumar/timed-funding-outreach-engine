import { describe, expect, it } from "vitest";
import { looksLikeFundingNews } from "@/lib/pipeline/prefilter";

describe("funding prefilter", () => {
  it.each([
    "Nimbus AI raises $2.5M seed round led by Example Ventures",
    "NeoGrowth raises ₹85 crore funding from FMO, LeapFrog Investments",
    "Robotics startup secures pre-seed funding",
  ])("keeps %s", (h) => expect(looksLikeFundingNews(h, null)).toBe(true));
  it.each([
    "New-Age Tech Stocks Gain This Week, MobiKwik Surges 25%",
    "TechSparks masterclass: Gemini, AI, and the business of building better",
    "ShuruKar: Your next business could start in your hometown",
  ])("drops %s", (h) => expect(looksLikeFundingNews(h, null)).toBe(false));
});
