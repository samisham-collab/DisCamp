// Database contract test: runs the real migrations and seed against Postgres +
// PostGIS, then reads and writes spots the way the app does, as visitors and
// as signed-in campers.
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

const sql = (statement: string, role?: string) => psql(['-c', statement], role).trim();
const runFile = (file: string) => psql(['-f', join(ROOT, file)]);

/** Runs a statement the way PostgREST does for a signed-in camper. */
const asCamper = (uid: string, statement: string) =>
  psql([
    '-c',
    `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${uid}'; ${statement}; commit;`,
  ]).trim();

function fails(run: () => unknown): boolean {
  try {
    run();
    return false;
  } catch {
    return true;
  }
}

/** The error Postgres reported, or '' if the statement worked. */
function errorOf(run: () => unknown): string {
  try {
    run();
    return '';
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? error);
  }
}

const readSpots = (role?: string) => {
  const json = sql('select coalesce(json_agg(s order by s.name), $$[]$$::json) from public.spots_api s;', role);
  return JSON.parse(json) as unknown[];
};

const MIGRATIONS = readdirSync(join(ROOT, 'supabase', 'migrations'))
  .filter((file) => file.endsWith('.sql'))
  .sort();

const SAM = '11111111-1111-4111-8111-111111111111';
const ALEX = '22222222-2222-4222-8222-222222222222';
const POINT = `'SRID=4326;POINT(-113.05 42.32)'`;

/** A spot insert with the columns the app sends. */
const addSpot = (name: string, extra = '') =>
  `insert into public.spots (name, location, site_type, land_manager${extra ? ', ' + extra.split('=')[0] : ''}) ` +
  `values ('${name}', ${POINT}, 'dispersed', 'BLM'${extra ? ', ' + extra.split('=').slice(1).join('=') : ''})`;

const spotIdNamed = (name: string) => sql(`select id from public.spots where name = '${name}';`);

