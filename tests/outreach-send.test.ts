import { describe, expect, it } from "vitest";
import { formatFrom, sendApprovedDraft, sendConfigProblem, type DraftRow, type SendStore } from "@/lib/outreach/send";
import type { VerificationStatus } from "@/lib/contacts/types";

const CONFIG = { apiKey: "re_test_key", fromEmail: "rohit@wakeandwyze.com", fromName: "Rohit", replyTo: "hello@wakeandwyze.com" };

class FakeStore implements SendStore {
  logs: { event: string; meta: Record<string, unknown> }[] = [];
  sentMarks = 0;
  constructor(public draft: DraftRow | null, private contact: VerificationStatus | null = null, private markResult = true) {}
  async loadDraft() { return this.draft; }
  async contactStatus() { return this.contact; }
  async markSent() { this.sentMarks++; if (this.markResult && this.draft) this.draft.status = "sent"; return this.markResult; }
  async log(event: string, _m: string, meta: Record<string, unknown>) { this.logs.push({ event, meta }); }
}
const draft = (over: Partial<DraftRow> = {}): DraftRow => ({
  id: "d1", startup_id: "s1", status: "approved", recipient_name: "Asha", recipient_email: "Asha@Nimbus.example", subject: "Congrats on the seed round", body: "Hi Asha,\n\nCongratulations...", ...over,
});

function fakeResend(reply: { status?: number; json?: unknown } | "throw" = { status: 200, json: { id: "re_123" } }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (reply === "throw") throw new Error("network down");
    return new Response(JSON.stringify(reply.json ?? {}), { status: reply.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("sending an approved draft through Resend", () => {
  it("sends once, with the right from / reply-to / idempotency key, marks it sent and logs the Resend id", async () => {
    const store = new FakeStore(draft());
    const { fetchImpl, calls } = fakeResend();
    const out = await sendApprovedDraft({ store, config: CONFIG, fetchImpl }, "d1");
    expect(out).toEqual({ ok: true, messageId: "re_123" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ from: "Rohit <rohit@wakeandwyze.com>", to: ["asha@nimbus.example"], reply_to: "hello@wakeandwyze.com", subject: "Congrats on the seed round" });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test_key");
    expect(headers["idempotency-key"]).toMatch(/^outreach-d1-[0-9a-f]{16}$/);
    expect(store.sentMarks).toBe(1);
    expect(store.logs.map((l) => l.event)).toEqual(["email_sent"]);
    expect(store.logs[0].meta).toMatchObject({ resend_id: "re_123", to: "asha@nimbus.example" });
  });

  it("the idempotency key changes when the content changes, and is stable when it does not", async () => {
    const keys: string[] = [];
    for (const d of [draft(), draft(), draft({ body: "edited body that is different" })]) {
      const { fetchImpl, calls } = fakeResend();
      await sendApprovedDraft({ store: new FakeStore(d), config: CONFIG, fetchImpl }, "d1");
      keys.push((calls[0].init.headers as Record<string, string>)["idempotency-key"]);
    }
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it.each([
    ["generated", /Approve the draft/],
    ["draft_created", /Approve the draft/],
    ["rejected", /Approve the draft/],
    ["sent", /already been sent/],
  ])("refuses a draft in status %s and sends nothing", async (status, msg) => {
    const store = new FakeStore(draft({ status }));
    const { fetchImpl, calls } = fakeResend();
    const out = await sendApprovedDraft({ store, config: CONFIG, fetchImpl }, "d1");
    expect(out).toMatchObject({ ok: false, code: "bad_status" });
    expect((out as { message: string }).message).toMatch(msg);
    expect(calls).toHaveLength(0);
  });

  it("refuses a missing or invalid recipient", async () => {
    for (const recipient_email of [null, "", "not-an-email"]) {
      const { fetchImpl, calls } = fakeResend();
      const out = await sendApprovedDraft({ store: new FakeStore(draft({ recipient_email })), config: CONFIG, fetchImpl }, "d1");
      expect(out).toMatchObject({ ok: false, code: "no_recipient" });
      expect(calls).toHaveLength(0);
    }
  });

  it("blocks guessed / weakly-attributed / unverified addresses, allows confirmed, verified and operator-typed ones", async () => {
    for (const weak of ["pattern_guessed", "domain_valid_only", "unverified"] as const) {
      const { fetchImpl, calls } = fakeResend();
      const out = await sendApprovedDraft({ store: new FakeStore(draft(), weak), config: CONFIG, fetchImpl }, "d1");
      expect(out).toMatchObject({ ok: false, code: "weak_contact" });
      expect(calls).toHaveLength(0);
    }
    for (const ok of ["publicly_confirmed", "provider_verified", null] as const) {
      const { fetchImpl, calls } = fakeResend();
      const out = await sendApprovedDraft({ store: new FakeStore(draft(), ok), config: CONFIG, fetchImpl }, "d1");
      expect(out.ok).toBe(true);
      expect(calls).toHaveLength(1);
    }
  });

  it("refuses to send when Resend is not configured", async () => {
    const { fetchImpl, calls } = fakeResend();
    for (const config of [{ ...CONFIG, apiKey: undefined }, { ...CONFIG, fromEmail: undefined }, { ...CONFIG, fromEmail: "nope" }]) {
      const out = await sendApprovedDraft({ store: new FakeStore(draft()), config, fetchImpl }, "d1");
      expect(out).toMatchObject({ ok: false, code: "not_configured" });
    }
    expect(calls).toHaveLength(0);
    expect(sendConfigProblem(CONFIG)).toBeNull();
  });

  it("a Resend rejection leaves the draft approved and surfaces the reason", async () => {
    const store = new FakeStore(draft());
    const { fetchImpl } = fakeResend({ status: 403, json: { name: "validation_error", message: "The wakeandwyze.com domain is not verified" } });
    const out = await sendApprovedDraft({ store, config: CONFIG, fetchImpl }, "d1");
    expect(out).toMatchObject({ ok: false, code: "provider_error" });
    expect((out as { message: string }).message).toMatch(/403.*not verified/);
    expect(store.sentMarks).toBe(0);
    expect(store.draft!.status).toBe("approved");
    expect(store.logs.map((l) => l.event)).toEqual(["email_send_failed"]);
  });

  it("a network failure leaves the draft approved (a retry is safe because of the idempotency key)", async () => {
    const store = new FakeStore(draft());
    const out = await sendApprovedDraft({ store, config: CONFIG, fetchImpl: fakeResend("throw").fetchImpl }, "d1");
    expect(out).toMatchObject({ ok: false, code: "provider_error" });
    expect(store.draft!.status).toBe("approved");
  });

  it("if the email goes out but the status update fails, it says so instead of hiding it", async () => {
    const store = new FakeStore(draft(), null, false);
    const out = await sendApprovedDraft({ store, config: CONFIG, fetchImpl: fakeResend().fetchImpl }, "d1");
    expect(out).toMatchObject({ ok: true, messageId: "re_123" });
    expect((out as { warning?: string }).warning).toMatch(/mark it manually/);
  });

  it("formats the from header safely", () => {
    expect(formatFrom({ fromEmail: "rohit@wakeandwyze.com" })).toBe("rohit@wakeandwyze.com");
    expect(formatFrom({ fromEmail: "rohit@wakeandwyze.com", fromName: 'Ro"hit <x>' })).toBe("Rohit x <rohit@wakeandwyze.com>");
  });
});
