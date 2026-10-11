import { describe, expect, it } from "vitest";
import { evaluateHardFilters, type HardFilterInput } from "@/lib/pipeline/filters";

const cfg = { allowed_countries: ["India"], allowed_stages: ["pre-seed", "seed"], max_announcement_age_hours: 24 };
const now = new Date("2026-10-11T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const base: HardFilterInput = {
  isFundingAnnouncement: true, isIndianStartup: true, hqCountry: "India", stage: "seed", announcedAt: hoursAgo(2), now,
};

describe("hard filters", () => {
  it("India + seed + <24h passes", () => {
    const r = evaluateHardFilters(cfg, base);
    expect(r.passed).toBe(true);
    expect(r.reason).toBeNull();
  });
  it("India + Series B fails with wrong_stage", () => {
    const r = evaluateHardFilters(cfg, { ...base, stage: "series-b" });
    expect(r).toMatchObject({ passed: false, reason: "wrong_stage" });
  });
  it("US + seed fails with wrong_geography", () => {
    const r = evaluateHardFilters(cfg, { ...base, hqCountry: "United States", isIndianStartup: false });
    expect(r).toMatchObject({ passed: false, reason: "wrong_geography" });
  });
  it("India + seed + 30h fails with announcement_too_old", () => {
    const r = evaluateHardFilters(cfg, { ...base, announcedAt: hoursAgo(30) });
    expect(r).toMatchObject({ passed: false, reason: "announcement_too_old" });
  });
  it("exactly 24h is still eligible; just over is not", () => {
    expect(evaluateHardFilters(cfg, { ...base, announcedAt: hoursAgo(24) }).passed).toBe(true);
    expect(evaluateHardFilters(cfg, { ...base, announcedAt: hoursAgo(24.01) }).passed).toBe(false);
  });
  it("non-funding article fails first", () => {
    expect(evaluateHardFilters(cfg, { ...base, isFundingAnnouncement: false }).reason).toBe("not_funding_announcement");
  });
  it("already contacted fails with already_contacted", () => {
    expect(evaluateHardFilters(cfg, { ...base, alreadyContacted: true })).toMatchObject({ passed: false, reason: "already_contacted" });
    expect(evaluateHardFilters(cfg, { ...base, alreadyContacted: false }).passed).toBe(true);
  });
  it("unknown country passes only on an explicit Indian-startup verdict", () => {
    expect(evaluateHardFilters(cfg, { ...base, hqCountry: null, isIndianStartup: true }).passed).toBe(true);
    expect(evaluateHardFilters(cfg, { ...base, hqCountry: null, isIndianStartup: null }).reason).toBe("wrong_geography");
  });
  it("is driven by config, not code: allowing the US flips the verdict", () => {
    const us = { ...base, hqCountry: "United States", isIndianStartup: false };
    expect(evaluateHardFilters({ ...cfg, allowed_countries: ["India", "United States"] }, us).passed).toBe(true);
    expect(evaluateHardFilters({ ...cfg, allowed_stages: ["series-b"] }, { ...base, stage: "series-b" }).passed).toBe(true);
  });
});
