import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Server-side only: the key is never prefixed
 * NEXT_PUBLIC_, and no client component imports this module. RLS is enabled
 * on every table with no policies, so the anon key cannot read anything.
 */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Throw on a Supabase error with context; return data otherwise. */
export function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }, ctx: string): T {
  if (res.error) {
    const err = new Error(`${ctx}: ${res.error.message}`) as Error & { code?: string };
    err.code = res.error.code;
    throw err;
  }
  return res.data as T;
}
