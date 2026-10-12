import { toJSONSchema } from "zod";
import { errorMessage } from "@/lib/util/text";
import type { AIService, GroundedRequest, GroundedResult, StructuredRequest } from "./service";

/** An HTTP failure from the provider; `status` lets the fallback wrapper tell "out of quota" from "bad request". */
export class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface ChatResponse {
  choices?: { message?: { content?: string | null; annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[] } }[];
  error?: { message?: string };
}

/**
 * Backup AI provider: OpenRouter (OpenAI-compatible chat API), routed to a Gemini model by default.
 * Only used by FallbackAI when Gemini is out of quota or unavailable. The API key is only ever sent as a
 * bearer header and never appears in an error message.
 */
export class OpenRouterAI implements AIService {
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { apiKey: string; model: string; fetchImpl?: typeof fetch }) {
    this.apiKey = opts.apiKey;
    this.modelName = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async chat(body: Record<string, unknown>): Promise<ChatResponse> {
    const res = await this.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", "x-title": "Funding Outreach Engine" },
      body: JSON.stringify({ model: this.modelName, ...body }),
      signal: AbortSignal.timeout(120_000),
    });
    const json = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok || json.error) throw new ProviderHttpError(res.ok ? 502 : res.status, `OpenRouter ${res.status}: ${json.error?.message ?? "request failed"}`);
    return json;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const { $schema: _ignored, ...schema } = toJSONSchema(req.schema) as Record<string, unknown>;
    void _ignored;
    let prompt = req.prompt;
    let lastError = "unknown";
    for (let attempt = 0; attempt < 2; attempt++) {
      const json = await this.chat({
        messages: [{ role: "system", content: req.system }, { role: "user", content: prompt }],
        temperature: req.temperature ?? 0.2,
        response_format: { type: "json_schema", json_schema: { name: req.task.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60), strict: true, schema } },
      });
      const raw = json.choices?.[0]?.message?.content ?? "";
      try {
        return req.schema.parse(JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
      } catch (err) {
        lastError = errorMessage(err);
        prompt = `${req.prompt}\n\nYour previous reply was invalid (${lastError.slice(0, 300)}). Reply again with ONLY valid JSON matching the schema.`;
      }
    }
    throw new Error(`OpenRouter returned invalid structured output for ${req.task}: ${lastError.slice(0, 300)}`);
  }

  async generateGrounded(req: GroundedRequest): Promise<GroundedResult> {
    const json = await this.chat({
      messages: [{ role: "system", content: req.system }, { role: "user", content: req.prompt }],
      temperature: 0.1,
      plugins: [{ id: "web", max_results: 5 }], // OpenRouter's live web search
    });
    const message = json.choices?.[0]?.message;
    const seen = new Set<string>();
    const sources: GroundedResult["sources"] = [];
    for (const a of message?.annotations ?? []) {
      const url = a.url_citation?.url;
      if (a.type === "url_citation" && url && !seen.has(url)) {
        seen.add(url);
        sources.push({ url, title: a.url_citation?.title ?? null });
      }
    }
    return { text: message?.content ?? "", sources };
  }
}
