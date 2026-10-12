import { describe, expect, it } from "vitest";
import { attributeToFounder } from "@/lib/contacts/attribute";
import { localPartMatches, registrableDomain } from "@/lib/contacts/names";
import { guessFounderEmails, inferPattern } from "@/lib/contacts/patterns";
import { mergeAll, selectPreferred } from "@/lib/contacts/rank";
import { RobotsGuard } from "@/lib/contacts/robots";
import type { ContactCandidate, StoredContact } from "@/lib/contacts/types";
import { MxChecker, isSyntaxValid } from "@/lib/contacts/verify";
import { FOUNDERS, fakeSite, resolver } from "./helpers";

const cand = (over: Partial<ContactCandidate>): ContactCandidate => ({
  kind: "founder", email: "x@nimbus.example", contactUrl: null, founderId: null, founderName: "Asha Rao", mailboxRole: null, status: "publicly_confirmed",
  source: "company_website", sourceUrl: "https://nimbus.example/team", evidence: "e", mxValid: true, confidence: 90, ...over,
});

describe("name + attribution", () => {
  it("matches mailbox names to founders", () => {
    expect(localPartMatches("asha.rao", "Asha Rao")).toBe("full");
    expect(localPartMatches("arao", "Asha Rao")).toBe("full");
    expect(localPartMatches("asha", "Asha Rao")).toBe("first");
    expect(localPartMatches("vikram", "Asha Rao")).toBeNull();
    expect(registrableDomain("mail.nimbus.co.in")).toBe("nimbus.co.in");
  });

  it("does not attribute a team-grid address when several founders are named and the mailbox matches none", () => {
    const found = { email: "team@nimbus.example", via: "text" as const, context: "Asha Rao and Vikram Shah reach us at team@nimbus.example", personName: null };
    expect(attributeToFounder(found, FOUNDERS, "nimbus.example")).toBeNull();
  });

  it("does not attribute a bare first-name mailbox when two founders share the first name", () => {
    const twins = [{ id: "a", name: "Rohan Mehta", role: null }, { id: "b", name: "Rohan Iyer", role: null }];
    const found = { email: "rohan@nimbus.example", via: "text" as const, context: "write to rohan@nimbus.example", personName: null };
    expect(attributeToFounder(found, twins, "nimbus.example")).toBeNull();
  });
});

describe("verification", () => {
  it("validates syntax", () => {
    expect(isSyntaxValid("a.b@nimbus.example")).toBe(true);
    expect(isSyntaxValid("a..b@nimbus.example")).toBe(false);
    expect(isSyntaxValid("nope")).toBe(false);
  });
  it("MX: true / false / inconclusive, and caches per domain", async () => {
    let calls = 0;
    const mx = new MxChecker({ ...resolver((d) => (d === "ok.example" ? true : d === "slow.example" ? "error" : false)), resolveMx: async (d) => { calls++; return resolver((x) => (x === "ok.example" ? true : x === "slow.example" ? "error" : false)).resolveMx(d); } });
    expect(await mx.check("ok.example")).toBe(true);
    expect(await mx.check("ok.example")).toBe(true);
    expect(calls).toBe(1);
    expect(await mx.check("nx.example")).toBe(false);
    expect(await mx.check("slow.example")).toBeNull();
  });
});

describe("robots.txt", () => {
  it("honours Disallow/Allow, treats 404 as open and 5xx/unreachable as closed", async () => {
    const guard = new RobotsGuard(fakeSite({ "/robots.txt": "User-agent: *\nDisallow: /private\nAllow: /private/ok" }));
    expect(await guard.allowed("https://nimbus.example/about")).toBe(true);
    expect(await guard.allowed("https://nimbus.example/private/x")).toBe(false);
    expect(await guard.allowed("https://nimbus.example/private/ok")).toBe(true);
    expect(await new RobotsGuard(fakeSite({})).allowed("https://nimbus.example/about")).toBe(true);
    expect(await new RobotsGuard(fakeSite({}, { down: true })).allowed("https://nimbus.example/about")).toBe(false);
  });
  it("a bot-specific group overrides *", async () => {
    const guard = new RobotsGuard(fakeSite({ "/robots.txt": "User-agent: *\nDisallow: /\n\nUser-agent: TimedFundingOutreachEngine\nAllow: /" }));
    expect(await guard.allowed("https://nimbus.example/team")).toBe(true);
  });
});

describe("patterns", () => {
  it("guesses are labelled pattern_guessed and learn the company's pattern", () => {
    expect(inferPattern([{ email: "priya.nair@nimbus.example", name: "Priya Nair" }])).toBe("first.last");
    const [first] = guessFounderEmails(FOUNDERS[0], "nimbus.example", "first.last");
    expect(first).toMatchObject({ email: "asha.rao@nimbus.example", status: "pattern_guessed", source: "pattern" });
  });
});

describe("contact selection hierarchy", () => {
  it("founder confirmed > founder provider-verified > company confirmed > form > none; guesses never win", () => {
    const guess = cand({ email: "asha@nimbus.example", status: "pattern_guessed" });
    const company = cand({ kind: "company", email: "hello@nimbus.example", founderName: null, mailboxRole: "general" });
    const form = cand({ kind: "contact_form", email: null, contactUrl: "https://nimbus.example/contact", founderName: null });
    expect(selectPreferred([guess]).type).toBe("not_found");
    expect(selectPreferred([guess, form]).type).toBe("contact_form");
    expect(selectPreferred([guess, form, company]).type).toBe("company");
    const pv = cand({ email: "v@nimbus.example", status: "provider_verified", founderName: "Vikram Shah" });
    expect(selectPreferred([company, pv]).contact?.email).toBe("v@nimbus.example");
    const confirmedFounder = cand({ email: "asha.rao@nimbus.example" });
    expect(selectPreferred([company, pv, confirmedFounder]).contact?.email).toBe("asha.rao@nimbus.example");
  });
  it("prefers partnerships/general company mailboxes over support, and skips domains without a mail server", () => {
    const support = cand({ kind: "company", email: "support@nimbus.example", mailboxRole: "support", founderName: null });
    const general = cand({ kind: "company", email: "hello@nimbus.example", mailboxRole: "general", founderName: null });
    expect(selectPreferred([support, general]).contact?.email).toBe("hello@nimbus.example");
    expect(selectPreferred([cand({ mxValid: false })]).type).toBe("not_found");
  });
  it("merge never downgrades a stored status but upgrades when better evidence arrives", () => {
    const stored: StoredContact = { ...cand({ status: "publicly_confirmed" }), id: "1", isPreferred: true, firstFoundAt: "2026-01-01T00:00:00Z" };
    const [afterGuess] = mergeAll([stored], [cand({ status: "pattern_guessed" })], "2026-10-12T00:00:00Z");
    expect(afterGuess.status).toBe("publicly_confirmed");
    expect(afterGuess.firstFoundAt).toBe("2026-01-01T00:00:00Z");
    const guessStored: StoredContact = { ...cand({ status: "pattern_guessed" }), id: "2", isPreferred: false, firstFoundAt: "2026-01-01T00:00:00Z" };
    expect(mergeAll([guessStored], [cand({ status: "publicly_confirmed" })], "x")[0].status).toBe("publicly_confirmed");
  });
});
