/** Lists Flash models available to your key so you can set GEMINI_MODEL explicitly. */
import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";
config({ path: ".env.local" });
config();

async function main() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey: key });
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  for await (const m of pager) {
    if (/flash/i.test(m.name ?? "") && (m.supportedActions ?? []).includes("generateContent")) {
      console.log(`${(m.name ?? "").replace(/^models\//, "")}\t${m.displayName ?? ""}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
