import { db } from "@/lib/supabase/admin";

/** Monthly free-quota budget for rate-limited providers. */
export interface Budget {
  /** Spend `amount` units from `provider`'s monthly limit; false (and nothing spent) if that would exceed it. */
  consume(provider: string, limit: number, amount?: number): Promise<boolean>;
}

const period = (d = new Date()) => d.toISOString().slice(0, 7);

export class SupabaseBudget implements Budget {
  async consume(provider: string, limit: number, amount = 1): Promise<boolean> {
    const res = await db().rpc("consume_enrichment_budget", { p_provider: provider, p_period: period(), p_limit: limit, p_amount: amount });
    if (res.error) throw new Error(`budget ${provider}: ${res.error.message}`);
    return res.data === true;
  }
}

export class MemoryBudget implements Budget {
  private readonly used = new Map<string, number>();
  async consume(provider: string, limit: number, amount = 1): Promise<boolean> {
    const next = (this.used.get(provider) ?? 0) + amount;
    if (next > limit) return false;
    this.used.set(provider, next);
    return true;
  }
}
