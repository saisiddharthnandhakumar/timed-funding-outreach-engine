import { env } from "@/lib/env";
import { FallbackAI } from "@/lib/gemini/fallback";
import { OpenRouterAI } from "@/lib/gemini/openrouter";
import { GeminiService } from "@/lib/gemini/service";
import { SupabaseAICache } from "@/lib/gemini/cache";

/**
 * The single place the runtime AI implementation is chosen: Gemini Flash, with OpenRouter as an optional
 * backup that is used only when Gemini is out of quota or unavailable (set OPENROUTER_API_KEY to enable).
 */
export function getAI() {
  const e = env();
  const gemini = new GeminiService(new SupabaseAICache(), { failFastOnQuota: Boolean(e.OPENROUTER_API_KEY) });
  if (!e.OPENROUTER_API_KEY) return gemini;
  return new FallbackAI(gemini, new OpenRouterAI({ apiKey: e.OPENROUTER_API_KEY, model: e.OPENROUTER_MODEL ?? "google/gemini-3.8-flash" }), {
    onFallback: (task, reason) => console.warn(`AI backup (OpenRouter) used for ${task}: ${reason}`),
  });
}
