import { describe, expect, it } from "vitest";
import { ApiError } from "@google/genai";
import { z } from "zod";
import { FallbackAI } from "@/lib/gemini/fallback";
import { OpenRouterAI, ProviderHttpError } from "@/lib/gemini/openrouter";
import type { AIService } from "@/lib/gemini/service";

const quota = () => new ApiError({ message: "You exceeded your current quota", status: 429 });
const req = { task: "t", system: "s", prompt: "p" };

function fake(name: string, calls: string[], fail?: () => Error): AIService {
  return {
    modelName: name,
    async generateStructured<T>() {
      calls.push(name);
      if (fail) throw fail();
      return { from: name } as T;
    },
    async generateGrounded() {
      calls.push(name);
      if (fail) throw fail();
      return { text: name, sources: [] };
    },
  };
}
const structured = { ...req, schema: z.object({ from: z.string() }) };

describe("FallbackAI", () => {
  it("uses the backup when the primary is out of quota, then skips the primary during the cooldown", async () => {
    const calls: string[] = [];
    let t = 0;
    const reasons: string[] = [];
    const ai = new FallbackAI(fake("gemini", calls, quota), fake("openrouter", calls), { now: () => t, cooldownMs: 1000, onFallback: (_t, r) => reasons.push(r) });
    expect((await ai.generateGrounded(req)).text).toBe("openrouter");
    expect((await ai.generateStructured(structured)).from).toBe("openrouter");
    expect(calls).toEqual(["gemini", "openrouter", "openrouter"]); // primary not retried during the cooldown
    t = 2000;
    await ai.generateGrounded(req);
    expect(calls.slice(3)).toEqual(["gemini", "openrouter"]); // cooldown over: primary is tried again
    expect(reasons).toEqual(["primary returned 429", "primary returned 429"]);
  });

  it("also covers a primary outage (503) without blocking the primary", async () => {
    const calls: string[] = [];
    const ai = new FallbackAI(fake("gemini", calls, () => new ApiError({ message: "unavailable", status: 503 })), fake("openrouter", calls));
    await ai.generateGrounded(req);
    await ai.generateGrounded(req);
    expect(calls).toEqual(["gemini", "openrouter", "gemini", "openrouter"]);
  });

  it("does not switch for errors that are the request's fault", async () => {
    const calls: string[] = [];
    const ai = new FallbackAI(fake("gemini", calls, () => new ApiError({ message: "bad request", status: 400 })), fake("openrouter", calls));
    await expect(ai.generateGrounded(req)).rejects.toThrow("bad request");
    expect(calls).toEqual(["gemini"]);
  });

  it("uses the primary when it works, and reports the primary's model name", async () => {
    const calls: string[] = [];
    const ai = new FallbackAI(fake("gemini", calls), fake("openrouter", calls));
    expect((await ai.generateStructured(structured)).from).toBe("gemini");
    expect(calls).toEqual(["gemini"]);
    expect(ai.modelName).toBe("gemini");
  });

  it("a failing backup surfaces its own error", async () => {
    const ai = new FallbackAI(fake("gemini", [], quota), fake("openrouter", [], () => new ProviderHttpError(401, "OpenRouter 401: bad key")));
    await expect(ai.generateGrounded(req)).rejects.toThrow("OpenRouter 401");
  });
});

describe("OpenRouterAI", () => {
  const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("sends the key as a bearer header, asks for the JSON schema, and parses the answer", async () => {
    let seen: { url: string; headers: Headers; body: Record<string, any> } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, headers: new Headers(init.headers), body: JSON.parse(init.body as string) };
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"from":"x"}\n```' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const ai = new OpenRouterAI({ apiKey: "sk-or-secret", model: "google/gemini-3.8-flash", fetchImpl });
    expect(await ai.generateStructured(structured)).toEqual({ from: "x" });
    expect(seen!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(seen!.headers.get("authorization")).toBe("Bearer sk-or-secret");
    expect(seen!.body.model).toBe("google/gemini-3.8-flash");
    expect(seen!.body.response_format.type).toBe("json_schema");
    expect(seen!.body.response_format.json_schema.schema.$schema).toBeUndefined();
  });

  it("repairs invalid output once, then gives up", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(new OpenRouterAI({ apiKey: "k", model: "m", fetchImpl }).generateStructured(structured)).rejects.toThrow(/invalid structured output/);
    expect(n).toBe(2);
  });

  it("grounded: enables web search and returns de-duplicated citations", async () => {
    let body: Record<string, any> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: "tessolve.com", annotations: [
        { type: "url_citation", url_citation: { url: "https://a.example", title: "A" } },
        { type: "url_citation", url_citation: { url: "https://a.example", title: "A again" } },
        { type: "url_citation", url_citation: { url: "https://b.example" } },
      ] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new OpenRouterAI({ apiKey: "k", model: "m", fetchImpl }).generateGrounded(req);
    expect(body.plugins).toEqual([{ id: "web", max_results: 5 }]);
    expect(r).toEqual({ text: "tessolve.com", sources: [{ url: "https://a.example", title: "A" }, { url: "https://b.example", title: null }] });
  });

  it("HTTP errors carry the status and never the key", async () => {
    const ai = new OpenRouterAI({ apiKey: "sk-or-secret", model: "m", fetchImpl: reply({ error: { message: "rate limited" } }, 429) });
    const err = await ai.generateGrounded(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err.status).toBe(429);
    expect(err.message).not.toContain("sk-or-secret");
  });
});
