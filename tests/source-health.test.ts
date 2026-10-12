import { describe, expect, it } from "vitest";
import { sourceHealth, type SourceLike } from "@/lib/pipeline/source-health";
import { DELAYED_MAX_MINUTES, HEALTHY_MAX_MINUTES } from "@/lib/pipeline/health";

const now = new Date("2026-10-13T12:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
const src = (minutes: number, over: Partial<SourceLike> = {}): SourceLike => ({ enabled: true, last_polled_at: ago(minutes), last_success_at: ago(minutes), last_error: null, last_error_at: null, ...over });

describe("sourceHealth", () => {
  it("is unchanged for sources without an interval or on the 120-minute news cadence", () => {
    for (const extra of [{}, { poll_interval_minutes: 120 }]) {
      expect(sourceHealth(src(HEALTHY_MAX_MINUTES, extra), now)).toBe("healthy");
      expect(sourceHealth(src(HEALTHY_MAX_MINUTES + 1, extra), now)).toBe("delayed");
      expect(sourceHealth(src(DELAYED_MAX_MINUTES, extra), now)).toBe("delayed");
      expect(sourceHealth(src(DELAYED_MAX_MINUTES + 1, extra), now)).toBe("issue");
    }
  });
  it("doesn't call a daily-polled investor source late after a few hours", () => {
    const daily = { poll_interval_minutes: 1440 };
    expect(sourceHealth(src(600, daily), now)).toBe("healthy");
    expect(sourceHealth(src(1440 * 1.25, daily), now)).toBe("healthy");
    expect(sourceHealth(src(1440 * 2, daily), now)).toBe("delayed");
    expect(sourceHealth(src(1440 * 3, daily), now)).toBe("issue");
  });
  it("still reports paused, never-polled and error states", () => {
    expect(sourceHealth(src(10, { enabled: false }), now)).toBe("paused");
    expect(sourceHealth({ enabled: true, last_polled_at: null, last_success_at: null, last_error: null, last_error_at: null }, now)).toBe("idle");
    expect(sourceHealth(src(60, { last_error: "boom", last_error_at: ago(5) }), now)).toBe("issue");
  });
});
