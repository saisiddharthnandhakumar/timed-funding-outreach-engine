import { describe, expect, it } from "vitest";
import { articleLabel, draftLabel, rejectionLabel, roundLabel, verificationLabel } from "@/lib/labels";
import { needsAttention, sourceHealth } from "@/lib/sources/health";
import { nextGithubRun, nextScheduledRun, nextVercelRun } from "@/lib/pipeline/schedule";

const NOW = new Date("2026-10-12T10:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("status vocabulary", () => {
  it("translates every rejection code and keeps unknown codes readable", () => {
    expect(rejectionLabel("below_threshold")).toBe("Not a fit");
    expect(rejectionLabel("already_contacted")).toBe("Previously contacted");
    expect(rejectionLabel("announcement_too_old")).toBe("Too old");
    expect(rejectionLabel("wrong_stage")).toBe("Stage outside thesis");
    expect(rejectionLabel("wrong_geography")).toBe("Outside target market");
    expect(rejectionLabel("something_new")).toBe("Something new");
  });
  it("labels funding events, articles and drafts for humans", () => {
    expect(roundLabel("qualified").text).toBe("Qualified");
    expect(roundLabel("discovered").text).toBe("Reviewing");
    expect(roundLabel("enriching").text).toBe("Researching");
    expect(roundLabel("rejected", "already_contacted").text).toBe("Previously contacted");
    expect(roundLabel("rejected", "wrong_stage").text).toBe("Stage outside thesis");
    expect(articleLabel("duplicate").text).toBe("Duplicate");
    expect(articleLabel("pending").text).toBe("Reviewing");
    expect(draftLabel("generated").text).toBe("Needs review");
    expect(draftLabel("draft_created").text).toBe("Needs review");
    expect(draftLabel("approved").text).toBe("Approved");
    expect(verificationLabel("pattern_guessed").text).toContain("not used");
  });
});

describe("source health", () => {
  const base = { enabled: true, last_polled_at: minsAgo(10), last_error: null, last_error_at: null };
  it("is healthy within one cadence plus grace", () => {
    expect(sourceHealth({ ...base, last_success_at: minsAgo(40) }, NOW).level).toBe("healthy");
  });
  it("is delayed a little beyond that, and needs attention after several hours", () => {
    const delayed = sourceHealth({ ...base, last_success_at: minsAgo(200) }, NOW);
    expect(delayed.level).toBe("delayed");
    expect(needsAttention(delayed)).toBe(false); // late but not failing: do not nag the scout
    const stale = sourceHealth({ ...base, last_success_at: minsAgo(4 * 60 + 100) }, NOW);
    expect(stale.level).toBe("attention");
    expect(stale.detail).toBe("Hasn’t updated successfully in 6 hours.");
  });
  it("flags a failing latest check", () => {
    const h = sourceHealth({ ...base, last_success_at: minsAgo(60), last_error: "timeout", last_error_at: minsAgo(5) }, NOW);
    expect(h.level).toBe("delayed");
    expect(h.failing).toBe(true);
    expect(needsAttention(h)).toBe(true);
  });
  it("handles paused and never-polled sources", () => {
    expect(sourceHealth({ ...base, enabled: false, last_success_at: null }, NOW).level).toBe("paused");
    expect(sourceHealth({ ...base, last_success_at: null }, NOW).level).toBe("waiting");
    expect(sourceHealth({ ...base, last_success_at: null, last_error: "x", last_error_at: minsAgo(1) }, NOW).level).toBe("attention");
  });
});

describe("scheduler times", () => {
  it("GitHub fires at minute 15 of even UTC hours", () => {
    expect(nextGithubRun(new Date("2026-10-12T10:00:00Z")).toISOString()).toBe("2026-10-12T10:15:00.000Z");
    expect(nextGithubRun(new Date("2026-10-12T10:16:00Z")).toISOString()).toBe("2026-10-12T12:15:00.000Z");
    expect(nextGithubRun(new Date("2026-10-12T11:00:00Z")).toISOString()).toBe("2026-10-12T12:15:00.000Z");
  });
  it("Vercel fires daily at 03:30 UTC (09:00 IST)", () => {
    expect(nextVercelRun(new Date("2026-10-12T10:00:00Z")).toISOString()).toBe("2026-10-13T03:30:00.000Z");
    expect(nextVercelRun(new Date("2026-10-12T01:00:00Z")).toISOString()).toBe("2026-10-12T03:30:00.000Z");
  });
  it("reports the soonest of the two", () => {
    expect(nextScheduledRun(new Date("2026-10-12T10:00:00Z")).toISOString()).toBe("2026-10-12T10:15:00.000Z");
  });
});
