/**
 * Telegram helper.
 *   npm run telegram            → finds your chat id (message the bot first) and prints it
 *   npm run telegram -- --test  → sends a test message to TELEGRAM_CHAT_ID
 * Reads TELEGRAM_BOT_TOKEN (and TELEGRAM_CHAT_ID) from .env.local. Never prints the token.
 */
import { config } from "dotenv";
import { sendTelegram } from "../src/lib/telegram/client";
config({ path: ".env.local" });
config();

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set in .env.local (create a bot with @BotFather first; see README → Telegram).");

  if (process.argv.includes("--test")) {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId) throw new Error("TELEGRAM_CHAT_ID is not set. Run `npm run telegram` first to find it.");
    const r = await sendTelegram({ token, chatId }, "✅ <b>Funding Outreach</b> is connected. You will get an alert here when a startup is found and a draft is ready, and again 2 hours before its 24-hour window closes.");
    console.log(r.ok ? "Test message sent." : `Failed: ${r.error}`);
    process.exit(r.ok ? 0 : 1);
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const body = (await res.json()) as { ok: boolean; description?: string; result?: { message?: { chat: { id: number; type: string; title?: string; first_name?: string; username?: string } } }[] };
  if (!body.ok) throw new Error(`Telegram says: ${body.description ?? res.status}`);
  const chats = new Map<number, string>();
  for (const u of body.result ?? []) {
    const c = u.message?.chat;
    if (c) chats.set(c.id, `${c.type} · ${c.title ?? c.first_name ?? c.username ?? ""}`);
  }
  if (!chats.size) {
    console.log("No messages yet. Open your bot in Telegram, press Start (or send it any message), then run this again.");
    return;
  }
  for (const [id, label] of chats) console.log(`TELEGRAM_CHAT_ID=${id}   (${label})`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
