import { GoogleGenAI, ApiError } from "@google/genai";
import type { z } from "zod";
import { toJSONSchema } from "zod";
import { requireEnv } from "@/lib/env";
import { errorMessage, sha256, sleep } from "@/lib/util/text";

/**
 * Provider-neutral AI contract used by the pipeline. The only implementation
 * shipped is Gemini Flash (see GeminiService) — Claude/Anthropic/OpenAI are
 * deliberately NOT used at runtime.
 */
export interface StructuredRequest<T> {
  /** Stable task id, used for caching and auditing (e.g. "classify_article"). */
  task: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
}

export interface GroundedRequest {
  task: string;
  system: string;
  prompt: string;
}

export interface GroundedResult {
  text: string;
  sources: { url: string; title: string | null }[];
}

export interface AIService {
  readonly modelName: string;
  generateStructured<T>(req: StructuredRequest<T>): Promise<T>;
  /** Free-text answer backed by live Google Search grounding (used for startup research). */
  generateGrounded(req: GroundedRequest): Promise<GroundedResult>;
}

/** Optional persistence so identical inputs never trigger a second paid call. */
export interface AICache {
  get(task: string, inputHash: string, model: string): Promise<unknown | null>;
  put(entry: { task: string; inputHash: string; model: string; output: unknown; promptTokens?: number; outputTokens?: number; latencyMs: number }): Promise<void>;
}

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

export class GeminiService implements AIService {
  private readonly ai: GoogleGenAI;
  readonly modelName: string;

  constructor(private readonly cache?: AICache, opts?: { apiKey?: string; model?: string }) {
    this.ai = new GoogleGenAI({ apiKey: opts?.apiKey ?? requireEnv("GOOGLE_GENERATIVE_AI_API_KEY") });
    // No silent default: the operator must choose the exact Flash model id.
    this.modelName = opts?.model ?? requireEnv("GEMINI_MODEL");
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const jsonSchema = cleanSchema(toJSONSchema(req.schema));
    const inputHash = sha256(req.task, req.system, req.prompt, JSON.stringify(jsonSchema));

    if (this.cache) {
      const hit = await this.cache.get(req.task, inputHash, this.modelName).catch(() => null);
      if (hit != null) {
        const parsed = req.schema.safeParse(hit);
        if (parsed.success) return parsed.data;
      }
    }

    const started = Date.now();
    let prompt = req.prompt;
    let lastError = "unknown";
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.callWithRetry(() =>
        this.ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            systemInstruction: req.system,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            temperature: req.temperature ?? 0.2,
          },
        }),
      );
      const raw = res.text ?? "";
      try {
        const data = req.schema.parse(JSON.parse(stripFences(raw)));
        if (this.cache) {
          await this.cache
            .put({
              task: req.task,
              inputHash,
              model: this.modelName,
              output: data,
              promptTokens: res.usageMetadata?.promptTokenCount,
              outputTokens: res.usageMetadata?.candidatesTokenCount,
              latencyMs: Date.now() - started,
            })
            .catch(() => undefined);
        }
        return data;
      } catch (err) {
        lastError = errorMessage(err);
        // One repair attempt: tell the model exactly what was wrong with its output.
        prompt = `${req.prompt}\n\nYour previous reply was invalid (${truncateMsg(lastError)}). Reply again with ONLY valid JSON matching the schema.`;
      }
    }
    throw new Error(`Gemini returned invalid structured output for ${req.task}: ${truncateMsg(lastError)}`);
  }

  async generateGrounded(req: GroundedRequest): Promise<GroundedResult> {
    const res = await this.callWithRetry(() =>
      this.ai.models.generateContent({
        model: this.modelName,
        contents: req.prompt,
        config: { systemInstruction: req.system, tools: [{ googleSearch: {} }], temperature: 0.1 },
      }),
    );
    const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const sources: GroundedResult["sources"] = [];
    for (const c of chunks) {
      const url = c.web?.uri;
      if (url && !seen.has(url)) {
        seen.add(url);
        sources.push({ url, title: c.web?.title ?? null });
      }
    }
    return { text: res.text ?? "", sources };
  }

  /** Conservative retry: transient HTTP statuses only, exponential backoff, max 4 attempts. */
  private async callWithRetry<R>(fn: () => Promise<R>): Promise<R> {
    const delays = [2_000, 6_000, 15_000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (!TRANSIENT.has(status) || attempt >= delays.length) throw err;
        const hinted = errorMessage(err).match(/retry in ([\d.]+)s/i);
        await sleep(Math.min(hinted ? Number(hinted[1]) * 1000 + 500 : delays[attempt], 30_000));
      }
    }
  }
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function truncateMsg(s: string): string {
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

/** Gemini's responseJsonSchema rejects some meta keywords zod emits. */
function cleanSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = schema;
  void _ignored;
  return rest;
}
