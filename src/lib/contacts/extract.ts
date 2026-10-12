import * as cheerio from "cheerio";

export type FoundVia = "mailto" | "text" | "jsonld" | "cfemail";

export interface FoundEmail {
  email: string;
  via: FoundVia;
  /** Visible text around the address (the card / paragraph it sits in). */
  context: string;
  /** Person name when the address came from a schema.org Person node. */
  personName: string | null;
}

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/gi;
const FILE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|woff2?|ttf|map|pdf|zip)$/i;
const JUNK_DOMAINS = new Set(["example.com", "example.org", "domain.com", "yourdomain.com", "email.com", "mysite.com", "sentry.io", "wixpress.com", "sentry-next.wixpress.com", "godaddy.com", "test.com", "company.com", "yoursite.com"]);
const NOT_FOR_OUTREACH = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|abuse|unsubscribe|privacy|legal|dpo|grievance|compliance|webmaster|security|bounce)/i;

export function isUsableEmail(email: string): boolean {
  const e = email.toLowerCase();
  if (e.length > 254 || FILE_EXT.test(e)) return false;
  const [local, domain] = e.split("@");
  if (!local || !domain || JUNK_DOMAINS.has(domain) || NOT_FOR_OUTREACH.test(local)) return false;
  if (/^\d+x$/.test(local) || /@\d/.test(e)) return false; // "logo@2x.png"-style leftovers
  return !local.includes("..") && !local.startsWith(".") && !local.endsWith(".");
}

/** Decode Cloudflare's email-protection hex blob. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /@/.test(out) ? out : null;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Replace explicitly bracketed obfuscation ("name [at] site [dot] com") — not bare " at ", which is too noisy. */
function deobfuscate(text: string): string {
  return text
    .replace(/\s*[[({]\s*at\s*[\])}]\s*/gi, "@")
    .replace(/\s*[[({]\s*dot\s*[\])}]\s*/gi, ".");
}

/** Smallest enclosing block (≤ ~350 chars) so a team-card's text names one person, not the whole grid. */
function blockContext($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string {
  let best = squash(el.text());
  let cur = el.parent();
  for (let i = 0; i < 6 && cur.length; i++) {
    const t = squash(cur.text());
    if (t.length > 350) break;
    best = t;
    cur = cur.parent();
  }
  return best.slice(0, 350);
}

export interface PageExtraction {
  emails: FoundEmail[];
  /** Pages that look like a public contact form. */
  contactFormUrl: string | null;
}

export function extractFromHtml(html: string, pageUrl: string): PageExtraction {
  const $ = cheerio.load(html);
  // .text() glues adjacent blocks together ("…example" + "or" → "…exampleor"); separate them first.
  $("p,div,li,br,td,th,tr,h1,h2,h3,h4,h5,h6,section,article,header,footer,address").after(" ");
  const byEmail = new Map<string, FoundEmail>();
  const rank: Record<FoundVia, number> = { jsonld: 4, mailto: 3, cfemail: 3, text: 1 };
  const add = (raw: string, via: FoundVia, context: string, personName: string | null = null) => {
    const email = raw.trim().replace(/^mailto:/i, "").split("?")[0].replace(/[.,;:)\]>]+$/, "").toLowerCase();
    if (!isUsableEmail(email) || !email.match(new RegExp(`^${EMAIL_RE.source}$`, "i"))) return;
    const prev = byEmail.get(email);
    if (!prev || rank[via] > rank[prev.via]) byEmail.set(email, { email, via, context: squash(context).slice(0, 350), personName: personName ?? prev?.personName ?? null });
  };

  // 1. JSON-LD (schema.org Person/Organization.email)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (node: unknown, person: string | null) => {
        if (Array.isArray(node)) return node.forEach((n) => walk(n, person));
        if (!node || typeof node !== "object") return;
        const o = node as Record<string, unknown>;
        const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
        const isPerson = types.includes("Person");
        const name = isPerson && typeof o.name === "string" ? o.name : person;
        if (typeof o.email === "string") add(o.email, "jsonld", `${isPerson ? "Person" : "Organization"} ${typeof o.name === "string" ? o.name : ""} ${o.email}`, isPerson ? name : null);
        for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, name);
      };
      walk(JSON.parse($(el).contents().text()), null);
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });

  // 2. Cloudflare-protected addresses
  $("[data-cfemail]").each((_, el) => {
    const dec = decodeCfEmail($(el).attr("data-cfemail") ?? "");
    if (dec) add(dec, "cfemail", blockContext($, $(el)));
  });
  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) => {
    const dec = decodeCfEmail(($(el).attr("href") ?? "").split("#")[1] ?? "");
    if (dec) add(dec, "cfemail", blockContext($, $(el)));
  });

  // 3. mailto: links
  $('a[href^="mailto:" i]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    let addr = href.slice(7);
    try { addr = decodeURIComponent(addr); } catch { /* keep raw */ }
    for (const a of addr.split(/[;,]/)) add(a, "mailto", blockContext($, $(el)));
  });

  // 4. visible text (with bracket de-obfuscation)
  $("script, style, noscript, svg").remove();
  const text = deobfuscate(squash($("body").text()));
  for (const m of text.matchAll(EMAIL_RE)) {
    const idx = m.index ?? 0;
    add(m[0], "text", text.slice(Math.max(0, idx - 160), idx + m[0].length + 160));
  }

  // Contact form: a <form> with a free-text box that is not just a newsletter signup.
  let contactFormUrl: string | null = null;
  const path = new URL(pageUrl).pathname.toLowerCase();
  $("form").each((_, f) => {
    const form = $(f);
    const hasMessage = form.find("textarea").length > 0;
    const newsletterOnly = !hasMessage && form.find("input").length <= 2;
    if (hasMessage || (/contact|reach|connect|touch|enquir|inquir|partner/.test(path) && !newsletterOnly)) contactFormUrl = pageUrl;
  });

  return { emails: [...byEmail.values()], contactFormUrl };
}
