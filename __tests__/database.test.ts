// Database contract test: runs the real migration and seed against Postgres +
// PostGIS, then reads the spots back the way the app does.
// Skipped unless DISCAMP_TEST_DB_URL points at an empty test database, e.g.
//   DISCAMP_TEST_DB_URL=postgres://postgres@localhost:5432/discamp npm test
// CI runs it against a throwaway PostGIS container.

import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

import { SEED_SPOTS } from '@/data/seedSpots';
import { parseSpotRows } from '@/data/spotsRepository';

const DB_URL = process.env.DISCAMP_TEST_DB_URL;
const ROOT = join(__dirname, '..');

function psql(args: string[], role?: string): string {
  const env = { ...process.env, PGOPTIONS: role ? `-c role=${role}` : '' };
  return execFileSync('psql', [DB_URL ?? '', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', ...args], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const sql = (statement: string, role?: string) => psql(['-c', statement], role);
const runFile = (file: string) => psql(['-f', join(ROOT, file)]);

function fails(statement: string, role?: string): boolean {
  try {
    sql(statement, role);
    return false;
  } catch {
    return true;
  }
}

const readSpots = (role?: string) => {
  const json = sql('select coalesce(json_agg(s order by s.name), $$[]$$::json) from public.spots_api s;', role);
  return JSON.parse(json) as unknown[];
};

const MIGRATIONS = readdirSync(join(ROOT, 'supabase', 'migrations'))
  .filter((file) => file.endsWith('.sql'))
  .sort();

(DB_URL ? describe : describe.skip)('database (Postgres + PostGIS)', () => {
  it('applies every migration and the seed, twice, without errors', () => {
    expect(MIGRATIONS).toEqual(['0001_init.sql', '0002_harden.sql']);
    sql('drop schema if exists public cascade; create schema public;');
    // Recreate what a new Supabase project has: the API roles, and default
    // privileges that give them everything on new tables, views and functions.
    // The migrations must lock that down themselves, so the test starts from
    // the same generous defaults instead of granting less.
    sql(
      'do $$ begin ' +
        "if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if; " +
        "if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; " +
        "if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; " +
        'end $$;',
    );
    sql('grant usage on schema public to anon, authenticated, service_role;');
    sql('alter default privileges in schema public grant all on tables to anon, authenticated, service_role;');
    sql('alter default privileges in schema public grant all on functions to anon, authenticated, service_role;');
    for (let run = 0; run < 2; run += 1) {
      for (const file of MIGRATIONS) runFile(`supabase/migrations/${file}`);
      sql('grant usage on schema extensions to anon, authenticated, service_role;');
      runFile('supabase/seed.sql');
    }
    expect(sql('select count(*) from public.spots;').trim()).toBe(String(SEED_SPOTS.length));
  });

  it('returns exactly the starter spots through the API view', () => {
    const { spots, skipped } = parseSpotRows(readSpots());
    expect(skipped).toBe(0);
    expect(spots).toEqual([...SEED_SPOTS].sort((a, b) => a.name.localeCompare(b.name)));
  });

  it('lets the app read spots but never change them', () => {
    for (const role of ['anon', 'authenticated']) {
      expect(readSpots(role)).toHaveLength(SEED_SPOTS.length);
      for (const target of ['public.spots', 'public.spots_api']) {
        expect(fails(`update ${target} set name = 'Hacked';`, role)).toBe(true);
        expect(fails(`delete from ${target};`, role)).toBe(true);
        expect(fails(`insert into ${target} (id) values ('sneaky');`, role)).toBe(true);
      }
      // Row-level security doesn't cover TRUNCATE; only the grants stop it.
      expect(fails('truncate public.spots;', role)).toBe(true);
      expect(sql(`select has_function_privilege('${role}', 'public.set_updated_at()', 'execute');`).trim()).toBe('f');
    }
    expect(sql("select name from public.spots where id = 'smoky-gardens';").trim()).toBe('Smoky Gardens');
  });

  it('keeps row-level security on, and the API view behind it', () => {
    expect(sql("select relrowsecurity from pg_class where oid = 'public.spots'::regclass;").trim()).toBe('t');
    expect(
      sql("select array_to_string(reloptions, ',') from pg_class where oid = 'public.spots_api'::regclass;"),
    ).toContain('security_invoker=true');
    expect(sql("select string_agg(cmd, ',') from pg_policies where tablename = 'spots';").trim()).toBe('SELECT');
  });

  it('keeps camper-earned fields when the seed runs again', () => {
    sql("update public.spots set report_count = 7, verified = true where id = 'smoky-gardens';");
    runFile('supabase/seed.sql');
    expect(sql("select report_count, verified from public.spots where id = 'smoky-gardens';").trim()).toBe('7|t');
    sql("update public.spots set report_count = 0, verified = false where id = 'smoky-gardens';");
  });

  it('rejects bad data at the database too', () => {
    const point = 'extensions.st_setsrid(extensions.st_makepoint(-101, 39), 4326)::extensions.geography';
    const insert = (column: string, value: string) =>
      `insert into public.spots (id, name, location, site_type, land_manager, ${column}) values ` +
      `('bad', 'Bad', ${point}, 'dispersed', 'BLM', ${value});`;
    const insertCore = (name: string, location: string) =>
      `insert into public.spots (id, name, location, site_type, land_manager) values ('bad', ${name}, ${location}, 'dispersed', 'BLM');`;

    expect(fails(insert('clearance_tier', '9'))).toBe(true);
    expect(fails(insert('hookups', "array['wifi']"))).toBe(true);
    expect(fails(insert('hookups', "'{{electric,water}}'"))).toBe(true);
    expect(fails(insert('amenities', "array['Restroom', null]"))).toBe(true);
    expect(fails(insert('rules', "'{{a,b}}'"))).toBe(true);
    expect(fails(insert('nightly_fee_usd', '-1'))).toBe(true);
    expect(fails(insert('sources', `'{"not": "an array"}'::jsonb`))).toBe(true);
    expect(fails(insert('phone', "'call me'"))).toBe(true);
    expect(fails(insert('phone', "'.......'"))).toBe(true);
    expect(fails(insert('stay_limit_days', '0'))).toBe(true);
    expect(fails(insertCore("e'\\t'", point))).toBe(true);
    expect(fails(insertCore("'Empty'", "'POINT EMPTY'::extensions.geography"))).toBe(true);
    expect(fails(insertCore("'Nowhere'", "'POINT(NaN NaN)'::extensions.geography"))).toBe(true);

    // And it still takes a normal spot.
    expect(fails(insert('phone', "'(785) 899-6334'"))).toBe(false);
    sql("delete from public.spots where id = 'bad';");
  });

  it('keeps updated_at current', () => {
    const before = sql("select updated_at from public.spots where id = 'smoky-gardens';").trim();
    sql("update public.spots set report_count = report_count where id = 'smoky-gardens';");
    const after = sql("select updated_at from public.spots where id = 'smoky-gardens';").trim();
    expect(Date.parse(after)).toBeGreaterThanOrEqual(Date.parse(before));
    expect(after).not.toBe(before);
  });
});
