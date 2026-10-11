/**
 * Applies supabase/migrations/*.sql to the database in SUPABASE_DB_URL, in
 * filename order, recording applied files in public._app_migrations so reruns
 * are no-ops. Usage: npm run db:migrate
 */
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("SUPABASE_DB_URL is not set (see .env.example).");
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(
    `create table if not exists public._app_migrations (name text primary key, applied_at timestamptz not null default now())`,
  );
  await client.query(`alter table public._app_migrations enable row level security`);
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query<{ name: string }>(`select name from public._app_migrations`);
  const applied = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(`insert into public._app_migrations (name) values ($1)`, [file]);
      await client.query("commit");
      console.log(`apply  ${file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`FAILED ${file}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  const { rows: tables } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema='public' order by 1`,
  );
  console.log("public tables:", tables.map((t) => t.table_name).join(", "));
  await client.end();
}
main();
