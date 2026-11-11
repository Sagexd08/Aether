import { describe, expect, it } from 'vitest';
import { toPostgres } from '../src/database/db.js';

describe('toPostgres', () => {
  it('numbers placeholders in order', () => {
    expect(toPostgres('SELECT * FROM t WHERE a = ? AND b = ?')).toBe('SELECT * FROM t WHERE a = $1 AND b = $2');
  });

  it('rewrites strftime now to epoch seconds', () => {
    expect(toPostgres("UPDATE t SET at = strftime('%s', 'now') WHERE id = ?")).toBe(
      'UPDATE t SET at = (extract(epoch from now())::bigint) WHERE id = $1'
    );
  });

  it('leaves SQL without placeholders unchanged', () => {
    expect(toPostgres('SELECT 1')).toBe('SELECT 1');
  });
});