(DB_URL ? describe : describe.skip)('database (Postgres + PostGIS)', () => {
  it('applies every migration and the seed, each twice in a row, without errors', () => {
    expect(MIGRATIONS).toEqual(['0001_init.sql', '0002_harden.sql', '0003_accounts.sql']);
    sql('drop schema if exists public cascade; create schema public;');
    // Recreate what a new Supabase project has: the API roles, default
    // privileges that give them everything on new tables, views and
    // functions, and the auth schema with its users table and auth.uid().
    // The migrations must lock things down themselves, so the test starts
    // from the same generous defaults instead of granting less.
    sql(
      'do $$ begin ' +
        "if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if; " +
        "if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; " +
        "if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; " +
        'end $$;',
    );
    sql(
      'drop schema if exists auth cascade; create schema auth; ' +
        'create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb); ' +
        'create function auth.uid() returns uuid language sql stable as ' +
        "$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; " +
        'grant usage on schema auth to anon, authenticated, service_role; ' +
        'grant execute on function auth.uid() to anon, authenticated, service_role;',
    );
    sql('grant usage on schema public to anon, authenticated, service_role;');
    sql('alter default privileges in schema public grant all on tables to anon, authenticated, service_role;');
    sql('alter default privileges in schema public grant all on functions to anon, authenticated, service_role;');
    for (const file of MIGRATIONS) {
      runFile(`supabase/migrations/${file}`);
      runFile(`supabase/migrations/${file}`);
      sql('grant usage on schema extensions to anon, authenticated, service_role;');
    }
    runFile('supabase/seed.sql');
    runFile('supabase/seed.sql');
    expect(sql('select count(*) from public.spots;')).toBe(String(SEED_SPOTS.length));
  });

  it('returns exactly the starter spots through the API view', () => {
    const { spots, skipped } = parseSpotRows(readSpots());
    expect(skipped).toBe(0);
    expect(spots).toEqual([...SEED_SPOTS].sort((a, b) => a.name.localeCompare(b.name)));
  });

  it('lets visitors read spots and nothing else', () => {
    expect(readSpots('anon')).toHaveLength(SEED_SPOTS.length);
    for (const target of ['public.spots', 'public.spots_api', 'public.profiles']) {
      expect(fails(() => sql(`update ${target} set name = 'Hacked';`, 'anon'))).toBe(true);
      expect(fails(() => sql(`delete from ${target};`, 'anon'))).toBe(true);
    }
    expect(fails(() => sql(`${addSpot('Sneaky')};`, 'anon'))).toBe(true);
    // Row-level security doesn't cover TRUNCATE; only the grants stop it.
    for (const role of ['anon', 'authenticated']) {
      expect(fails(() => sql('truncate public.spots;', role))).toBe(true);
      expect(fails(() => sql('truncate public.profiles;', role))).toBe(true);
      for (const fn of ['set_updated_at()', 'handle_new_user()', 'guard_spot_write()']) {
        expect(sql(`select has_function_privilege('${role}', 'public.${fn}', 'execute');`)).toBe('f');
      }
    }
    expect(sql("select has_function_privilege('anon', 'public.delete_my_account()', 'execute');")).toBe('f');
    expect(sql("select has_function_privilege('authenticated', 'public.delete_my_account()', 'execute');")).toBe('t');
  });

  it('keeps row-level security on, and the API view behind it', () => {
    for (const table of ['spots', 'profiles']) {
      expect(sql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass;`)).toBe('t');
    }
    expect(
      sql("select array_to_string(reloptions, ',') from pg_class where oid = 'public.spots_api'::regclass;"),
    ).toContain('security_invoker=true');
    expect(sql("select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'spots';")).toBe(
      'DELETE,INSERT,SELECT,UPDATE',
    );
    expect(sql("select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'profiles';")).toBe(
      'SELECT,UPDATE',
    );
  });

  it('gives every new account a profile with a safe starting name', () => {
    const accounts: [string, string, string][] = [
      [SAM, '{"given_name": "Sam", "full_name": "Sam Isham"}', 'Sam'],
      [ALEX, '{"full_name": "Alex Rivera"}', 'Alex'],
      ['33333333-3333-4333-8333-333333333333', '{"user_name": "trailhound", "name": null}', 'trailhound'],
      // Microsoft's preferred_username is often the email address: never shown.
      [
        '44444444-4444-4444-8444-444444444444',
        '{"name": "pat@example.com", "preferred_username": "pat@example.com"}',
        'Camper',
      ],
      ['55555555-5555-4555-8555-555555555555', '{}', 'Camper'],
    ];
    for (const [id, meta] of accounts) {
      sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', 'x@example.com', '${meta}');`);
    }
    for (const [id, , name] of accounts) {
      expect(sql(`select display_name from public.profiles where id = '${id}';`)).toBe(name);
    }
    // Names are private until the camper adds a spot (where names show);
    // campers always see their own. Nothing else about an account is public.
    expect(sql(`select display_name from public.profiles where id = '${SAM}';`, 'anon')).toBe('');
    expect(asCamper(SAM, `select display_name from public.profiles where id = '${SAM}'`)).toBe('Sam');
    expect(asCamper(SAM, `select count(*) from public.profiles where id = '${ALEX}'`)).toBe('0');
    expect(errorOf(() => sql('select created_at from public.profiles;', 'anon'))).toMatch(/permission denied/);
    expect(fails(() => sql('select email from auth.users;', 'anon'))).toBe(true);
  });

  it('lets a camper add a spot; the server sets who, when and its status', () => {
    const id = asCamper(SAM, `${addSpot('Sam Flat')} returning id`);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql(`select created_by, verified, report_count, sources::text from public.spots where id = '${id}';`)).toBe(
      `${SAM}|f|0|[]`,
    );
    const [row] = parseSpotRows(readSpots('anon')).spots.filter((s) => s.id === id);
    expect(row).toMatchObject({
      name: 'Sam Flat',
      createdBy: SAM,
      addedBy: 'Sam',
      latitude: 42.32,
      longitude: -113.05,
    });
    expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // The fields the server owns can't be sent at all.
    for (const extra of [`verified=true`, `report_count=5`, `created_by='${ALEX}'`, `sources='[]'`]) {
      expect(errorOf(() => asCamper(SAM, addSpot('Cheat', extra)))).toMatch(/permission denied/);
    }
    // The app may pick the id, but only a UUID: never a starter spot's kind of id.
    expect(errorOf(() => asCamper(SAM, addSpot('Cheat', `id='smoky-gardens-2'`)))).toMatch(/invalid_id/);
    // Sending the same add twice (a retry after a lost connection) can't make two spots.
    const retryId = '33333333-3333-4333-8333-000000000001';
    asCamper(SAM, addSpot('Retry Flat', `id='${retryId}'`));
    expect(errorOf(() => asCamper(SAM, addSpot('Retry Flat', `id='${retryId}'`)))).toMatch(/duplicate key/);
    expect(sql(`select count(*) from public.spots where id = '${retryId}';`)).toBe('1');
    sql(`delete from public.spots where id = '${retryId}';`);
    // Once Sam has added a spot, visitors can see the name on it.
    expect(sql(`select display_name from public.profiles where id = '${SAM}';`, 'anon')).toBe('Sam');
    // Signed out (no user id) can't add.
    expect(fails(() => sql(`${addSpot('Nobody')};`, 'authenticated'))).toBe(true);
    // The database still checks the data itself.
    expect(fails(() => asCamper(SAM, addSpot('Bad tier', 'clearance_tier=9')))).toBe(true);
  });

  it('lets campers edit and delete only their own spots', () => {
    const id = spotIdNamed('Sam Flat');
    sql(`update public.spots set verified = true where id = '${id}';`);

    // Alex can't touch Sam's spot (row-level security hides it from writes).
    asCamper(ALEX, `update public.spots set name = 'Alex was here' where id = '${id}'`);
    asCamper(ALEX, `delete from public.spots where id = '${id}'`);
    expect(sql(`select name from public.spots where id = '${id}';`)).toBe('Sam Flat');
    // Nor a starter spot.
    asCamper(SAM, "update public.spots set name = 'Hacked' where id = 'smoky-gardens'");
    expect(sql("select name from public.spots where id = 'smoky-gardens';")).toBe('Smoky Gardens');

    // Sam can edit; the edit clears "confirmed" until it's checked again.
    asCamper(SAM, `update public.spots set name = 'Sam Flats', stay_limit_days = 14 where id = '${id}'`);
    expect(sql(`select name, stay_limit_days, verified from public.spots where id = '${id}';`)).toBe('Sam Flats|14|f');
    expect(errorOf(() => asCamper(SAM, `update public.spots set verified = true where id = '${id}'`))).toMatch(
      /permission denied/,
    );

    // Once another camper has reported on it, it can't be deleted from the app.
    sql(`update public.spots set report_count = 1 where id = '${id}';`);
    asCamper(SAM, `delete from public.spots where id = '${id}'`);
    expect(sql(`select count(*) from public.spots where id = '${id}';`)).toBe('1');
    sql(`update public.spots set report_count = 0 where id = '${id}';`);
    asCamper(SAM, `delete from public.spots where id = '${id}'`);
    expect(sql(`select count(*) from public.spots where id = '${id}';`)).toBe('0');
  });

  it('stops a camper at 20 new spots a day, even when adds arrive together', () => {
    // 30 adds at once, each in its own connection.
    const one = (i: number) =>
      `psql "$DB" -X -q -c "begin; set local role authenticated; set local \\"request.jwt.claim.sub\\" = '${ALEX}'; ` +
      `${addSpot(`Alex ${i}`).replace(/"/g, '\\"')}; commit;" >/dev/null 2>&1 &`;
    const script = `${Array.from({ length: 30 }, (_, i) => one(i + 1)).join('\n')}\nwait`;
    execFileSync('bash', ['-c', script], { env: { ...process.env, DB: DB_URL ?? '' } });
    expect(sql(`select count(*) from public.spots where created_by = '${ALEX}';`)).toBe('20');
    expect(errorOf(() => asCamper(ALEX, addSpot('Alex 31')))).toMatch(/daily_limit/);
    // Others aren't affected.
    expect(fails(() => asCamper(SAM, addSpot('Sam Again')))).toBe(false);
    sql(`delete from public.spots where created_by in ('${ALEX}', '${SAM}');`);
  });

  it('lets campers rename only themselves, to a safe name', () => {
    asCamper(SAM, `update public.profiles set display_name = 'Sam I.' where id = '${SAM}'`);
    asCamper(SAM, `update public.profiles set display_name = 'Hacked' where id = '${ALEX}'`);
    expect(sql(`select display_name from public.profiles where id in ('${SAM}', '${ALEX}') order by id;`)).toBe(
      'Sam I.\nAlex',
    );
    for (const bad of ["''", "'   '", "' Sam'", "'sam@example.com'", `'${'x'.repeat(41)}'`]) {
      expect(fails(() => asCamper(SAM, `update public.profiles set display_name = ${bad} where id = '${SAM}'`))).toBe(
        true,
      );
    }
    expect(errorOf(() => asCamper(SAM, `update public.profiles set id = '${ALEX}' where id = '${SAM}'`))).toMatch(
      /permission denied/,
    );
  });

  it('deletes an account but keeps the spots it added, without a name', () => {
    const id = asCamper(SAM, `${addSpot('Keeper')} returning id`);
    expect(fails(() => sql('select public.delete_my_account();', 'anon'))).toBe(true);
    expect(errorOf(() => sql('select public.delete_my_account();', 'authenticated'))).toMatch(/not_signed_in/);

    asCamper(SAM, 'select public.delete_my_account()');
    expect(sql(`select count(*) from auth.users where id = '${SAM}';`)).toBe('0');
    expect(sql(`select count(*) from public.profiles where id = '${SAM}';`)).toBe('0');
    const [row] = parseSpotRows(readSpots()).spots.filter((s) => s.id === id);
    expect(row).toMatchObject({ name: 'Keeper' });
    expect(row?.createdBy).toBeUndefined();
    sql(`delete from public.spots where id = '${id}';`);
  });

  it('keeps camper-earned fields when the seed runs again', () => {
    sql("update public.spots set report_count = 7, verified = true where id = 'smoky-gardens';");
    runFile('supabase/seed.sql');
    expect(sql("select report_count, verified from public.spots where id = 'smoky-gardens';")).toBe('7|t');
    sql("update public.spots set report_count = 0, verified = false where id = 'smoky-gardens';");
  });

  it('rejects bad data at the database too', () => {
    const point = 'extensions.st_setsrid(extensions.st_makepoint(-101, 39), 4326)::extensions.geography';
    const insert = (column: string, value: string) =>
      `insert into public.spots (id, name, location, site_type, land_manager, ${column}) values ` +
      `('bad', 'Bad', ${point}, 'dispersed', 'BLM', ${value});`;
    const insertCore = (name: string, location: string) =>
      `insert into public.spots (id, name, location, site_type, land_manager) values ('bad', ${name}, ${location}, 'dispersed', 'BLM');`;

    expect(fails(() => sql(insert('clearance_tier', '9')))).toBe(true);
    expect(fails(() => sql(insert('hookups', "array['wifi']")))).toBe(true);
    expect(fails(() => sql(insert('hookups', "'{{electric,water}}'")))).toBe(true);
    expect(fails(() => sql(insert('amenities', "array['Restroom', null]")))).toBe(true);
    expect(fails(() => sql(insert('rules', "'{{a,b}}'")))).toBe(true);
    expect(fails(() => sql(insert('nightly_fee_usd', '-1')))).toBe(true);
    expect(fails(() => sql(insert('sources', `'{"not": "an array"}'::jsonb`)))).toBe(true);
    expect(fails(() => sql(insert('phone', "'call me'")))).toBe(true);
    expect(fails(() => sql(insert('phone', "'.......'")))).toBe(true);
    expect(fails(() => sql(insert('stay_limit_days', '0')))).toBe(true);
    expect(fails(() => sql(insertCore("e'\\t'", point)))).toBe(true);
    expect(fails(() => sql(insertCore("'Empty'", "'POINT EMPTY'::extensions.geography")))).toBe(true);
    expect(fails(() => sql(insertCore("'Nowhere'", "'POINT(NaN NaN)'::extensions.geography")))).toBe(true);

    // And it still takes a normal spot.
    expect(fails(() => sql(insert('phone', "'(785) 899-6334'")))).toBe(false);
    sql("delete from public.spots where id = 'bad';");
  });

  it('keeps updated_at current', () => {
    const before = sql("select updated_at from public.spots where id = 'smoky-gardens';");
    sql("update public.spots set report_count = report_count where id = 'smoky-gardens';");
    const after = sql("select updated_at from public.spots where id = 'smoky-gardens';");
    expect(Date.parse(after)).toBeGreaterThanOrEqual(Date.parse(before));
    expect(after).not.toBe(before);
  });
});
