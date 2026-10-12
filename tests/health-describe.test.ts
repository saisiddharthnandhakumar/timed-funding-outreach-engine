import { describe, expect, it } from "vitest";
import { describeHealth } from "@/lib/pipeline/health";
import { sourceHealth } from "@/lib/pipeline/source-health";
import { greeting, median } from "@/lib/format";

describe("describeHealth", () => {
  it("uses the three scout-facing sentences", () => {
    expect(describeHealth({ level: "healthy", minutesSinceSuccess: 37, running: false }).text).toBe("System healthy · Last scan 37m ago");
    expect(describeHealth({ level: "delayed", minutesSinceSuccess: 240, running: false }).text).toBe("Scan delayed · Last success 4h ago");
    expect(describeHealth({ level: "warning", minutesSinceSuccess: 480, running: false }).text).toBe("Discovery issue · Last success 8h ago");
    expect(describeHealth({ level: "warning", minutesSinceSuccess: null, running: false }).text).toBe("Discovery issue · No successful scan yet");
    expect(describeHealth({ level: "healthy", minutesSinceSuccess: 5, running: true }).text).toBe("System healthy · Last scan 5m ago · Scanning now");
  });
});

describe("sourceHealth", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const base = { enabled: true, last_polled_at: ago(10), last_success_at: ago(10), last_error: null, last_error_at: null };
  it("classifies", () => {
    expect(sourceHealth(base, now)).toBe("healthy");
    expect(sourceHealth({ ...base, enabled: false }, now)).toBe("paused");
    expect(sourceHealth({ ...base, last_polled_at: null, last_success_at: null }, now)).toBe("idle");
    expect(sourceHealth({ ...base, last_success_at: ago(200), last_polled_at: ago(200) }, now)).toBe("delayed");
    expect(sourceHealth({ ...base, last_success_at: ago(900), last_polled_at: ago(900) }, now)).toBe("issue");
    expect(sourceHealth({ ...base, last_error: "HTTP 500", last_error_at: ago(5) }, now)).toBe("issue");
  });
  it("ignores an old error after a later success", () => {
    expect(sourceHealth({ ...base, last_error: "HTTP 500", last_error_at: ago(300) }, now)).toBe("healthy");
  });
});

describe("format helpers", () => {
  it("greets by IST hour", () => {
    expect(greeting(new Date("2026-10-12T03:30:00Z"))).toBe("Good morning"); // 09:00 IST
    expect(greeting(new Date("2026-10-12T08:30:00Z"))).toBe("Good afternoon"); // 14:00 IST
    expect(greeting(new Date("2026-10-12T14:30:00Z"))).toBe("Good evening"); // 20:00 IST
  });
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
});
