/**
 * Minimal Telegram Bot API client (sendMessage only). The bot token is a secret: it lives only in the request URL
 * Telegram requires, and is scrubbed from every error string that leaves this file.
 */
export interface TelegramConfig {
  token: string;
  chatId: string;
}

export type TelegramResult = { ok: true } | { ok: false; error: string };

const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
/** Telegram's HTML parse mode only needs these three escaped. Always run user/article text through this. */
export const esc = (s: string) => s.replace(/[&<>]/g, (c) => escapes[c]);

export async function sendTelegram(cfg: TelegramConfig, html: string, fetchImpl: typeof fetch = fetch): Promise<TelegramResult> {
  const scrub = (m: string) => m.split(cfg.token).join("[token]");
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (res.ok && body.ok) return { ok: true };
    return { ok: false, error: scrub(`Telegram ${res.status}${body.description ? `: ${body.description}` : ""}`) };
  } catch (err) {
    return { ok: false, error: scrub(`Could not reach Telegram: ${err instanceof Error ? err.message : String(err)}`) };
  }
}
