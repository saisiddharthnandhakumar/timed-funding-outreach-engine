import { requireEnv } from "@/lib/env";
import type { DraftProvider } from "./types";

/**
 * Creates a Gmail DRAFT (users.drafts.create). Requires an OAuth refresh token
 * with the gmail.compose scope. This provider can only create drafts; it has no
 * code path that sends mail.
 */
export class GmailDraftProvider implements DraftProvider {
  readonly name = "gmail" as const;

  private async accessToken(): Promise<string> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        refresh_token: requireEnv("GOOGLE_REFRESH_TOKEN"),
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
    if (!res.ok || !json.access_token) throw new Error(`Google OAuth refresh failed: ${json.error_description ?? json.error ?? res.status}`);
    return json.access_token;
  }

  async createDraft(d: { to: string | null; toName: string | null; subject: string; body: string }) {
    const headers = [
      d.to ? `To: ${d.toName ? `"${d.toName.replace(/"/g, "")}" ` : ""}<${d.to}>` : null,
      `Subject: =?UTF-8?B?${Buffer.from(d.subject, "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ].filter(Boolean);
    const mime = `${headers.join("\r\n")}\r\n\r\n${Buffer.from(d.body, "utf8").toString("base64")}`;
    const raw = Buffer.from(mime, "utf8").toString("base64url");

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { raw } }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) throw new Error(`Gmail draft creation failed: ${json.error?.message ?? res.status}`);
    return { externalId: json.id };
  }
}
