import { GeminiService } from "@/lib/gemini/service";
import { SupabaseAICache } from "@/lib/gemini/cache";

/** The single place the runtime AI implementation is chosen: Gemini Flash. */
export function getAI() {
  return new GeminiService(new SupabaseAICache());
}
