// Keeps supabase/seed.sql in step with src/data/seedSpots.ts.
// If this fails after you edit the starter spots, run: npm run seed:sql

import { describe, expect, it } from '@jest/globals';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { SEED_SPOTS } from '@/data/seedSpots';

import { buildSeedSql } from '../scripts/seedSql';

const SEED_FILE = join(__dirname, '..', 'supabase', 'seed.sql');

describe('supabase/seed.sql', () => {
  const generated = buildSeedSql(SEED_SPOTS);

  if (process.env.UPDATE_SEED_SQL) {
    writeFileSync(SEED_FILE, generated);
  }

  it('matches the starter spots in the app', () => {
    expect(readFileSync(SEED_FILE, 'utf8')).toBe(generated);
  });

  it('escapes quotes so names like "Bob\'s Flat" are safe', () => {
    const sql = buildSeedSql([{ ...SEED_SPOTS[0]!, id: 'bobs', name: "Bob's Flat", sources: [] }]);
    expect(sql).toContain("'Bob''s Flat'");
    expect(sql).not.toContain("'Bob's Flat'");
  });

  it('refreshes existing spots when run again, but keeps camper-earned fields', () => {
    expect(generated).toContain('on conflict (id) do update set');
    expect(generated).toContain('name = excluded.name');
    expect(generated).not.toContain('verified = excluded.verified');
    expect(generated).not.toContain('report_count = excluded.report_count');
  });
});
