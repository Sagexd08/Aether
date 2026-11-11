import Database from 'better-sqlite3';
import pg from 'pg';
import { existsSync } from 'fs';
import { config } from '../src/config/env.js';
import { initializeDatabase } from '../src/database/schema.js';
import { closeDb } from '../src/database/db.js';

const TABLES = [
  'prompts', 'usage', 'settings', 'lora_models', 'training_images', 'users', 'sessions',
  'jobs', 'generations', 'session_preferences', 'user_preferences', 'refresh_tokens',
  'ml_inference_results', 'ml_model_metrics', 'ml_ab_test_assignments', 'ml_user_feedback',
  'ml_model_versions',
];
const SERIAL_TABLES = ['usage', 'training_images'];
const FK_VIOLATION = '23503';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (!existsSync(config.databasePath)) {
    throw new Error(`SQLite file not found: ${config.databasePath}`);
  }
  const sqlite = new Database(config.databasePath, { readonly: true });
  const sqliteTables = new Set(
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name)
  );

  if (dryRun) {
    for (const table of TABLES.filter((t) => sqliteTables.has(t))) {
      const { c } = sqlite.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number };
      console.log(`${table.padEnd(24)} ${c}`);
    }
    return;
  }

  if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
  await initializeDatabase();
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();

  const report: string[] = [];
  try {
    for (const table of TABLES) {
      if (!sqliteTables.has(table)) continue;
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      let inserted = 0;
      let orphaned = 0;

      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
        try {
          const result = await client.query(sql, columns.map((c) => row[c]));
          inserted += result.rowCount ?? 0;
        } catch (error: any) {
          if (error.code !== FK_VIOLATION) throw new Error(`${table}: ${error.message}`);
          orphaned += 1;
        }
      }

      if (SERIAL_TABLES.includes(table)) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM "${table}"`
        );
      }
      const { rows: count } = await client.query(`SELECT COUNT(*)::int AS c FROM "${table}"`);
      report.push(
        `${table.padEnd(24)} sqlite=${String(rows.length).padStart(5)}  inserted=${String(inserted).padStart(5)}  ` +
          `orphaned-skipped=${String(orphaned).padStart(3)}  neon-total=${count[0].c}`
      );
    }
  } finally {
    await client.end();
    await closeDb();
  }
  console.log(report.join('\n'));
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
