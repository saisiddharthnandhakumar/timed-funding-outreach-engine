import { ApiError } from "@google/genai";
import type { AIService, GroundedRequest, GroundedResult, StructuredRequest } from "./service";
import { ProviderHttpError } from "./openrouter";

/** Statuses that mean "this provider cannot serve the request right now" (quota, overload, outage), not "the request is wrong". */
const UNAVAILABLE = new Set([429, 500, 502, 503, 504]);
const QUOTA = 429;

const statusOf = (err: unknown): number => (err instanceof ApiError || err instanceof ProviderHttpError ? err.status : 0);

/**
 * Runs every request on the primary provider and, when it is out of quota or unavailable, on the backup.
 * After a 429 the primary is skipped for `cooldownMs` so a quota-exhausted run does not retry it for every article.
 * Anything else (bad request, invalid output) is NOT a reason to switch and is thrown as before.
 */
export class FallbackAI implements AIService {
  private primaryBlockedUntil = 0;

  constructor(
    private readonly primary: AIService,
    private readonly backup: AIService,
    private readonly opts: { cooldownMs?: number; now?: () => number; onFallback?: (task: string, reason: string) => void } = {},
  ) {}

  get modelName() {
    return this.primary.modelName;
  }

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  private async run<R>(task: string, call: (ai: AIService) => Promise<R>): Promise<R> {
    if (this.now() >= this.primaryBlockedUntil) {
      try {
        return await call(this.primary);
      } catch (err) {
        const status = statusOf(err);
        if (!UNAVAILABLE.has(status)) throw err;
        if (status === QUOTA) this.primaryBlockedUntil = this.now() + (this.opts.cooldownMs ?? 10 * 60_000);
        this.opts.onFallback?.(task, `primary returned ${status}`);
      }
    }
    return call(this.backup);
  }

  generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    return this.run(req.task, (ai) => ai.generateStructured(req));
  }

  generateGrounded(req: GroundedRequest): Promise<GroundedResult> {
    return this.run(req.task, (ai) => ai.generateGrounded(req));
  }
}
