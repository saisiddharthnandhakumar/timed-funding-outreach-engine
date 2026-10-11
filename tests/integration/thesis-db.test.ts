import { describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Proves the DB-level thesis contract inside a transaction that is ROLLED BACK,
 * so the operator's real data is never touched. Needs SUPABASE_DB_URL.
 */
const suite = process.env.SUPABASE_DB_URL ? describe : describe.skip;

suite("thesis versioning in Postgres (rolled back)", () => {
  it("new version → new active row; previous assessment keeps its thesis/version/score; weights must total 100", async () => {
    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query("begin");
      const { rows: [v1] } = await client.query(`select * from accelerator_theses where active`);
      const { rows: criteria } = await client.query(`select criterion_key, display_name, description, weight, enabled, sort_order from scoring_criteria where thesis_id = $1 order by sort_order`, [v1.id]);

      // Fixture startup/round + an assessment made under v1.
      const { rows: [s] } = await client.query(`insert into startups (name, normalized_name) values ('Fixture ThesisCo', 'fixturethesisco') returning id`);
      const { rows: [r] } = await client.query(`insert into funding_rounds (startup_id, stage, announcement_date) values ($1, 'seed', current_date) returning id`, [s.id]);
      const { rows: [a] } = await client.query(
        `insert into fit_assessments (startup_id, funding_round_id, thesis_id, thesis_version, total_score, qualified, criterion_scores_json, scoring_snapshot, model_name)
         values ($1,$2,$3,$4,75,true,'{}','{"minimum_fit_score":70}','fixture') returning id`,
        [s.id, r.id, v1.id, v1.version],
      );

      const payload = (over: Record<string, unknown>) => ({
        name: v1.name, description: v1.description, natural_language_thesis: v1.natural_language_thesis,
        allowed_countries: v1.allowed_countries, allowed_stages: v1.allowed_stages, included_sectors: v1.included_sectors,
        preferred_subsectors: v1.preferred_subsectors, excluded_sectors: v1.excluded_sectors, preferred_business_models: v1.preferred_business_models,
        max_announcement_age_hours: v1.max_announcement_age_hours, minimum_fit_score: v1.minimum_fit_score,
        recency_bands: v1.recency_bands, stage_points: v1.stage_points, criteria, ...over,
      });

      // Invalid weights are rejected by the database function.
      await client.query("savepoint bad");
      const bad = criteria.map((c) => (c.criterion_key === "traction" ? { ...c, weight: 11 } : c));
      await expect(client.query(`select save_thesis_version($1::jsonb)`, [JSON.stringify(payload({ criteria: bad }))])).rejects.toThrow(/total 100/);
      await client.query("rollback to savepoint bad");

      // Valid edit → version +1, active; v1 deactivated but intact.
      const { rows: [{ save_thesis_version: v2id }] } = await client.query(`select save_thesis_version($1::jsonb)`, [JSON.stringify(payload({ minimum_fit_score: 95 }))]);
      const { rows: active } = await client.query(`select id, version, minimum_fit_score from accelerator_theses where active`);
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({ id: v2id, version: v1.version + 1, minimum_fit_score: 95 });
      const { rows: [old] } = await client.query(`select active, minimum_fit_score from accelerator_theses where id = $1`, [v1.id]);
      expect(old).toMatchObject({ active: false, minimum_fit_score: v1.minimum_fit_score });

      // The historical assessment is unchanged.
      const { rows: [after] } = await client.query(`select thesis_id, thesis_version, total_score, qualified from fit_assessments where id = $1`, [a.id]);
      expect(after).toMatchObject({ thesis_id: v1.id, thesis_version: v1.version, total_score: 75, qualified: true });
    } finally {
      await client.query("rollback");
      await client.end();
    }
  });
});
