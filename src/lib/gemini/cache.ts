import { db } from "@/lib/supabase/admin";
import type { AICache } from "./service";

export class SupabaseAICache implements AICache {
  async get(task: string, inputHash: string, model: string): Promise<unknown | null> {
    const { data } = await db()
      .from("ai_calls")
      .select("output_json")
      .eq("task", task)
      .eq("input_hash", inputHash)
      .eq("model", model)
      .maybeSingle();
    return data?.output_json ?? null;
  }

  async put(e: Parameters<AICache["put"]>[0]): Promise<void> {
    await db()
      .from("ai_calls")
      .upsert(
        {
          task: e.task,
          input_hash: e.inputHash,
          model: e.model,
          output_json: e.output,
          prompt_tokens: e.promptTokens ?? null,
          output_tokens: e.outputTokens ?? null,
          latency_ms: e.latencyMs,
        },
        { onConflict: "task,input_hash,model", ignoreDuplicates: true },
      );
  }
}
