import { describe, expect, it } from "vitest";
import { decodeCfEmail, extractFromHtml, isUsableEmail } from "@/lib/contacts/extract";

const emailsOf = (html: string) => extractFromHtml(html, "https://x.example/team").emails.map((e) => e.email).sort();

describe("email extraction", () => {
  it("finds mailto links, visible text and bracket-obfuscated addresses", () => {
    const html = `<body><a href="mailto:Asha@Nimbus.example?subject=Hi">Email Asha</a><p>Press: press [at] nimbus [dot] example</p><p>or hello@nimbus.example.</p></body>`;
    expect(emailsOf(html)).toEqual(["asha@nimbus.example", "hello@nimbus.example", "press@nimbus.example"]);
  });

  it("reads schema.org JSON-LD and keeps the Person name", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","founder":{"@type":"Person","name":"Asha Rao","email":"asha@nimbus.example"}}</script>`;
    const [e] = extractFromHtml(html, "https://x.example/").emails;
    expect(e).toMatchObject({ email: "asha@nimbus.example", via: "jsonld", personName: "Asha Rao" });
  });

  it("decodes Cloudflare email protection", () => {
    // "hi@nimbus.example" xor key 0x2a
    const key = 0x2a;
    const hex = (key.toString(16).padStart(2, "0")) + [..."hi@nimbus.example"].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");
    expect(decodeCfEmail(hex)).toBe("hi@nimbus.example");
    expect(emailsOf(`<a class="__cf_email__" data-cfemail="${hex}">[email protected]</a>`)).toEqual(["hi@nimbus.example"]);
  });

  it("drops junk: images, placeholders, no-reply, privacy mailboxes", () => {
    const html = `<p>logo@2x.png noreply@nimbus.example privacy@nimbus.example name@example.com a@sentry.io real@nimbus.example</p>`;
    expect(emailsOf(html)).toEqual(["real@nimbus.example"]);
    expect(isUsableEmail("do-not-reply@x.com")).toBe(false);
  });

  it("detects a public contact form", () => {
    const withForm = extractFromHtml(`<form><input name="email"><textarea></textarea></form>`, "https://x.example/contact");
    expect(withForm.contactFormUrl).toBe("https://x.example/contact");
    expect(extractFromHtml(`<form><input name="email"></form>`, "https://x.example/").contactFormUrl).toBeNull(); // newsletter box
  });

  it("scopes context to one team card, not the whole grid", () => {
    const html = `<div class="grid"><div class="card"><h3>Asha Rao</h3><a href="mailto:a@nimbus.example">mail</a></div><div class="card"><h3>Vikram Shah</h3><a href="mailto:v@nimbus.example">mail</a></div></div>`;
    const ex = extractFromHtml(html, "https://x.example/team").emails;
    expect(ex.find((e) => e.email === "a@nimbus.example")!.context).toContain("Asha Rao");
  });
});
