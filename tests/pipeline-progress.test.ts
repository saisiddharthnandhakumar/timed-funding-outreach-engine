import { describe, expect, it, vi } from "vitest";
import { ProgressTracker, STAGES, overallPercent, type ProgressSnapshot } from "@/lib/pipeline/progress";

function tracker(opts: { minIntervalMs?: number; fail?: boolean } = {}) {
  let t = 1_000_000;
  const writes: ProgressSnapshot[] = [];
  const tr = new ProgressTracker(
    async (s) => {
      if (opts.fail) throw new Error('column "progress_json" does not exist');
      writes.push(s);
    },
    () => t,
    opts.minIntervalMs ?? 0,
  );
  return { tr, writes, advance: (ms: number) => (t += ms) };
}
const stage = (tr: ProgressTracker, key: string) => tr.snapshot().stages.find((s) => s.key === key)!;

describe("pipeline progress tracker", () => {
  it("starts with every stage pending and reports 0%", () => {
    const { tr } = tracker();
    expect(tr.snapshot().stages.map((s) => s.key)).toEqual(STAGES.map((s) => s.key));
    expect(tr.snapshot().stages.every((s) => s.status === "pending")).toBe(true);
    expect(overallPercent(tr.snapshot())).toBe(0);
  });

  it("counts items through a stage and completes it", () => {
    const { tr } = tracker();
    tr.start("sources", 4);
    expect(stage(tr, "sources")).toMatchObject({ status: "running", done: 0, total: 4 });
    tr.tick("sources", 2);
    expect(overallPercent(tr.snapshot())).toBe(Math.round(((2 / 4) / STAGES.length) * 100));
    tr.tick("sources", 2);
    tr.finish("sources", "4 sources polled");
    expect(stage(tr, "sources")).toMatchObject({ status: "done", done: 4, total: 4, detail: "4 sources polled" });
  });

  it("funnel stages grow as items arrive; total never lags done", () => {
    const { tr } = tracker();
    tr.add("research");
    tr.add("research");
    tr.tick("research");
    expect(stage(tr, "research")).toMatchObject({ status: "running", done: 1, total: 2 });
    tr.tick("research", 5);
    expect(stage(tr, "research").total).toBe(6);
  });

  it("a stage that never saw an item finishes as skipped; others as done", () => {
    const { tr } = tracker();
    tr.start("classify", 0);
    tr.finish("classify");
    expect(stage(tr, "classify").status).toBe("skipped");
    tr.add("scoring");
    tr.tick("scoring");
    tr.finish("scoring");
    expect(stage(tr, "scoring").status).toBe("done");
  });

  it("track() counts the item in and out even when the work throws", async () => {
    const { tr } = tracker();
    await expect(tr.track("drafts", "Writing draft", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(stage(tr, "drafts")).toMatchObject({ done: 1, total: 1 });
    expect(tr.snapshot().activity).toBe("Writing draft");
  });

  it("finishAll closes open stages; on failure the running one is marked failed", () => {
    const ok = tracker().tr;
    ok.start("sources", 1);
    ok.tick("sources");
    ok.finishAll("completed");
    expect(ok.snapshot().stages.map((s) => s.status)).toEqual(["done", ...Array(7).fill("skipped")]);
    expect(overallPercent(ok.snapshot())).toBe(100);

    const bad = tracker().tr;
    bad.start("classify", 5);
    bad.tick("classify", 2);
    bad.finishAll("failed");
    expect(stage(bad, "classify").status).toBe("failed");
    expect(bad.snapshot().activity).toMatch(/failed/i);
  });

  it("throttles writes and always flushes the final state", async () => {
    vi.useFakeTimers();
    const { tr, writes, advance } = tracker({ minIntervalMs: 1000 });
    advance(5000);
    tr.start("sources", 10);       // first write is immediate
    for (let i = 0; i < 9; i++) tr.tick("sources"); // within the window: coalesced
    await tr.flush();
    const afterBurst = writes.length;
    expect(afterBurst).toBeLessThanOrEqual(3);
    expect(writes.at(-1)!.stages[0].done).toBe(9);
    tr.finishAll("completed");
    await tr.flush();
    expect(writes.at(-1)!.stages[0].status).toBe("done");
    vi.useRealTimers();
  });

  it("a failing writer (column not migrated) disables progress instead of breaking the run", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { tr } = tracker({ fail: true });
    tr.start("sources", 1);
    await tr.flush();
    expect(() => { tr.tick("sources"); tr.finishAll("completed"); }).not.toThrow();
    await tr.flush();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
