import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

/**
 * Proves the atomic run lock inside a transaction that is ROLLED BACK (real data untouched).
 * Needs SUPABASE_DB_URL.
 */
const suite = process.env.SUPABASE_DB_URL ? describe : describe.skip;

suite("pipeline run lock in Postgres (rolled back)", () => {
  it("only one owner at a time; expired leases are taken over and stale running rows are failed", async () => {
    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query("begin");
      await client.query("delete from pipeline_lock");
      const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
      const acquire = async (id: string, ttl = 300) => (await client.query("select acquire_pipeline_lock($1, $2) as ok", [id, ttl])).rows[0].ok as boolean;

      expect(await acquire(a)).toBe(true);
      expect(await acquire(b)).toBe(false); // live lease held by a

      // b cannot release a's lease
      expect((await client.query("select release_pipeline_lock($1) as ok", [b])).rows[0].ok).toBe(false);
      expect(await acquire(b)).toBe(false);

      // owner releases → next caller can acquire
      expect((await client.query("select release_pipeline_lock($1) as ok", [a])).rows[0].ok).toBe(true);
      expect(await acquire(b)).toBe(true);

      // b "crashes": its run row stays running and its lease expires → c takes over and the stale row is failed
      await client.query("insert into pipeline_runs (id, trigger) values ($1, 'test')", [b]);
      await client.query("update pipeline_lock set expires_at = now() - interval '1 second'");
      expect(await acquire(c)).toBe(true);
      const { rows: [stale] } = await client.query("select status, completed_at, errors_json from pipeline_runs where id = $1", [b]);
      expect(stale.status).toBe("failed");
      expect(stale.completed_at).not.toBeNull();
      expect(stale.errors_json[0].scope).toBe("stale_run");
    } finally {
      await client.query("rollback");
      await client.end();
    }
  });
});
