import { describe, expect, it } from "vitest";
import { currentStep, scanSteps } from "@/lib/pipeline/steps";
import { STAGES, type ProgressSnapshot, type StageStatus } from "@/lib/pipeline/progress";
import { gmailComposeUrl, messageChecks, type CheckInput } from "@/lib/drafts/checks";

function snapshot(status: Partial<Record<string, StageStatus>>): ProgressSnapshot {
  return {
    stages: STAGES.map((s) => ({ ...s, status: status[s.key] ?? "pending", done: 0, total: 0, detail: null, startedAt: null, finishedAt: null })),
    activity: null,
    updatedAt: new Date().toISOString(),
  };
}

describe("five plain scan steps over eight technical stages", () => {
  it("is all pending before anything starts", () => {
    const steps = scanSteps(snapshot({}));
    expect(steps).toHaveLength(5);
    expect(steps.every((s) => s.status === "pending")).toBe(true);
    expect(currentStep(steps)?.label).toBe("Scanning sources");
  });
  it("shows the earliest in-flight step as current, even though stages overlap", () => {
    const steps = scanSteps(snapshot({ sources: "done", prefilter: "done", classify: "running", filters: "running", research: "running" }));
    expect(steps.map((s) => s.status)).toEqual(["done", "running", "running", "pending", "pending"]);
    expect(currentStep(steps)?.label).toBe("Reviewing funding announcements");
  });
  it("treats skipped stages as done and surfaces failure", () => {
    expect(scanSteps(snapshot({ research: "skipped", contacts: "done" }))[2].status).toBe("done");
    expect(scanSteps(snapshot({ scoring: "failed" }))[3].status).toBe("failed");
  });
  it("copes with a run that has no progress data", () => {
    expect(scanSteps(null).every((s) => s.status === "pending")).toBe(true);
  });
});

const base: CheckInput = {
  startupName: "Nimbus AI", stageLabel: "Seed", amountLabel: "₹18 Cr", subject: "Congratulations on the seed round",
  body: "Hi Aditi,\n\nCongratulations on Nimbus AI's seed round. I'd love to talk.", recipientName: "Aditi Rao", recipientEmail: "aditi@nimbus.ai",
  recipientVerification: "publicly_confirmed", researchSourceCount: 3,
};

describe("“Why this message” checks are facts about the real draft", () => {
  it("passes every check for a well-formed draft", () => {
    const checks = messageChecks(base);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.text)).toContain("Addresses Aditi directly");
    expect(checks.map((c) => c.text)).toContain("Recipient address is published by the company");
  });
  it("flags a missing name, round mention and unverified address", () => {
    const checks = messageChecks({ ...base, subject: "Hello", body: "Hello there, I enjoyed your website.", recipientVerification: "pattern_guessed", researchSourceCount: 0 });
    const failing = checks.filter((c) => !c.ok).map((c) => c.text);
    expect(failing).toEqual(expect.arrayContaining([
      "Doesn’t mention the funding round. Consider adding it.",
      "Doesn’t mention Nimbus AI by name",
      "Doesn’t address Aditi by name",
      "Recipient address is not verified. Check it before sending.",
      "No research sources on file for this company",
    ]));
  });
  it("distinguishes a hand-typed address from a missing one", () => {
    expect(messageChecks({ ...base, recipientVerification: null }).some((c) => c.text.includes("entered by hand"))).toBe(true);
    expect(messageChecks({ ...base, recipientEmail: null, recipientVerification: null }).some((c) => c.text.startsWith("No recipient email yet"))).toBe(true);
  });
});

describe("Gmail compose link", () => {
  it("prefills recipient, subject and body", () => {
    const u = new URL(gmailComposeUrl({ to: "a@b.co", subject: "Hi there", body: "Line one\nLine two" }));
    expect(u.hostname).toBe("mail.google.com");
    expect(u.searchParams.get("to")).toBe("a@b.co");
    expect(u.searchParams.get("su")).toBe("Hi there");
    expect(u.searchParams.get("body")).toBe("Line one\nLine two");
  });
  it("drops an oversized body rather than producing a broken link", () => {
    const u = new URL(gmailComposeUrl({ to: null, subject: "Hi", body: "é".repeat(5000) }));
    expect(u.searchParams.get("body")).toBeNull();
    expect(u.searchParams.get("su")).toBe("Hi");
  });
});
