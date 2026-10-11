import { describe, expect, it } from "vitest";
import { computePipelineHealth, type RunLike } from "@/lib/pipeline/health";

const NOW = new Date("2026-10-12T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const run = (status: string, startedMinsAgo: number, over: Partial<RunLike> = {}): RunLike => ({
  id: `${status}-${startedMinsAgo}`, status, trigger: "cron", started_at: minsAgo(startedMinsAgo), completed_at: minsAgo(startedMinsAgo - 2), errors_json: [], ...over,
});

describe("pipeline health", () => {
  it("healthy when the last success is within the cadence window", () => {
    const h = computePipelineHealth([run("completed", 95)], NOW);
    expect(h.level).toBe("healthy");
    expect(h.minutesSinceSuccess).toBe(93);
  });

  it("delayed when a GitHub schedule is late (past cadence+grace, under 2.5x)", () => {
    expect(computePipelineHealth([run("completed", 200)], NOW).level).toBe("delayed");
  });

  it("warning when there has been no success for over 2.5x the cadence", () => {
    expect(computePipelineHealth([run("completed", 400)], NOW).level).toBe("warning");
  });

  it("warning when there has never been a successful run", () => {
    const h = computePipelineHealth([], NOW);
    expect(h.level).toBe("warning");
    expect(h.lastSuccess).toBeNull();
  });

  it("partial runs count as success", () => {
    expect(computePipelineHealth([run("partial", 60)], NOW).level).toBe("healthy");
  });

  it("warning, and shows the failure, when the most recent finished run failed", () => {
    const failed = run("failed", 30, { errors_json: [{ scope: "pipeline", message: "boom" }] });
    const h = computePipelineHealth([failed, run("completed", 150)], NOW);
    expect(h.level).toBe("warning");
    expect(h.latestFailure?.message).toBe("pipeline: boom");
  });

  it("a later success clears the warning but the latest failure is still reported", () => {
    const h = computePipelineHealth([run("completed", 20), run("failed", 140, { errors_json: [{ scope: "stale_run", message: "x" }] })], NOW);
    expect(h.level).toBe("healthy");
    expect(h.latestFailure?.message).toBe("stale_run: x");
  });

  it("a run in progress is flagged and does not count as a failure", () => {
    const h = computePipelineHealth([run("running", 3, { completed_at: null }), run("completed", 100)], NOW);
    expect(h.running).toBe(true);
    expect(h.level).toBe("healthy");
  });
});
