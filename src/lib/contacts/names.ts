/** Name matching helpers (Indian names often have initials, single names and diacritics). */
export function normalizeName(raw: string): string[] {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|prof|shri|smt|ca|er)\.?\s/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function nameParts(raw: string): { first: string; last: string | null; tokens: string[] } | null {
  const tokens = normalizeName(raw);
  if (tokens.length === 0) return null;
  return { first: tokens[0], last: tokens.length > 1 ? tokens[tokens.length - 1] : null, tokens };
}

/** True when the text mentions the person's full name (all tokens in order, allowing a middle name). */
export function textMentionsName(text: string, name: string): boolean {
  const p = nameParts(name);
  if (!p) return false;
  const hay = ` ${normalizeName(text).join(" ")} `;
  if (p.last) {
    const re = new RegExp(` ${p.first} (?:[a-z]+ )?${p.last} `);
    return re.test(hay);
  }
  return p.first.length >= 4 && hay.includes(` ${p.first} `);
}

export type LocalMatch = "full" | "first" | null;

/**
 * Does the mailbox local part look like this person?
 *  full  : first.last, firstlast, first_last, first-last, flast, f.last, first.l, last.first
 *  first : just the first name (weaker: two people can share a first name)
 */
export function localPartMatches(local: string, name: string): LocalMatch {
  const p = nameParts(name);
  if (!p) return null;
  const l = local.toLowerCase().replace(/\+.*$/, "");
  const { first, last } = p;
  if (last) {
    const fulls = [`${first}.${last}`, `${first}${last}`, `${first}_${last}`, `${first}-${last}`, `${last}.${first}`, `${last}${first}`, `${first[0]}${last}`, `${first[0]}.${last}`, `${first}.${last[0]}`, `${first}${last[0]}`];
    if (fulls.includes(l) && (first.length > 1 || l.length > 3)) return "full";
  }
  if (l === first && first.length >= 3) return "first";
  return null;
}

/** Registrable-ish domain ("mail.nimbus.co.in" → "nimbus.co.in"), good enough for same-company checks. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const sld = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "in"]);
  const tail = parts.slice(-2);
  if (sld.has(tail[0]) && tail[1].length === 2) return parts.slice(-3).join(".");
  return tail.join(".");
}

export function sameCompanyDomain(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return registrableDomain(a) === registrableDomain(b);
}
