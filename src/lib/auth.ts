/**
 * Minimal single-operator admin auth (V1). The cookie holds an HMAC of a fixed
 * label keyed by ADMIN_PASSWORD, so no password or session store is needed.
 * Uses Web Crypto so it works in both the proxy and route handlers.
 */
export const ADMIN_COOKIE = "admin_session";

async function hmacHex(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sessionToken(password: string): Promise<string> {
  return hmacHex(password, "timed-funding-outreach-engine:admin:v1");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return process.env.NODE_ENV !== "production"; // open in local dev only
  if (!cookieValue) return false;
  return timingSafeEqual(cookieValue, await sessionToken(password));
}
