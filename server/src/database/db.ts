import pg from 'pg';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

pg.types.setTypeParser(20, (value) => parseInt(value, 10));
pg.types.setTypeParser(1700, (value) => parseFloat(value));

export type SqlParams = readonly unknown[];

export interface Queryable {
  all<T = any>(sql: string, params?: SqlParams): Promise<T[]>;
  get<T = any>(sql: string, params?: SqlParams): Promise<T | undefined>;
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
}

const EPOCH_NOW = '(extract(epoch from now())::bigint)';

export function toPostgres(sql: string): string {
  let index = 0;
  return sql
    .replace(/strftime\(\s*['"]%s['"]\s*,\s*['"]now['"]\s*\)/g, EPOCH_NOW)
    .replace(/\?/g, () => `$${++index}`);
}

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (pool) return pool;
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set (Neon Postgres connection string required)');
  }
  pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5, idleTimeoutMillis: 30_000 });
  pool.on('error', (error) => logger.error({ err: error }, 'idle database client error'));
  return pool;
}

type Executor = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

function bind(executor: () => Executor): Queryable {
  const execute = (sql: string, params: SqlParams = []) =>
    executor().query(toPostgres(sql), params as unknown[]);
  return {
    async all<T = any>(sql: string, params?: SqlParams): Promise<T[]> {
      return (await execute(sql, params)).rows as T[];
    },
    async get<T = any>(sql: string, params?: SqlParams): Promise<T | undefined> {
      return (await execute(sql, params)).rows[0] as T | undefined;
    },
    async run(sql: string, params?: SqlParams): Promise<{ changes: number }> {
      return { changes: (await execute(sql, params)).rowCount ?? 0 };
    },
  };
}

export const db: Queryable = bind(getPool);

export async function transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(bind(() => client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function execScript(sql: string): Promise<void> {
  await getPool().query(sql);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
