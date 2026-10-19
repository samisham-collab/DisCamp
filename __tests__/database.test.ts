// Database contract test: runs the real migrations and seed against Postgres +
// PostGIS, then reads and writes spots the way the app does, as visitors and
// as signed-in campers, and runs the moderator tools.
// Skipped unless DISCAMP_TEST_DB_URL points at an empty test database, e.g.
//   DISCAMP_TEST_DB_URL=postgres://postgres@localhost:5432/discamp npm test
// CI runs it against a throwaway PostGIS container.

import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

import { TERMS_VERSION } from '@/config';
import { SEED_SPOTS } from '@/data/seedSpots';
import { parseSpotRows } from '@/data/spotsRepository';
import { normalizeForServer, serverWordRules } from '@/lib/wordFilter';

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
const TRAIL = '33333333-3333-4333-8333-333333333333';
const PAT = '44444444-4444-4444-8444-444444444444';
const ROBIN = '55555555-5555-4555-8555-555555555555';
const POINT = `'SRID=4326;POINT(-113.05 42.32)'`;

/** A spot insert with the columns the app sends. */
const addSpot = (name: string, extra = '') =>
  `insert into public.spots (name, location, site_type, land_manager${extra ? ', ' + extra.split('=')[0] : ''}) ` +
  `values ('${name}', ${POINT}, 'dispersed', 'BLM'${extra ? ', ' + extra.split('=').slice(1).join('=') : ''})`;

const spotIdNamed = (name: string) => sql(`select id from public.spots where name = '${name}';`);

const acceptTerms = (uid: string) => asCamper(uid, `select public.accept_terms(${TERMS_VERSION})`);

/** A report as the app sends it: a spot or a camper's name, a reason, maybe details. */
const flagSpot = (uid: string, spotId: string, reason = 'fake') =>
  asCamper(uid, `insert into public.flags (spot_id, reason) values ('${spotId}', '${reason}')`);
const flagName = (uid: string, camperId: string, reason = 'offensive') =>
  asCamper(uid, `insert into public.flags (camper_id, reason) values ('${camperId}', '${reason}')`);

/** Spot names a camper (or a visitor, with null) sees through the API view. */
const seenBy = (uid: string | null) =>
  (uid
    ? asCamper(uid, 'select coalesce(string_agg(name, $$,$$ order by name), $$$$) from public.spots_api')
    : sql('select coalesce(string_agg(name, $$,$$ order by name), $$$$) from public.spots_api;', 'anon')
  ).split(',');

/** A photo id (and file name) the way the app makes them. */
const photoId = (n: number) => `0000000${n}`.slice(-8) + '-0000-4000-8000-00000000f070';

/** What Supabase Storage does when a camper uploads: a row in storage.objects, as them. */
const upload = (uid: string, id: string) =>
  asCamper(
    uid,
    `insert into storage.objects (bucket_id, name, owner_id) values ('spot-photos', '${uid}/${id}.jpg', '${uid}')`,
  );

const addPhoto = (uid: string, id: string, spotId: string, path = `${uid}/${id}.jpg`) =>
  asCamper(
    uid,
    `insert into public.spot_photos (id, spot_id, path, width, height) values ('${id}', '${spotId}', '${path}', 1600, 1200)`,
  );

const checkIn = (uid: string, spotId: string, kind: string, note?: string) =>
  asCamper(
    uid,
    `insert into public.checkins (spot_id, kind${note ? ', note' : ''}) values ('${spotId}', '${kind}'${note ? `, '${note}'` : ''})`,
  );

/** A cleanup's (or its after photo's) id, the way the app makes them. */
const cleanupId = (n: number) => `0000000${n}`.slice(-8) + '-0000-4000-8000-00000000c1ea';

/** A file in the camper's folder, as Storage adds it (without its daily limit). */
const putFile = (uid: string, id: string) =>
  sql(`insert into storage.objects (bucket_id, name, owner_id) values ('spot-photos', '${uid}/${id}.jpg', '${uid}');`);

/** Where a camper stands, as the app sends it. */
const at = (longitude: number, latitude: number) => `'SRID=4326;POINT(${longitude} ${latitude})'`;
const HERE = at(-113.05, 42.32);

/** A cleanup as the app posts it. */
const postCleanup = (
  uid: string,
  id: string,
  where = HERE,
  { spot, size = 'small', note, path }: { spot?: string; size?: string; note?: string; path?: string } = {},
) =>
  asCamper(
    uid,
    `insert into public.cleanup_tasks (id, location, kind, size, before_path${spot ? ', spot_id' : ''}${note ? ', note' : ''}) ` +
      `values ('${id}', ${where}, 'litter', '${size}', '${path ?? `${uid}/${id}.jpg`}'${spot ? `, '${spot}'` : ''}${note ? `, '${note}'` : ''})`,
  );

/** A cleaned-up cleanup as the app sends it: after photo, haul shot, where. */
const sendCleanup = (uid: string, id: string, haul: string, task: string, where: string) =>
  asCamper(
    uid,
    'insert into public.cleanup_completions (id, task_id, after_path, haul_path, location, accuracy_m) ' +
      `values ('${id}', '${task}', '${uid}/${id}.jpg', '${uid}/${haul}.jpg', ${where}, 12)`,
  );

(DB_URL ? describe : describe.skip)('database (Postgres + PostGIS)', () => {
  it('applies every migration and the seed, each twice in a row, without errors', () => {
    expect(MIGRATIONS).toEqual([
      '0001_init.sql',
      '0002_harden.sql',
      '0003_accounts.sql',
      '0004_moderation.sql',
      '0005_fixes.sql',
      '0006_photos_checkins.sql',
      '0007_still_good_once.sql',
      '0008_cleanups_embers.sql',
      '0009_push.sql',
    ]);
    sql('drop schema if exists moderation cascade; drop schema if exists public cascade; create schema public;');
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
        'create table auth.identities (id uuid primary key default gen_random_uuid(), ' +
        'user_id uuid not null references auth.users (id) on delete cascade, provider text not null, provider_id text not null); ' +
        'create function auth.uid() returns uuid language sql stable as ' +
        "$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; " +
        'grant usage on schema auth to anon, authenticated, service_role; ' +
        'grant execute on function auth.uid() to anon, authenticated, service_role;',
    );
    // And Supabase Storage's tables, as far as the migrations use them: the
    // Storage service writes storage.objects as the signed-in camper, so row-
    // level security decides who may upload what.
    sql(
      'drop schema if exists storage cascade; create schema storage; ' +
        'create table storage.buckets (id text primary key, name text not null, public boolean default false, ' +
        'file_size_limit bigint, allowed_mime_types text[]); ' +
        'create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), ' +
        'name text not null, owner_id text, created_at timestamptz default now(), unique (bucket_id, name)); ' +
        'alter table storage.objects enable row level security; ' +
        'create function storage.foldername(name text) returns text[] language sql immutable as ' +
        "$$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$; " +
        'grant usage on schema storage to anon, authenticated, service_role; ' +
        'grant all on storage.objects, storage.buckets to anon, authenticated, service_role;',
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
    // Compared in id order: the database sorts names by its own locale (CI's
    // is en_US, which orders some names differently from JavaScript), and the
    // app sorts spots itself anyway.
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    expect([...spots].sort(byId)).toEqual([...SEED_SPOTS].sort(byId));
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
      // A provider name with a blocked word is skipped for the next one.
      ['66666666-6666-4666-8666-666666666666', '{"given_name": "Shithead", "user_name": "trailmix"}', 'trailmix'],
      ['77777777-7777-4777-8777-777777777777', '{"given_name": "Sh1thead"}', 'Camper'],
    ];
    for (const [id, meta] of accounts) {
      sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${id}@example.com', '${meta}');`);
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

  it('asks campers to agree to the current terms before they post', () => {
    // Nobody can add a spot before agreeing.
    expect(errorOf(() => asCamper(SAM, addSpot('Too Soon')))).toMatch(/terms_required/);
    expect(asCamper(SAM, `select terms_version from public.profiles where id = '${SAM}'`)).toBe('');

    // Agreeing to an older (or unknown) version doesn't count.
    expect(errorOf(() => asCamper(SAM, `select public.accept_terms(${TERMS_VERSION - 1})`))).toMatch(/terms_outdated/);
    expect(errorOf(() => sql(`select public.accept_terms(${TERMS_VERSION});`, 'authenticated'))).toMatch(
      /not_signed_in/,
    );
    expect(fails(() => sql(`select public.accept_terms(${TERMS_VERSION});`, 'anon'))).toBe(true);

    for (const uid of [SAM, ALEX, TRAIL, PAT, ROBIN]) acceptTerms(uid);
    expect(asCamper(SAM, `select terms_version from public.profiles where id = '${SAM}'`)).toBe(String(TERMS_VERSION));
    expect(sql(`select terms_accepted_at is not null from public.profiles where id = '${SAM}';`)).toBe('t');
    // Only through accept_terms: campers can't set the columns themselves, and
    // visitors can't read them.
    expect(errorOf(() => asCamper(SAM, `update public.profiles set terms_version = 99 where id = '${SAM}'`))).toMatch(
      /permission denied/,
    );
    expect(errorOf(() => sql('select terms_version from public.profiles;', 'anon'))).toMatch(/permission denied/);
    expect(errorOf(() => asCamper(SAM, 'select banned_at from public.profiles'))).toMatch(/permission denied/);
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

  it('reads text the same way as the app', () => {
    for (const text of [
      '  Sh1t-Creek!! 2WD ',
      'Forest Road 455',
      'Site A55',
      'a$$hole',
      'Shïtake',
      '',
      'B4 noon',
      'ｓｈｉｔ ŠHIT',
      '$15/night, 4x4, 5th wheel',
      'Shiiiit Creeek, Grass Valley',
      'Jizzz Cummings Boobook',
    ]) {
      const quoted = text.replace(/'/g, "''");
      // Brackets keep the spaces at each end, which the psql helper would trim.
      expect([text, sql(`select '[' || moderation.normalize_text('${quoted}') || ']';`)]).toEqual([
        text,
        `[${normalizeForServer(text)}]`,
      ]);
    }
  });

  it('keeps the database word list in step with the app', () => {
    const rules = (kind: string) =>
      JSON.parse(sql(`select json_agg(rule) from moderation.word_rules where kind = '${kind}';`) || '[]') as string[];
    const expected = serverWordRules();
    expect([...rules('block')].sort()).toEqual(expected.block);
    expect([...rules('allow')].sort()).toEqual(expected.allow);
  });

  it('filters blocked words from spots and names', () => {
    for (const extra of [
      "directions='Turn left at the shit-covered sign'",
      "surface='Fucking awful road'",
      "amenities=array['Toilet', 'Porn shop']",
      "rules=array['No campfires', 'Bitch about it']",
      "cost_notes='Free, you bastard'",
    ]) {
      expect(errorOf(() => asCamper(SAM, addSpot('Filtered', extra)))).toMatch(/blocked_words/);
    }
    expect(errorOf(() => asCamper(SAM, addSpot('Shit Creek')))).toMatch(/blocked_words/);
    // Stretched spellings too; real place names that contain a blocked word don't.
    expect(errorOf(() => asCamper(SAM, addSpot('Shiiiit Creek')))).toMatch(/blocked_words/);
    expect(fails(() => asCamper(SAM, addSpot('Cummings Creek')))).toBe(false);
    sql("delete from public.spots where name = 'Cummings Creek';");
    // Disguised spellings too, the same as the app.
    for (const name of [
      'Sh1t Creek',
      'A$$hole Flats',
      'Sh!t Pit',
      'Shït Hollow',
      'B1tch Lake',
      'ｓｈｉｔ Flat',
      'ŠHIT Pass',
    ]) {
      expect([name, errorOf(() => asCamper(SAM, addSpot(name)))]).toEqual([
        name,
        expect.stringMatching(/blocked_words/),
      ]);
    }
    // Whole words only, and place names on the allowed list are fine.
    for (const name of [
      'Shitake Flats',
      'Hooker Creek',
      'Dick Smith Flat',
      'Bear Scat Rock',
      'Grass Valley',
      'Assessment Ridge',
      'Cumulus Point',
      'Scunthorpe Hollow',
      'Forest Road 455',
      'Site A55 by the lake',
      '4WD only, FR 4510',
    ]) {
      const id = asCamper(SAM, `${addSpot(name)} returning id`);
      sql(`delete from public.spots where id = '${id}';`);
    }

    // Edits are checked too.
    const id = asCamper(SAM, `${addSpot('Clean Flat')} returning id`);
    expect(
      errorOf(() => asCamper(SAM, `update public.spots set directions = 'what the fuck' where id = '${id}'`)),
    ).toMatch(/blocked_words/);
    expect(
      errorOf(() => asCamper(SAM, `update public.spots set land_manager = 'Whore Creek Ranch' where id = '${id}'`)),
    ).toMatch(/blocked_words/);
    sql(`delete from public.spots where id = '${id}';`);

    // Display names.
    expect(
      errorOf(() => asCamper(SAM, `update public.profiles set display_name = 'Shit Head' where id = '${SAM}'`)),
    ).toMatch(/blocked_words/);
    expect(sql(`select display_name from public.profiles where id = '${SAM}';`)).toBe('Sam I.');

    // The moderator can add words, and let a wrongly blocked phrase through.
    sql("select moderation.block_word('  Litter-Bug  ');");
    expect(sql("select kind from moderation.word_rules where rule = ' liter bug ';")).toBe('block');
    expect(errorOf(() => asCamper(SAM, addSpot('Litter Bug Camp')))).toMatch(/blocked_words/);
    expect(fails(() => asCamper(SAM, addSpot('Litterbugs Camp')))).toBe(false);
    expect(errorOf(() => asCamper(SAM, addSpot('Rapeseed Fields')))).toMatch(/blocked_words/);
    sql("select moderation.allow_phrase('Rapeseed');");
    expect(fails(() => asCamper(SAM, addSpot('Rapeseed Fields')))).toBe(false);
    sql("delete from moderation.word_rules where rule in (' liter bug ', 'rapeseed');");
    sql("delete from public.spots where name in ('Litterbugs Camp', 'Rapeseed Fields');");
  });

  it('keeps reports private and moderator tools out of reach of the app', () => {
    for (const role of ['anon', 'authenticated']) {
      expect(fails(() => sql('select * from moderation.queue;', role))).toBe(true);
      expect(fails(() => sql('select * from moderation.word_rules;', role))).toBe(true);
      expect(fails(() => sql("select moderation.allow_phrase('x');", role))).toBe(true);
      expect(fails(() => sql("select moderation.hide_spot('smoky-gardens');", role))).toBe(true);
      expect(fails(() => sql(`select moderation.ban('${ALEX}');`, role))).toBe(true);
      expect(fails(() => sql(`select moderation.reset_name('${ALEX}');`, role))).toBe(true);
      expect(fails(() => sql("select moderation.block_word('x');", role))).toBe(true);
      expect(fails(() => sql("select * from moderation.find_camper('a');", role))).toBe(true);
      expect(fails(() => sql('select * from public.flags;', role))).toBe(true);
      expect(fails(() => sql('truncate public.flags;', role))).toBe(true);
      expect(fails(() => sql('truncate public.blocks;', role))).toBe(true);
      for (const fn of ['guard_profile_write()', 'guard_flag_write()']) {
        expect(sql(`select has_function_privilege('${role}', 'public.${fn}', 'execute');`)).toBe('f');
      }
    }
    expect(sql("select has_function_privilege('anon', 'public.my_blocks()', 'execute');")).toBe('f');
    // The few checks campers' writes need answer only about the camper asking.
    sql(
      `insert into public.flags (reporter_id, camper_id, reason) select r, '${ALEX}', 'spam' from unnest(array['${TRAIL}', '${PAT}', '${ROBIN}']::uuid[]) r;`,
    );
    sql(`update public.profiles set banned_at = now() where id = '${PAT}';`);
    expect(asCamper(SAM, `select moderation.name_under_review('${ALEX}')`)).toBe('f');
    expect(asCamper(SAM, `select moderation.camper_status('${PAT}')`)).toBe('ok');
    expect(asCamper(SAM, `select moderation.flags_today('${TRAIL}')`)).toBe('0');
    expect(asCamper(SAM, "select moderation.has_open_flags('smoky-gardens')")).toBe('f');
    expect(sql(`select moderation.name_under_review('${ALEX}');`)).toBe('t');
    expect(sql(`select moderation.camper_status('${PAT}');`)).toBe('banned');
    for (const fn of ['identity_hashes(null)', 'open_reporters(null, null)', "sha('x')", "forget_ban('x')"]) {
      expect(fails(() => asCamper(SAM, `select moderation.${fn}`))).toBe(true);
    }
    expect(fails(() => asCamper(SAM, 'select * from moderation.banned_identities'))).toBe(true);
    sql(`update public.profiles set banned_at = null where id = '${PAT}';`);
    sql('delete from public.flags;');
    // Those 3 reports reset Alex's name; put it back for the tests below.
    expect(sql(`select display_name from public.profiles where id = '${ALEX}';`)).toBe('Camper');
    sql(`update public.profiles set display_name = 'Alex' where id = '${ALEX}';`);
    expect(sql("select has_function_privilege('anon', 'public.accept_terms(integer)', 'execute');")).toBe('f');
    expect(
      fails(() => sql("insert into public.flags (spot_id, reason) values ('smoky-gardens', 'fake');", 'anon')),
    ).toBe(true);
    for (const table of ['flags', 'blocks']) {
      expect(sql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass;`)).toBe('t');
    }
    expect(sql("select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'flags';")).toBe('INSERT');
    expect(sql("select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = 'blocks';")).toBe(
      'DELETE,INSERT,SELECT',
    );
  });

  it('takes one report per camper per spot or name, never about yourself', () => {
    const alexSpot = asCamper(ALEX, `${addSpot('Alex Hollow')} returning id`);
    flagSpot(SAM, 'smoky-gardens', 'fake');
    expect(sql("select reporter_id, reason, status from public.flags where spot_id = 'smoky-gardens';")).toBe(
      `${SAM}|fake|open`,
    );
    // Reporting the same thing again changes nothing (the app treats it as done).
    expect(errorOf(() => flagSpot(SAM, 'smoky-gardens', 'spam'))).toMatch(/duplicate key/);
    flagName(SAM, ALEX);
    expect(errorOf(() => flagName(SAM, ALEX))).toMatch(/duplicate key/);

    // Not your own spot or name.
    expect(errorOf(() => flagSpot(ALEX, alexSpot))).toMatch(/own_content/);
    expect(errorOf(() => flagName(ALEX, ALEX))).toMatch(/own_content/);
    // The server decides who reported it, and when; campers can't read reports.
    expect(
      errorOf(() =>
        asCamper(
          SAM,
          `insert into public.flags (spot_id, reason, reporter_id) values ('${alexSpot}', 'fake', '${PAT}')`,
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      errorOf(() =>
        asCamper(SAM, `insert into public.flags (spot_id, reason, status) values ('${alexSpot}', 'fake', 'dismissed')`),
      ),
    ).toMatch(/permission denied/);
    expect(errorOf(() => asCamper(SAM, 'select count(*) from public.flags'))).toMatch(/permission denied/);
    // The database checks the rest.
    expect(fails(() => flagSpot(SAM, alexSpot, 'boring'))).toBe(true);
    expect(fails(() => asCamper(SAM, "insert into public.flags (reason) values ('fake')"))).toBe(true);
    expect(
      fails(() =>
        asCamper(
          SAM,
          `insert into public.flags (spot_id, camper_id, reason) values ('${alexSpot}', '${ALEX}', 'fake')`,
        ),
      ),
    ).toBe(true);
    expect(
      fails(() =>
        asCamper(
          SAM,
          `insert into public.flags (spot_id, reason, details) values ('${alexSpot}', 'other', '${'x'.repeat(501)}')`,
        ),
      ),
    ).toBe(true);
    asCamper(
      SAM,
      `insert into public.flags (spot_id, reason, details) values ('${alexSpot}', 'unsafe', 'Gate is locked')`,
    );
    expect(
      errorOf(() => sql(`insert into public.flags (spot_id, reason) values ('${alexSpot}', 'fake');`, 'authenticated')),
    ).toMatch(/not_signed_in/);
    // While a spot has open reports, its camper can't delete it (and its reports with it).
    asCamper(ALEX, `delete from public.spots where id = '${alexSpot}'`);
    expect(sql(`select count(*) from public.spots where id = '${alexSpot}';`)).toBe('1');

    // Up to 30 reports a day.
    sql(
      `insert into public.flags (reporter_id, spot_id, reason, status) ` +
        `select '${PAT}', 'smoky-gardens', 'spam', 'dismissed' from generate_series(1, 30);`,
    );
    expect(errorOf(() => flagSpot(PAT, alexSpot))).toMatch(/flag_limit/);
    sql(`delete from public.flags where reporter_id = '${PAT}';`);
  });

  it('hides a spot once 3 different campers report it, until the moderator reviews it', () => {
    const alexSpot = spotIdNamed('Alex Hollow');
    // Sam reported it already (previous test). One more: still up.
    flagSpot(TRAIL, alexSpot);
    expect(seenBy(null)).toContain('Alex Hollow');
    flagSpot(PAT, alexSpot, 'spam');
    // Third camper: off the map for everyone but Alex.
    expect(sql(`select hidden_reason from public.spots where id = '${alexSpot}';`)).toBe(
      'Reported by 3 campers, waiting for review',
    );
    expect(seenBy(null)).not.toContain('Alex Hollow');
    expect(seenBy(SAM)).not.toContain('Alex Hollow');
    expect(asCamper(ALEX, `select hidden from public.spots_api where id = '${alexSpot}'`)).toBe('t');
    expect(asCamper(SAM, "select hidden from public.spots_api where id = 'smoky-gardens'")).toBe('f');
    // Alex can fix it, but editing doesn't bring it back.
    asCamper(ALEX, `update public.spots set directions = 'Past the cattle guard' where id = '${alexSpot}'`);
    expect(sql(`select hidden_at is not null, directions from public.spots where id = '${alexSpot}';`)).toBe(
      't|Past the cattle guard',
    );
    expect(errorOf(() => asCamper(ALEX, `update public.spots set hidden_at = null where id = '${alexSpot}'`))).toMatch(
      /permission denied/,
    );
    // Nor delete it, which would take it out of review.
    asCamper(ALEX, `delete from public.spots where id = '${alexSpot}'`);
    expect(sql(`select count(*) from public.spots where id = '${alexSpot}';`)).toBe('1');

    // The queue shows it, with the reasons and details.
    const queue = sql(
      `select kind, spot_name, camper_name, reporters, reasons, details, spot_hidden from moderation.queue where spot_id = '${alexSpot}';`,
    );
    expect(queue).toBe('spot|Alex Hollow|Alex|3|fake, spam, unsafe|Gate is locked|t');

    // Restoring puts it back and closes its reports.
    sql(`select moderation.restore_spot('${alexSpot}');`);
    expect(seenBy(null)).toContain('Alex Hollow');
    expect(sql(`select count(*) from public.flags where spot_id = '${alexSpot}' and status = 'open';`)).toBe('0');
    expect(sql(`select count(*) from public.flags where spot_id = '${alexSpot}' and status = 'dismissed';`)).toBe('3');
    // Campers whose reports were dismissed don't count toward hiding it
    // again; a new camper's report does.
    flagSpot(SAM, alexSpot);
    flagSpot(TRAIL, alexSpot);
    flagSpot(PAT, alexSpot);
    expect(seenBy(null)).toContain('Alex Hollow');
    flagSpot(ROBIN, alexSpot);
    expect(seenBy(null)).toContain('Alex Hollow');
    expect(sql(`select moderation.open_reporters('${alexSpot}', null);`)).toBe('1');

    // Hiding after review closes the reports as acted on.
    sql(`select moderation.hide_spot('${alexSpot}', 'Not a real spot');`);
    expect(sql(`select hidden_reason from public.spots where id = '${alexSpot}';`)).toBe('Not a real spot');
    expect(
      sql(
        `select status from public.flags where spot_id = '${alexSpot}' and reporter_id = '${SAM}' order by id desc limit 1;`,
      ),
    ).toBe('actioned');
    expect(fails(() => sql("select moderation.hide_spot('no-such-spot');"))).toBe(true);
    sql(`select moderation.restore_spot('${alexSpot}');`);
  });

  it('resets a name to "Camper" once 3 campers report it', () => {
    asCamper(ALEX, `update public.profiles set display_name = 'Alex the Great' where id = '${ALEX}'`);
    // Sam reported the name earlier. Two more.
    flagName(TRAIL, ALEX);
    expect(sql(`select display_name from public.profiles where id = '${ALEX}';`)).toBe('Alex the Great');
    flagName(PAT, ALEX);
    expect(sql(`select display_name from public.profiles where id = '${ALEX}';`)).toBe('Camper');
    expect(sql(`select kind, reporters from moderation.queue where kind = 'name' and camper_id = '${ALEX}';`)).toBe(
      'name|3',
    );
    // Until reviewed, the name stays "Camper".
    expect(
      errorOf(() => asCamper(ALEX, `update public.profiles set display_name = 'Alex the Great' where id = '${ALEX}'`)),
    ).toMatch(/name_under_review/);
    // Keeping the name closes the reports; resetting does too.
    sql(`select moderation.dismiss_name('${ALEX}');`);
    expect(sql(`select count(*) from moderation.queue where kind = 'name';`)).toBe('0');
    flagName(ROBIN, ALEX);
    sql(`select moderation.reset_name('${ALEX}');`);
    expect(sql(`select status from public.flags where camper_id = '${ALEX}' and reporter_id = '${ROBIN}';`)).toBe(
      'actioned',
    );
    asCamper(ALEX, `update public.profiles set display_name = 'Alex' where id = '${ALEX}'`);
  });

  it('lets campers block another camper, so that camper’s spots disappear for them only', () => {
    expect(seenBy(SAM)).toContain('Alex Hollow');
    asCamper(SAM, `insert into public.blocks (blocked_id) values ('${ALEX}')`);
    expect(seenBy(SAM)).not.toContain('Alex Hollow');
    expect(seenBy(SAM)).toContain('Smoky Gardens');
    expect(seenBy(null)).toContain('Alex Hollow');
    expect(seenBy(TRAIL)).toContain('Alex Hollow');
    expect(seenBy(ALEX)).toContain('Alex Hollow');
    // Sam's list shows Alex by name, even though Alex's spots are hidden from Sam.
    expect(asCamper(SAM, 'select camper_id, display_name from public.my_blocks()')).toBe(`${ALEX}|Alex`);
    expect(asCamper(TRAIL, 'select count(*) from public.my_blocks()')).toBe('0');
    // A camper with no spot on the map has no public name, so none shows here either.
    asCamper(SAM, `insert into public.blocks (blocked_id) values ('${PAT}')`);
    expect(
      asCamper(SAM, `select coalesce(display_name, 'none') from public.my_blocks() where camper_id = '${PAT}'`),
    ).toBe('none');
    asCamper(SAM, `delete from public.blocks where blocked_id = '${PAT}'`);
    // Blocks are private: nobody else (and no visitor) can see them.
    expect(asCamper(TRAIL, 'select count(*) from public.blocks')).toBe('0');
    expect(sql('select count(*) from public.blocks;', 'anon')).toBe('0');
    // Blocking twice, blocking yourself, or blocking for someone else doesn't work.
    expect(errorOf(() => asCamper(SAM, `insert into public.blocks (blocked_id) values ('${ALEX}')`))).toMatch(
      /duplicate key/,
    );
    expect(errorOf(() => asCamper(SAM, `insert into public.blocks (blocked_id) values ('${SAM}')`))).toMatch(
      /blocks_not_self/,
    );
    expect(
      errorOf(() => asCamper(TRAIL, `insert into public.blocks (blocker_id, blocked_id) values ('${SAM}', '${PAT}')`)),
    ).toMatch(/permission denied/);
    // Only Sam can unblock.
    asCamper(TRAIL, `delete from public.blocks where blocked_id = '${ALEX}'`);
    expect(seenBy(SAM)).not.toContain('Alex Hollow');
    asCamper(SAM, `delete from public.blocks where blocked_id = '${ALEX}'`);
    expect(seenBy(SAM)).toContain('Alex Hollow');
  });

  it('bans a camper: no posting, renaming or reporting, and their spots come down', () => {
    const second = asCamper(ALEX, `${addSpot('Alex Ridge')} returning id`);
    expect(sql("select camper_id, spots, banned from moderation.find_camper('alex');")).toBe(`${ALEX}|2|f`);
    flagSpot(SAM, second, 'offensive');

    sql(`select moderation.ban('${ALEX}', 'Spam spots');`);
    expect(sql(`select banned_reason from public.profiles where id = '${ALEX}';`)).toBe('Spam spots');
    expect(seenBy(null)).not.toContain('Alex Hollow');
    expect(seenBy(null)).not.toContain('Alex Ridge');
    expect(sql(`select count(*) from public.flags where spot_id = '${second}' and status = 'open';`)).toBe('0');
    expect(errorOf(() => asCamper(ALEX, addSpot('Alex Again')))).toMatch(/banned/);
    expect(errorOf(() => asCamper(ALEX, `update public.spots set name = 'Back' where id = '${second}'`))).toMatch(
      /banned/,
    );
    expect(
      errorOf(() => asCamper(ALEX, `update public.profiles set display_name = 'New Me' where id = '${ALEX}'`)),
    ).toMatch(/banned/);
    expect(errorOf(() => flagSpot(ALEX, 'smoky-gardens'))).toMatch(/banned/);
    // Their hidden spots stay for review: deleting them does nothing.
    asCamper(ALEX, `delete from public.spots where id = '${second}'`);
    expect(sql(`select count(*) from public.spots where id = '${second}';`)).toBe('1');

    // Lifting the ban lets them post again; their hidden spots stay hidden
    // until restored one by one.
    sql(`select moderation.unban('${ALEX}');`);
    asCamper(ALEX, addSpot('Alex Again'));
    expect(seenBy(null)).toContain('Alex Again');
    expect(seenBy(null)).not.toContain('Alex Hollow');
    sql(`select moderation.restore_spot('${spotIdNamed('Alex Hollow')}');`);
    expect(seenBy(null)).toContain('Alex Hollow');
    expect(fails(() => sql("select moderation.ban('99999999-9999-4999-8999-999999999999');"))).toBe(true);

    // keep_spots leaves their spots up.
    sql(`select moderation.ban('${ALEX}', 'Rude name', true);`);
    expect(seenBy(null)).toContain('Alex Again');
    sql(`select moderation.unban('${ALEX}');`);
    sql(`delete from public.spots where created_by = '${ALEX}';`);
    sql('delete from public.flags;');
  });

  it('keeps a ban when the camper deletes their account and comes back', () => {
    sql(`insert into auth.identities (user_id, provider, provider_id) values ('${ALEX}', 'apple', 'apple-alex');`);
    sql(`select moderation.ban('${ALEX}', 'Hate speech');`);
    // Only hashes are kept, never the address itself.
    expect(sql("select count(*) from moderation.banned_identities where hash like '%example%';")).toBe('0');
    expect(sql('select count(*) from moderation.banned_identities;')).toBe('2');
    asCamper(ALEX, 'select public.delete_my_account()');
    expect(sql(`select count(*) from auth.users where id = '${ALEX}';`)).toBe('0');

    // Same email, new account: banned from the start.
    const sameEmail = '88888888-8888-4888-8888-888888888888';
    sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${sameEmail}', '${ALEX}@EXAMPLE.com', '{}');`);
    expect(sql(`select banned_reason from public.profiles where id = '${sameEmail}';`)).toBe('Came back after a ban');
    acceptTerms(sameEmail);
    expect(errorOf(() => asCamper(sameEmail, addSpot('Back Again')))).toMatch(/banned/);

    // New email, same Apple sign-in: still banned.
    const sameApple = '99999999-9999-4999-8999-999999999990';
    sql(
      `insert into auth.users (id, email, raw_user_meta_data) values ('${sameApple}', 'relay@privaterelay.example', '{}');`,
    );
    sql(`insert into auth.identities (user_id, provider, provider_id) values ('${sameApple}', 'apple', 'apple-alex');`);
    acceptTerms(sameApple);
    expect(errorOf(() => asCamper(sameApple, addSpot('Back Again')))).toMatch(/banned/);

    // The moderator's lists show the sign-in ban too.
    expect(sql(`select banned from moderation.find_camper('') where camper_id = '${sameApple}';`)).toBe('t');

    // Lifting the ban clears what it remembered for that account.
    sql(`select moderation.unban('${sameApple}');`);
    expect(fails(() => asCamper(sameApple, addSpot('Welcome Back')))).toBe(false);
    sql(`select moderation.unban('${sameEmail}');`);
    expect(sql('select count(*) from moderation.banned_identities;')).toBe('0');

    // A ban on an account that's since been deleted can still be lifted.
    sql(`select moderation.ban('${sameEmail}');`);
    sql(`delete from auth.users where id = '${sameEmail}';`);
    sql(`select moderation.forget_ban('${ALEX}@example.com');`);
    expect(sql('select count(*) from moderation.banned_identities;')).toBe('0');
    sql(`delete from auth.users where id = '${sameApple}';`);
  });

  it('counts reports sent at the same moment toward hiding a spot', () => {
    const id = asCamper(TRAIL, `${addSpot('Race Flat')} returning id`);
    const one = (uid: string) =>
      `psql "$DB" -X -q -c "begin; set local role authenticated; set local \\"request.jwt.claim.sub\\" = '${uid}'; ` +
      `insert into public.flags (spot_id, reason) values ('${id}', 'spam'); commit;" >/dev/null 2>&1 &`;
    execFileSync('bash', ['-c', `${[SAM, PAT, ROBIN].map(one).join('\n')}\nwait`], {
      env: { ...process.env, DB: DB_URL ?? '' },
    });
    expect(sql(`select count(*) from public.flags where spot_id = '${id}';`)).toBe('3');
    expect(sql(`select hidden_at is not null from public.spots where id = '${id}';`)).toBe('t');
    sql(`delete from public.spots where id = '${id}';`);
  });

  it('stores photos in the camper’s own folder and shows them to everyone', () => {
    for (const uid of [TRAIL, PAT, ROBIN]) acceptTerms(uid);
    const spot = asCamper(TRAIL, `${addSpot('Photo Flat')} returning id`);
    expect(
      sql(
        "select public, file_size_limit, array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'spot-photos';",
      ),
    ).toBe('t|3145728|image/jpeg');

    const first = photoId(1);
    upload(TRAIL, first);
    addPhoto(TRAIL, first, spot);
    expect(sql(`select added_by, width, hidden from public.spot_photos_api where id = '${first}';`, 'anon')).toBe(
      'trailhound|1600|f',
    );
    expect(sql(`select created_by from public.spot_photos where id = '${first}';`)).toBe(TRAIL);

    // A camper's name shows once they post a photo.
    asCamper(ROBIN, `update public.profiles set display_name = 'Robin' where id = '${ROBIN}'`);
    expect(sql(`select count(*) from public.profiles where id = '${ROBIN}';`, 'anon')).toBe('0');
    const robins = photoId(2);
    upload(ROBIN, robins);
    addPhoto(ROBIN, robins, 'smoky-gardens');
    expect(sql(`select added_by from public.spot_photos_api where id = '${robins}';`, 'anon')).toBe('Robin');

    // Only into your own folder, only your own upload, and only once you may post.
    expect(
      fails(() =>
        asCamper(
          PAT,
          `insert into storage.objects (bucket_id, name, owner_id) values ('spot-photos', '${TRAIL}/${photoId(3)}.jpg', '${PAT}')`,
        ),
      ),
    ).toBe(true);
    expect(errorOf(() => addPhoto(PAT, photoId(4), spot))).toMatch(/photo_missing/);
    expect(errorOf(() => addPhoto(PAT, photoId(5), spot, `${TRAIL}/${photoId(5)}.jpg`))).toMatch(/photo_path/);
    expect(fails(() => upload('77777777-7777-4777-8777-777777777777', photoId(6)))).toBe(true);
    expect(
      fails(() =>
        sql(
          `insert into public.spot_photos (id, spot_id, path, width, height) values ('${photoId(7)}', '${spot}', 'x/y.jpg', 1, 1);`,
          'anon',
        ),
      ),
    ).toBe(true);
    // The camper can't set who or when, or hide anything.
    expect(fails(() => asCamper(PAT, `update public.spot_photos set width = 1 where id = '${first}'`))).toBe(true);

    // Up to 3 a spot.
    for (const n of [8, 9]) {
      upload(TRAIL, photoId(n));
      addPhoto(TRAIL, photoId(n), spot);
    }
    upload(TRAIL, photoId(10));
    expect(errorOf(() => addPhoto(TRAIL, photoId(10), spot))).toMatch(/photo_limit_spot/);

    // Campers delete their own photos only.
    expect(asCamper(PAT, `delete from public.spot_photos where id = '${first}' returning id`)).toBe('');
    expect(asCamper(TRAIL, `delete from public.spot_photos where id = '${photoId(9)}' returning id`)).toBe(photoId(9));
    expect(
      asCamper(TRAIL, `delete from storage.objects where name = '${TRAIL}/${photoId(9)}.jpg' returning name`),
    ).toBe(`${TRAIL}/${photoId(9)}.jpg`);
    expect(asCamper(PAT, `delete from storage.objects where name like '${TRAIL}/%' returning name`)).toBe('');
    // A listed photo's file stays put until the photo is deleted (so a reported one can be reviewed).
    expect(asCamper(TRAIL, `delete from storage.objects where name = '${TRAIL}/${first}.jpg' returning name`)).toBe('');

    // Only files named like a photo, and up to 25 a day.
    expect(
      fails(() =>
        asCamper(
          PAT,
          `insert into storage.objects (bucket_id, name, owner_id) values ('spot-photos', '${PAT}/movie.mp4', '${PAT}')`,
        ),
      ),
    ).toBe(true);
    sql(
      `insert into storage.objects (bucket_id, name, owner_id) select 'spot-photos', '${PAT}/' || gen_random_uuid() || '.jpg', '${PAT}' from generate_series(1, 25);`,
    );
    expect(fails(() => upload(PAT, photoId(13)))).toBe(true);
    sql(`delete from storage.objects where owner_id = '${PAT}';`);
    upload(PAT, photoId(13));
  });

  it('hides a photo 3 campers report until the moderator reviews it, and blocks hide photos', () => {
    acceptTerms(SAM);
    const photo = photoId(1);
    expect(
      errorOf(() => asCamper(TRAIL, `insert into public.flags (photo_id, reason) values ('${photo}', 'spam')`)),
    ).toMatch(/own_content/);
    for (const uid of [SAM, PAT, ROBIN]) {
      asCamper(uid, `insert into public.flags (photo_id, reason) values ('${photo}', 'offensive')`);
      // Not deletable once it has a report waiting, so the report can't vanish with it.
      expect(asCamper(TRAIL, `delete from public.spot_photos where id = '${photo}' returning id`)).toBe('');
    }
    expect(sql(`select count(*) from public.spot_photos_api where id = '${photo}';`, 'anon')).toBe('0');
    expect(asCamper(TRAIL, `select hidden from public.spot_photos_api where id = '${photo}'`)).toBe('t');
    // Not deletable while it's under review.
    expect(asCamper(TRAIL, `delete from public.spot_photos where id = '${photo}' returning id`)).toBe('');
    expect(
      sql(`select kind, reporters, photo_path, photo_hidden from moderation.queue where photo_id = '${photo}';`),
    ).toBe(`photo|3|${TRAIL}/${photo}.jpg|t`);
    sql(`select moderation.restore_photo('${photo}');`);
    expect(sql(`select count(*) from public.spot_photos_api where id = '${photo}';`, 'anon')).toBe('1');
    expect(sql(`select count(*) from moderation.queue where photo_id = '${photo}';`)).toBe('0');
    sql(`select moderation.hide_photo('${photo}', 'Not a photo of the spot');`);
    expect(sql(`select hidden_reason from public.spot_photos where id = '${photo}';`)).toBe('Not a photo of the spot');
    sql(`select moderation.restore_photo('${photo}');`);

    // Blocking a camper hides their photos for you only.
    asCamper(PAT, `insert into public.blocks (blocked_id) values ('${TRAIL}')`);
    expect(asCamper(PAT, `select count(*) from public.spot_photos_api where id = '${photo}'`)).toBe('0');
    expect(asCamper(SAM, `select count(*) from public.spot_photos_api where id = '${photo}'`)).toBe('1');
    asCamper(PAT, `delete from public.blocks where blocked_id = '${TRAIL}'`);
    sql('delete from public.flags;');
  });

  it('takes "Still good" and change reports: alerts, last confirmed and confirming a spot', () => {
    const spot = asCamper(TRAIL, `${addSpot('Check Flat')} returning id`);
    const api = (uid: string | null = null) =>
      uid
        ? asCamper(
            uid,
            `select verified, report_count, last_confirmed_at is not null, alerts::text from public.spots_api where id = '${spot}'`,
          )
        : sql(
            `select verified, report_count, last_confirmed_at is not null, alerts::text from public.spots_api where id = '${spot}';`,
            'anon',
          );
    expect(api()).toBe('f|0|f|[]');

    checkIn(PAT, spot, 'gate_closed', 'Locked with a chain');
    expect(api()).toMatch(/^f\|1\|f\|\[\{"at": ".+", "kind": "gate_closed"\}\]$/);
    expect(errorOf(() => checkIn(PAT, spot, 'gate_closed'))).toMatch(/checkin_recent/);
    expect(errorOf(() => checkIn(PAT, spot, 'trash', 'Fucking mess'))).toMatch(/blocked_words/);
    expect(
      fails(() => sql(`insert into public.checkins (spot_id, kind) values ('${spot}', 'still_good');`, 'anon')),
    ).toBe(true);
    expect(fails(() => checkIn(PAT, spot, 'party'))).toBe(true);

    // A later "Still good" clears the alert and sets the date.
    checkIn(ROBIN, spot, 'still_good');
    expect(api()).toBe('f|2|t|[]');
    // The camper who added it can't confirm it (but can report changes); two others do.
    expect(errorOf(() => checkIn(TRAIL, spot, 'still_good'))).toMatch(/own_spot/);
    expect(api()).toBe('f|2|t|[]');
    checkIn(SAM, spot, 'still_good');
    expect(api()).toBe('t|3|t|[]');

    // An edit needs confirming again, by "Still good"s after it.
    asCamper(TRAIL, `update public.spots set stay_limit_days = 14 where id = '${spot}'`);
    expect(api()).toMatch(/^f\|3\|t/);
    checkIn(PAT, spot, 'still_good');
    expect(api()).toMatch(/^f\|4\|t/);

    // Check-ins are public, with names; on-site reports keep the spot from
    // being deleted by its camper.
    expect(
      sql(
        `select camper_name, kind, note from public.checkins_api where spot_id = '${spot}' and kind = 'gate_closed';`,
        'anon',
      ),
    ).toBe('Camper|gate_closed|Locked with a chain');
    expect(asCamper(TRAIL, `delete from public.spots where id = '${spot}' returning id`)).toBe('');

    // Blocked campers' check-ins disappear for the blocker; the moderator can hide one.
    asCamper(SAM, `insert into public.blocks (blocked_id) values ('${PAT}')`);
    expect(
      asCamper(SAM, `select count(*) from public.checkins_api where spot_id = '${spot}' and camper_id = '${PAT}'`),
    ).toBe('0');
    asCamper(SAM, `delete from public.blocks where blocked_id = '${PAT}'`);

    // Check-ins can be reported (not your own); 3 campers hide one until reviewed.
    const note = sql(`select id from public.checkins where spot_id = '${spot}' and kind = 'gate_closed';`);
    const report = (uid: string, reason = 'offensive') =>
      asCamper(uid, `insert into public.flags (checkin_id, reason) values (${note}, '${reason}')`);
    expect(errorOf(() => report(PAT))).toMatch(/own_content/);
    for (const uid of [SAM, ROBIN, TRAIL]) report(uid);
    expect(errorOf(() => report(SAM))).toMatch(/duplicate key|flags_one_open_per_checkin/);
    expect(sql(`select count(*) from public.checkins_api where id = ${note};`, 'anon')).toBe('0');
    expect(
      sql(
        `select kind, camper_id, reporters, checkin_kind, checkin_note, checkin_hidden from moderation.queue where checkin_id = ${note};`,
      ),
    ).toBe(`checkin|${PAT}|3|gate_closed|Locked with a chain|t`);
    sql(`select moderation.restore_checkin(${note});`);
    expect(sql(`select count(*) from public.checkins_api where id = ${note};`, 'anon')).toBe('1');
    expect(sql(`select count(*) from moderation.queue where checkin_id = ${note};`)).toBe('0');
    report(SAM, 'spam');
    sql(`select moderation.hide_checkin(${note});`);
    // Hidden from its camper too, but still theirs: they can't report it.
    expect(errorOf(() => report(PAT))).toMatch(/own_content/);
    expect(sql(`select count(*) from public.checkins_api where id = ${note};`, 'anon')).toBe('0');
    expect(sql(`select count(*) from public.flags where checkin_id = ${note} and status = 'open';`)).toBe('0');
    expect(fails(() => asCamper(PAT, `select moderation.hide_checkin(${note})`))).toBe(true);
  });

  it('takes "Still good" once a month per camper, and takes it back with a change report', () => {
    const spot = asCamper(TRAIL, `${addSpot('Twice Flat')} returning id`);
    const api = () =>
      sql(
        `select verified, report_count, last_confirmed_at is not null, jsonb_array_length(alerts) from public.spots_api where id = '${spot}';`,
        'anon',
      );
    const goodTimes = (who: string | null = null) =>
      who
        ? asCamper(who, `select count(*) from public.checkins_api where spot_id = '${spot}' and kind = 'still_good'`)
        : sql(`select count(*) from public.checkins_api where spot_id = '${spot}' and kind = 'still_good';`, 'anon');

    checkIn(ROBIN, spot, 'still_good');
    expect(errorOf(() => checkIn(ROBIN, spot, 'still_good'))).toMatch(/confirmed_recently/);
    checkIn(SAM, spot, 'still_good');
    expect(api()).toBe('t|2|t|0');
    expect(goodTimes()).toBe('2');

    // Sam reports a change: his "Still good" is taken back, so the spot has
    // one confirmation left and isn't confirmed any more.
    checkIn(SAM, spot, 'gate_closed');
    expect(api()).toBe('f|3|t|1');
    expect(goodTimes()).toBe('1');
    expect(goodTimes(SAM)).toBe('2');
    expect(
      asCamper(
        SAM,
        `select kind, withdrawn from public.checkins_api where spot_id = '${spot}' and camper_id = '${SAM}' order by id`,
      ),
    ).toBe('still_good|t\ngate_closed|f');
    // Taken back still counts toward the 30 days.
    expect(errorOf(() => checkIn(SAM, spot, 'still_good'))).toMatch(/confirmed_recently/);
    expect(fails(() => asCamper(SAM, `update public.checkins set withdrawn_at = null where spot_id = '${spot}'`))).toBe(
      true,
    );

    // A month later Sam can confirm it again.
    sql(`update public.checkins set created_at = created_at - interval '31 days' where spot_id = '${spot}';`);
    checkIn(SAM, spot, 'still_good');
    expect(api()).toBe('t|4|t|0');
    expect(
      sql(
        `select count(*) from public.checkins where spot_id = '${spot}' and camper_id = '${SAM}' and kind = 'still_good';`,
      ),
    ).toBe('2');

    // A starter spot you confirmed yourself stays confirmed.
    sql("update public.spots set verified = true where id = 'smoky-gardens';");
    checkIn(ROBIN, 'smoky-gardens', 'still_good');
    checkIn(ROBIN, 'smoky-gardens', 'trash');
    expect(sql("select verified from public.spots where id = 'smoky-gardens';")).toBe('t');
    sql("update public.spots set verified = false where id = 'smoky-gardens';");
    expect(fails(() => asCamper(SAM, `select moderation.confirmations('${spot}')`))).toBe(true);
  });

  it('takes down a banned camper’s photos and check-ins with their spots', () => {
    const photo = photoId(11);
    upload(PAT, photo);
    addPhoto(PAT, photo, 'smoky-gardens');
    checkIn(PAT, 'smoky-gardens', 'trash', 'Bags left by the fire ring');
    sql(`select moderation.ban('${PAT}', 'Spam');`);
    expect(sql(`select count(*) from public.spot_photos_api where id = '${photo}';`, 'anon')).toBe('0');
    expect(sql(`select count(*) from public.checkins_api where camper_id = '${PAT}';`, 'anon')).toBe('0');
    expect(errorOf(() => checkIn(PAT, 'smoky-gardens', 'still_good'))).toMatch(/banned/);
    expect(fails(() => upload(PAT, photoId(12)))).toBe(true);
    sql(`select moderation.unban('${PAT}');`);
    sql(`update public.spot_photos set hidden_at = null, hidden_reason = null where created_by = '${PAT}';`);
    sql(`update public.checkins set hidden_at = null where camper_id = '${PAT}';`);
    sql(`update public.spots set hidden_at = null, hidden_reason = null where created_by = '${PAT}';`);
    for (const fn of ['hide_photo(null, null)', 'restore_photo(null)', 'hide_checkin(null)', 'restore_checkin(null)']) {
      expect(fails(() => asCamper(SAM, `select moderation.${fn}`))).toBe(true);
    }
    for (const table of ['spot_photos', 'checkins']) {
      expect(sql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass;`)).toBe('t');
      expect(fails(() => sql(`truncate public.${table};`, 'authenticated'))).toBe(true);
    }
  });

  it('posts cleanups with a before photo, pinned where the camper stands', () => {
    const spot = asCamper(TRAIL, `${addSpot('Litter Flat')} returning id`);
    const first = cleanupId(1);
    // Only with the camper's own photo, already uploaded.
    expect(errorOf(() => postCleanup(TRAIL, first))).toMatch(/photo_missing/);
    putFile(TRAIL, first);
    expect(errorOf(() => postCleanup(TRAIL, first, HERE, { path: `${ROBIN}/${first}.jpg` }))).toMatch(/photo_path/);
    // Linked only to a spot within 2 km, and no blocked words.
    expect(errorOf(() => postCleanup(TRAIL, first, HERE, { spot: 'smoky-gardens' }))).toMatch(/spot_too_far/);
    expect(errorOf(() => postCleanup(TRAIL, first, HERE, { note: 'Shit everywhere' }))).toMatch(/blocked_words/);
    postCleanup(TRAIL, first, HERE, { spot, size: 'medium', note: '  Cans by the fire ring ' });
    expect(sql(`select created_by, status, note from public.cleanup_tasks where id = '${first}';`)).toBe(
      `${TRAIL}|open|Cans by the fire ring`,
    );
    // Everyone sees it, with who posted it and the spot it's near.
    expect(
      sql(
        `select posted_by, spot_name, kind, size, status, round(latitude::numeric, 2), hidden from public.cleanup_tasks_api where id = '${first}';`,
        'anon',
      ),
    ).toBe('trailhound|Litter Flat|litter|medium|open|42.32|f');
    // Trying again after a lost answer finds it there.
    expect(errorOf(() => postCleanup(TRAIL, first, HERE, { spot }))).toMatch(/duplicate key/);
    // Not another within 30 m.
    putFile(SAM, cleanupId(2));
    expect(errorOf(() => postCleanup(SAM, cleanupId(2), at(-113.0502, 42.3201)))).toMatch(/cleanup_nearby/);
    // Cleanup photos don't count toward Storage's 25 files a day.
    const filesToday = () => asCamper(SAM, `select moderation.photo_files_today('${SAM}')`);
    const before = Number(filesToday());
    postCleanup(SAM, cleanupId(2), at(-113.06, 42.33));
    expect(Number(filesToday())).toBe(before - 1);
    // And a photo already on DisCamp can't be posted again.
    putFile(SAM, cleanupId(13));
    expect(
      errorOf(() => postCleanup(SAM, cleanupId(13), at(-113.2, 42.2), { path: `${SAM}/${cleanupId(2)}.jpg` })),
    ).toMatch(/photo_path/);
    // Nobody changes a cleanup from the app, or posts one signed out.
    expect(fails(() => asCamper(TRAIL, `update public.cleanup_tasks set status = 'done' where id = '${first}'`))).toBe(
      true,
    );
    expect(
      fails(() =>
        sql(
          `insert into public.cleanup_tasks (id, location, kind, size, before_path) values ('${cleanupId(9)}', ${HERE}, 'litter', 'small', 'x');`,
          'anon',
        ),
      ),
    ).toBe(true);
    // Campers delete only their own; a cleanup's file stays while it's up.
    expect(asCamper(SAM, `delete from public.cleanup_tasks where id = '${first}' returning id`)).toBe('');
    expect(asCamper(TRAIL, `delete from storage.objects where name = '${TRAIL}/${first}.jpg' returning name`)).toBe('');
    expect(asCamper(SAM, `delete from public.cleanup_tasks where id = '${cleanupId(2)}' returning id`)).toBe(
      cleanupId(2),
    );
    expect(asCamper(SAM, `delete from storage.objects where name = '${SAM}/${cleanupId(2)}.jpg' returning name`)).toBe(
      `${SAM}/${cleanupId(2)}.jpg`,
    );
    // Up to 10 a day.
    for (let n = 3; n <= 11; n += 1) {
      putFile(TRAIL, cleanupId(n));
      postCleanup(TRAIL, cleanupId(n), at(-113.05, 42.32 + n * 0.01));
    }
    putFile(TRAIL, cleanupId(12));
    expect(errorOf(() => postCleanup(TRAIL, cleanupId(12), at(-113.05, 42.5)))).toMatch(/cleanup_limit/);
    sql(`delete from public.cleanup_tasks where created_by = '${TRAIL}' and id <> '${first}';`);

    for (const table of ['cleanup_tasks', 'cleanup_completions', 'embers']) {
      expect(sql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass;`)).toBe('t');
      expect(fails(() => sql(`truncate public.${table};`, 'authenticated'))).toBe(true);
    }
    for (const view of ['cleanup_tasks_api', 'embers_api']) {
      expect(
        sql(`select array_to_string(reloptions, ',') from pg_class where oid = 'public.${view}'::regclass;`),
      ).toContain('security_invoker=true');
    }
    const policies = (table: string) =>
      sql(`select string_agg(cmd, ',' order by cmd) from pg_policies where tablename = '${table}';`);
    expect(policies('cleanup_tasks')).toBe('DELETE,INSERT,SELECT');
    expect(policies('cleanup_completions')).toBe('INSERT,SELECT');
    expect(policies('embers')).toBe('SELECT');
  });

  it('takes a cleanup within 150 m with a haul shot, for a moderator to approve or send back', () => {
    sql('delete from public.embers;');
    const task = cleanupId(1);
    const [after1, haul1] = [cleanupId(21), cleanupId(22)];
    putFile(ROBIN, after1);
    expect(errorOf(() => sendCleanup(ROBIN, after1, haul1, task, at(-113.05, 42.3205)))).toMatch(/photo_missing/);
    putFile(ROBIN, haul1);
    expect(errorOf(() => sendCleanup(ROBIN, after1, after1, task, at(-113.05, 42.3205)))).toMatch(/photo_path/);
    expect(errorOf(() => sendCleanup(ROBIN, after1, haul1, task, at(-113.05, 42.322)))).toMatch(/cleanup_too_far/);
    sendCleanup(ROBIN, after1, haul1, task, at(-113.05, 42.3205));
    expect(sql(`select status from public.cleanup_tasks where id = '${task}';`)).toBe('review');
    // Robin sees hers waiting; nobody else does, and only moderators see where it was taken.
    expect(asCamper(ROBIN, `select status from public.cleanup_completions where task_id = '${task}'`)).toBe('pending');
    expect(sql('select count(*) from public.cleanup_completions;', 'anon')).toBe('0');
    expect(asCamper(SAM, `select count(*) from public.cleanup_completions where task_id = '${task}'`)).toBe('0');
    expect(errorOf(() => asCamper(ROBIN, 'select location from public.cleanup_completions'))).toMatch(
      /permission denied/,
    );
    // One waits for review at a time.
    const [after4, haul4] = [cleanupId(23), cleanupId(24)];
    putFile(SAM, after4);
    putFile(SAM, haul4);
    expect(errorOf(() => sendCleanup(SAM, after4, haul4, task, HERE))).toMatch(/cleanup_in_review/);

    // Only moderators review, in the app.
    expect(errorOf(() => asCamper(ROBIN, 'select * from public.cleanup_review_queue()'))).toMatch(/not_moderator/);
    expect(errorOf(() => asCamper(ROBIN, `select public.approve_cleanup('${after1}', 'large')`))).toMatch(
      /not_moderator/,
    );
    expect(errorOf(() => asCamper(ROBIN, `select public.reject_cleanup('${after1}', 'No')`))).toMatch(/not_moderator/);
    expect(asCamper(ROBIN, 'select public.am_moderator()')).toBe('f');
    expect(fails(() => asCamper(SAM, `select moderation.add_moderator('${SAM}')`))).toBe(true);
    sql(`select moderation.add_moderator('${SAM}');`);
    expect(asCamper(SAM, 'select public.am_moderator()')).toBe('t');
    expect(
      asCamper(
        SAM,
        'select camper_name, task_size, distance_m between 50 and 60, accuracy_m, tries, spot_name, posted_by_name from public.cleanup_review_queue()',
      ),
    ).toBe('Robin|medium|t|12|1|Litter Flat|trailhound');

    // Sent back with a reason: the cleanup opens again, and Robin sees why.
    expect(errorOf(() => asCamper(SAM, `select public.reject_cleanup('${after1}', '  ')`))).toMatch(/reason_needed/);
    asCamper(SAM, `select public.reject_cleanup('${after1}', 'The after photo shows another site.')`);
    expect(sql(`select status from public.cleanup_tasks where id = '${task}';`)).toBe('open');
    expect(asCamper(ROBIN, `select status, review_note from public.cleanup_completions where id = '${after1}'`)).toBe(
      'rejected|The after photo shows another site.',
    );
    expect(errorOf(() => asCamper(SAM, `select public.approve_cleanup('${after1}')`))).toMatch(/review_done/);
    // One more try, then no more.
    const [after2, haul2, after3, haul3] = [cleanupId(25), cleanupId(26), cleanupId(27), cleanupId(28)];
    for (const id of [after2, haul2, after3, haul3]) putFile(ROBIN, id);
    sendCleanup(ROBIN, after2, haul2, task, at(-113.0501, 42.3201));
    asCamper(SAM, `select public.reject_cleanup('${after2}', 'Still bags by the fire ring.')`);
    expect(errorOf(() => sendCleanup(ROBIN, after3, haul3, task, HERE))).toMatch(/cleanup_tries/);

    // Sam cleans it up. A moderator may approve their own, at the size they see.
    sendCleanup(SAM, after4, haul4, task, HERE);
    sql(`update public.profiles set created_at = now() - interval '30 days' where id = '${SAM}';`);
    expect(errorOf(() => asCamper(SAM, `select public.approve_cleanup('${after4}', 'huge')`))).toMatch(/invalid_size/);
    asCamper(SAM, `select public.approve_cleanup('${after4}', 'large')`);
    expect(sql(`select status, done_at is not null from public.cleanup_tasks where id = '${task}';`)).toBe('done|t');
    expect(
      sql(`select cleaned_by, after_path, haul_path from public.cleanup_tasks_api where id = '${task}';`, 'anon'),
    ).toBe(`Sam I.|${SAM}/${after4}.jpg|${SAM}/${haul4}.jpg`);
    expect(sql(`select count(*) from public.cleanup_completions where task_id = '${task}';`, 'anon')).toBe('1');
    // 150 Embers for a large cleanup, and 10 for trailhound, who posted it.
    expect(sql(`select camper_id, reason, amount from public.embers where ref = '${task}' order by amount desc;`)).toBe(
      `${SAM}|cleanup|150\n${TRAIL}|cleanup_reported|10`,
    );
    expect(errorOf(() => asCamper(SAM, `select public.approve_cleanup('${after4}')`))).toMatch(/review_done/);
    putFile(TRAIL, cleanupId(29));
    putFile(TRAIL, cleanupId(39));
    expect(errorOf(() => sendCleanup(TRAIL, cleanupId(29), cleanupId(39), task, HERE))).toMatch(/cleanup_done/);
    // Its files stay while it's listed.
    expect(asCamper(SAM, `delete from storage.objects where name = '${SAM}/${haul4}.jpg' returning name`)).toBe('');

    // Found it and cleaned it: the poster earns the cleanup, not the 10 for posting it.
    const own = cleanupId(30);
    putFile(TRAIL, own);
    postCleanup(TRAIL, own, at(-113.04, 42.31));
    putFile(TRAIL, cleanupId(31));
    putFile(TRAIL, cleanupId(32));
    // Not with the before photo as the after photo.
    expect(errorOf(() => sendCleanup(TRAIL, own, cleanupId(32), own, at(-113.04, 42.31)))).toMatch(/photo_used/);
    sendCleanup(TRAIL, cleanupId(31), cleanupId(32), own, at(-113.04, 42.31));
    asCamper(SAM, `select public.approve_cleanup('${cleanupId(31)}')`);
    expect(sql(`select string_agg(reason || ':' || amount, ',') from public.embers where ref = '${own}';`)).toBe(
      'cleanup:50',
    );
    // Removing a cleanup takes its Embers back.
    sql(`select moderation.hide_task('${own}', 'Not a real cleanup');`);
    expect(sql(`select sum(amount) from public.embers where camper_id = '${TRAIL}' and spot_id is null;`)).toBe('0');
    sql(`select moderation.restore_task('${own}');`);

    // A cleanup taken down can't be approved: hide_task sends back what waits,
    // and a hidden one is refused.
    const gone = cleanupId(33);
    putFile(TRAIL, gone);
    postCleanup(TRAIL, gone, at(-113.03, 42.3));
    putFile(ROBIN, cleanupId(34));
    putFile(ROBIN, cleanupId(35));
    sendCleanup(ROBIN, cleanupId(34), cleanupId(35), gone, at(-113.03, 42.3));
    sql(`select moderation.hide_task('${gone}', 'Fake');`);
    expect(sql(`select status, review_note from public.cleanup_completions where id = '${cleanupId(34)}';`)).toBe(
      'rejected|This cleanup was taken down after review.',
    );
    expect(sql(`select status from public.cleanup_tasks where id = '${gone}';`)).toBe('open');
    sql(`select moderation.restore_task('${gone}');`);
    putFile(ROBIN, cleanupId(36));
    putFile(ROBIN, cleanupId(37));
    sendCleanup(ROBIN, cleanupId(36), cleanupId(37), gone, at(-113.03, 42.3));
    sql(`update public.cleanup_tasks set hidden_at = now() where id = '${gone}';`);
    expect(errorOf(() => asCamper(SAM, `select public.approve_cleanup('${cleanupId(36)}')`))).toMatch(/cleanup_gone/);
    sql(`update public.cleanup_tasks set hidden_at = null where id = '${gone}';`);

    for (const role of ['anon', 'authenticated']) {
      for (const fn of ['guard_cleanup_task_write()', 'guard_cleanup_completion_write()']) {
        expect(sql(`select has_function_privilege('${role}', 'public.${fn}', 'execute');`)).toBe('f');
      }
    }
    for (const fn of [
      'am_moderator()',
      'cleanup_review_queue()',
      'approve_cleanup(uuid, text)',
      'reject_cleanup(uuid, text)',
      'my_embers()',
    ]) {
      expect(sql(`select has_function_privilege('anon', 'public.${fn}', 'execute');`)).toBe('f');
      expect(sql(`select has_function_privilege('authenticated', 'public.${fn}', 'execute');`)).toBe('t');
    }
    for (const fn of ['hide_task(null, null)', 'restore_task(null)', 'remove_moderator(null)', 'is_moderator(null)']) {
      expect(fails(() => asCamper(SAM, `select moderation.${fn}`))).toBe(true);
    }
  });

  it('keeps Embers in a ledger: once per thing, daily limits, taken back by moderators', () => {
    sql('delete from public.embers;');
    sql(`update public.profiles set created_at = '2026-01-01' where id = '${PAT}';`);
    const spot = asCamper(TRAIL, `${addSpot('Ember Flat')} returning id`);
    const mine = (uid: string) =>
      asCamper(
        uid,
        `select string_agg(reason || ':' || amount, ',' order by id) from public.embers_api where spot_id = '${spot}'`,
      );
    // The first "Still good" and the first change report on a spot.
    checkIn(PAT, spot, 'still_good');
    checkIn(PAT, spot, 'road_damage');
    checkIn(PAT, spot, 'gate_closed');
    expect(mine(PAT)).toBe('still_good:10,change_report:10');
    // Taken back by that change report, the "Still good" keeps its Embers;
    // saying it again a month later earns none.
    sql(`update public.checkins set created_at = created_at - interval '31 days' where spot_id = '${spot}';`);
    checkIn(PAT, spot, 'still_good');
    expect(mine(PAT)).toBe('still_good:10,change_report:10');
    // Photos: the first 3 on a spot, even if one is deleted.
    for (const n of [41, 42, 43]) {
      putFile(PAT, photoId(n));
      addPhoto(PAT, photoId(n), spot);
    }
    // Deleting a photo takes its Embers back, and a new one doesn't earn them again.
    asCamper(PAT, `delete from public.spot_photos where id = '${photoId(43)}'`);
    putFile(PAT, photoId(44));
    addPhoto(PAT, photoId(44), spot);
    expect(mine(PAT)).toBe('still_good:10,change_report:10,photo:5,photo:5,photo:5,taken_back:-5');
    expect(asCamper(PAT, 'select total, today, daily_limit from public.my_embers()')).toBe('30|35|300');

    // A spot confirmed by 2 other campers: 50 for the camper who added it, once.
    checkIn(ROBIN, spot, 'still_good');
    expect(mine(TRAIL)).toBe('spot_confirmed:50');
    sql(`update public.spots set verified = false where id = '${spot}';`);
    sql(`update public.spots set verified = true where id = '${spot}';`);
    expect(mine(TRAIL)).toBe('spot_confirmed:50');
    // Removing the spot takes them back.
    sql(`select moderation.hide_spot('${spot}');`);
    expect(mine(TRAIL)).toBe('spot_confirmed:50,taken_back:-50');
    sql(`select moderation.restore_spot('${spot}');`);

    // Up to 100 a day in an account's first two weeks (300 after); the rest is recorded as 0.
    expect(sql(`select moderation.award('${ROBIN}', 'cleanup', 'test-1', null, 150, now());`)).toBe('90');
    expect(sql(`select moderation.award('${ROBIN}', 'cleanup', 'test-2', null, 50, now());`)).toBe('0');
    expect(sql(`select moderation.award('${ROBIN}', 'cleanup', 'test-1', null, 150, now());`)).toBe('0');
    expect(
      sql(
        `select ref, amount, full_amount from public.embers where camper_id = '${ROBIN}' and ref like 'test-%' order by ref;`,
      ),
    ).toBe('test-1|90|150\ntest-2|0|50');
    // Days are Mountain time: 5 am UTC is still the evening before in Colorado.
    expect(sql(`select moderation.award('${PAT}', 'cleanup', 'test-3', null, 300, '2026-07-01 05:00+00');`)).toBe(
      '300',
    );
    expect(sql("select earned_on from public.embers where ref = 'test-3';")).toBe('2026-06-30');
    // Check-ins earn at most 50 a day (Pat has 20 from check-ins today).
    for (let n = 1; n <= 5; n += 1)
      sql(`select moderation.award('${PAT}', 'change_report', 'test-c${n}', null, 10, now());`);
    expect(sql(`select sum(amount) from public.embers where camper_id = '${PAT}' and ref like 'test-c%';`)).toBe('30');

    // Moderators take Embers back with what they remove (once); the record
    // stays, so it can't be earned again.
    sql(`select moderation.hide_photo('${photoId(41)}');`);
    sql(`select moderation.hide_photo('${photoId(41)}');`);
    const damage = sql(`select id from public.checkins where spot_id = '${spot}' and kind = 'road_damage';`);
    sql(`select moderation.hide_checkin(${damage});`);
    expect(mine(PAT)).toBe(
      'still_good:10,change_report:10,photo:5,photo:5,photo:5,taken_back:-5,taken_back:-5,taken_back:-10',
    );
    expect(asCamper(PAT, 'select total from public.my_embers()')).toBe('345');

    // Only the camper sees theirs, and nobody writes them.
    expect(asCamper(SAM, `select count(*) from public.embers_api where spot_id = '${spot}'`)).toBe('0');
    expect(fails(() => sql('select * from public.embers_api;', 'anon'))).toBe(true);
    expect(fails(() => sql('select * from public.embers;', 'anon'))).toBe(true);
    expect(
      fails(() =>
        asCamper(
          PAT,
          `insert into public.embers (camper_id, reason, ref, amount, full_amount, earned_on) values ('${PAT}', 'cleanup', 'x', 999, 999, current_date)`,
        ),
      ),
    ).toBe(true);
    expect(fails(() => asCamper(PAT, 'update public.embers set amount = 999'))).toBe(true);
    expect(fails(() => asCamper(PAT, 'delete from public.embers'))).toBe(true);
    expect(errorOf(() => sql('update public.embers set amount = amount;'))).toMatch(/embers_append_only/);
    for (const fn of [
      'award(null, null, null, null, null, null)',
      'award_per_spot(null, null, null, null, null, null, null)',
      'take_back(null, null)',
    ]) {
      expect(fails(() => asCamper(PAT, `select moderation.${fn}`))).toBe(true);
    }

    // Running 0008 again on an empty ledger gives 1.5's photos and check-ins
    // their Embers, by the same rules (hidden ones earn nothing).
    sql('delete from public.embers;');
    sql(`update public.profiles set created_at = '2026-01-01' where id = '${TRAIL}';`);
    runFile('supabase/migrations/0008_cleanups_embers.sql');
    expect(mine(PAT)).toBe('still_good:10,change_report:10,photo:5,photo:5');
    expect(mine(TRAIL)).toBe('spot_confirmed:50');
    runFile('supabase/migrations/0008_cleanups_embers.sql');
    expect(mine(PAT)).toBe('still_good:10,change_report:10,photo:5,photo:5');
  });

  it('takes reports on cleanups: never your own, 3 hide one, and a ban takes them down', () => {
    const task = cleanupId(50);
    putFile(PAT, task);
    postCleanup(PAT, task, at(-113.1, 42.4));
    const flag = (uid: string) =>
      asCamper(uid, `insert into public.flags (task_id, reason) values ('${task}', 'fake')`);
    expect(errorOf(() => flag(PAT))).toMatch(/own_content/);
    for (const uid of [SAM, ROBIN, TRAIL]) flag(uid);
    expect(errorOf(() => flag(SAM))).toMatch(/duplicate key/);
    expect(sql(`select count(*) from public.cleanup_tasks_api where id = '${task}';`, 'anon')).toBe('0');
    expect(asCamper(PAT, `select hidden from public.cleanup_tasks_api where id = '${task}'`)).toBe('t');
    expect(
      sql(`select kind, reporters, task_photo_path, task_hidden from moderation.queue where task_id = '${task}';`),
    ).toBe(`task|3|${PAT}/${task}.jpg|t`);
    // Its camper can't delete it while it's reviewed.
    expect(asCamper(PAT, `delete from public.cleanup_tasks where id = '${task}' returning id`)).toBe('');
    sql(`select moderation.restore_task('${task}');`);
    expect(sql(`select count(*) from public.cleanup_tasks_api where id = '${task}';`, 'anon')).toBe('1');

    // A ban takes the camper's cleanups down and sends back what they sent for review.
    const other = cleanupId(51);
    putFile(ROBIN, other);
    postCleanup(ROBIN, other, at(-113.2, 42.5));
    putFile(PAT, cleanupId(52));
    putFile(PAT, cleanupId(53));
    sendCleanup(PAT, cleanupId(52), cleanupId(53), other, at(-113.2, 42.5));
    sql(`select moderation.ban('${PAT}', 'Spam');`);
    expect(sql(`select status from public.cleanup_tasks where id = '${other}';`)).toBe('open');
    expect(sql(`select status, review_note from public.cleanup_completions where id = '${cleanupId(52)}';`)).toBe(
      'rejected|Camper banned',
    );
    expect(sql(`select count(*) from public.cleanup_tasks_api where id = '${task}';`, 'anon')).toBe('0');
    expect(errorOf(() => postCleanup(PAT, cleanupId(54), at(-113.3, 42.6)))).toMatch(/banned/);
    sql(`select moderation.unban('${PAT}');`);
    sql(`update public.cleanup_tasks set hidden_at = null, hidden_reason = null where created_by = '${PAT}';`);
    sql('delete from public.flags;');
  });

  it('keeps push addresses private, and says who to tell about a cleanup', () => {
    const phone = (name: string) => `ExponentPushToken[${name}]`;
    const register = (uid: string, token: string, os = 'ios') =>
      asCamper(uid, `select public.register_push_token('${token}', '${os}')`);
    const owner = (token: string) => sql(`select camper_id from public.push_tokens where token = '${token}';`);

    // Campers only reach the table through the functions.
    expect(errorOf(() => asCamper(ROBIN, 'select count(*) from public.push_tokens'))).toMatch(/permission denied/);
    expect(errorOf(() => sql(`select public.register_push_token('${phone('x')}', 'ios');`, 'anon'))).toMatch(
      /permission denied/,
    );
    expect(errorOf(() => sql(`select public.register_push_token('${phone('x')}', 'ios');`, 'authenticated'))).toMatch(
      /not_signed_in/,
    );
    expect(errorOf(() => register(ROBIN, 'not-a-token'))).toMatch(/bad_push_token/);
    expect(errorOf(() => register(ROBIN, phone('x'), 'web'))).toMatch(/bad_platform/);

    register(SAM, phone('sam'));
    register(ROBIN, phone('robin'), 'android');
    register(TRAIL, phone('trail'));
    // One phone, another camper signs in: the address moves to them.
    register(PAT, phone('trail'));
    expect(owner(phone('trail'))).toBe(PAT);
    register(TRAIL, phone('trail'));
    expect(owner(phone('trail'))).toBe(TRAIL);
    // Someone else can't switch off your phone; you can.
    asCamper(PAT, `select public.forget_push_token('${phone('trail')}')`);
    expect(owner(phone('trail'))).toBe(TRAIL);
    asCamper(TRAIL, `select public.forget_push_token('${phone('trail')}')`);
    expect(owner(phone('trail'))).toBe('');
    register(TRAIL, phone('trail'));
    // The 10 most recent phones per camper.
    for (let i = 0; i < 11; i += 1) register(ROBIN, phone(`robin-${i}`));
    expect(sql(`select count(*) from public.push_tokens where camper_id = '${ROBIN}';`)).toBe('10');
    expect(owner(phone('robin'))).toBe('');
    expect(owner(phone('robin-0'))).toBe('');
    expect(
      sql(
        `select public.forget_push_tokens(array['${phone('robin-1')}', '${phone('robin-2')}', 'gone']);`,
        'service_role',
      ),
    ).toBe('2');
    expect(errorOf(() => sql(`select public.forget_push_tokens(array['${phone('sam')}']);`, 'authenticated'))).toMatch(
      /permission denied/,
    );

    // Trail posts a cleanup, Robin cleans it up: moderators (Sam) hear.
    const task = cleanupId(60);
    const where = at(-113.4, 42.7);
    putFile(TRAIL, task);
    postCleanup(TRAIL, task, where);
    const [after, haul] = [cleanupId(61), cleanupId(62)];
    putFile(ROBIN, after);
    putFile(ROBIN, haul);
    sendCleanup(ROBIN, after, haul, task, where);
    const targets = (completion: string, what: string) =>
      sql(
        `select string_agg(role || '|' || token || '|' || kind || '|' || coalesce(embers::text, '-') || '|' || coalesce(reason, '-'), ',' order by role, token) ` +
          `from public.cleanup_push_targets('${completion}', '${what}');`,
        'service_role',
      );
    expect(errorOf(() => asCamper(SAM, `select * from public.cleanup_push_targets('${after}', 'sent')`))).toMatch(
      /permission denied/,
    );
    expect(targets(after, 'sent')).toBe(`moderator|${phone('sam')}|litter|-|-`);
    // Not approved yet, and unknown cleanups or events tell nobody.
    expect(targets(after, 'approved')).toBe('');
    expect(targets(cleanupId(99), 'sent')).toBe('');
    expect(targets(after, 'something')).toBe('');

    asCamper(SAM, `select public.approve_cleanup('${after}', 'large')`);
    const earned = (uid: string, reason: string) =>
      sql(`select amount from public.embers where camper_id = '${uid}' and reason = '${reason}' and ref = '${task}';`);
    const robinPhones = Number(sql(`select count(*) from public.push_tokens where camper_id = '${ROBIN}';`));
    const approved = targets(after, 'approved').split(',');
    expect(approved).toHaveLength(robinPhones + 1);
    expect(approved).toContain(`approved|${phone('robin-10')}|litter|${earned(ROBIN, 'cleanup')}|-`);
    expect(approved).toContain(`poster|${phone('trail')}|litter|${earned(TRAIL, 'cleanup_reported')}|-`);
    // The webhook for "sent" arriving late tells nobody now.
    expect(targets(after, 'sent')).toBe('');
    // Nor about a hidden cleanup.
    sql(`update public.cleanup_tasks set hidden_at = now() where id = '${task}';`);
    expect(targets(after, 'approved')).toBe('');
    sql(`update public.cleanup_tasks set hidden_at = null where id = '${task}';`);

    // Robin posts one, Trail cleans it up, Sam sends it back: Trail hears why.
    const second = cleanupId(63);
    const there = at(-113.5, 42.8);
    putFile(ROBIN, second);
    postCleanup(ROBIN, second, there);
    putFile(TRAIL, cleanupId(64));
    putFile(TRAIL, cleanupId(65));
    sendCleanup(TRAIL, cleanupId(64), cleanupId(65), second, there);
    asCamper(SAM, `select public.reject_cleanup('${cleanupId(64)}', 'The after photo is blurry')`);
    expect(targets(cleanupId(64), 'rejected')).toBe(`sent_back|${phone('trail')}|litter|-|The after photo is blurry`);
    expect(targets(cleanupId(64), 'approved')).toBe('');
    // A ban sends back what the camper sent for review, without telling them.
    register(PAT, phone('pat'));
    expect(sql(`select status from public.cleanup_completions where id = '${cleanupId(52)}';`)).toBe('rejected');
    expect(targets(cleanupId(52), 'rejected')).toBe('');
  });

  it('deletes an account but keeps the spots it added, without a name', () => {
    const id = asCamper(SAM, `${addSpot('Keeper')} returning id`);
    expect(fails(() => sql('select public.delete_my_account();', 'anon'))).toBe(true);
    expect(errorOf(() => sql('select public.delete_my_account();', 'authenticated'))).toMatch(/not_signed_in/);

    asCamper(SAM, `insert into public.blocks (blocked_id) values ('${TRAIL}')`);
    asCamper(PAT, `insert into public.blocks (blocked_id) values ('${SAM}')`);
    flagName(SAM, TRAIL);
    flagName(PAT, SAM);

    asCamper(SAM, 'select public.delete_my_account()');
    expect(sql(`select count(*) from auth.users where id = '${SAM}';`)).toBe('0');
    expect(sql(`select count(*) from public.push_tokens where camper_id = '${SAM}';`)).toBe('0');
    expect(sql(`select count(*) from public.profiles where id = '${SAM}';`)).toBe('0');
    // Blocks either way go; reports Sam sent stay, without Sam; reports about Sam go.
    expect(sql(`select count(*) from public.blocks where '${SAM}' in (blocker_id, blocked_id);`)).toBe('0');
    expect(sql(`select count(*) from public.flags where camper_id = '${TRAIL}' and reporter_id is null;`)).toBe('1');
    expect(sql(`select count(*) from public.flags where camper_id = '${SAM}';`)).toBe('0');
    sql('delete from public.flags;');
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

    // Hookups nobody reported stay unknown (0005), and come out that way.
    expect(fails(() => sql(insert('hookups', 'null')))).toBe(false);
    expect(sql("select coalesce(hookups::text, 'null') from public.spots_api where id = 'bad';")).toBe('null');
    const [bad] = parseSpotRows(readSpots()).spots.filter((s) => s.id === 'bad');
    expect(bad?.cost.hookups).toBeNull();
    sql("delete from public.spots where id = 'bad';");
    expect(fails(() => sql(insertCore("'Bad'", point)))).toBe(false);
    expect(sql("select coalesce(hookups::text, 'null') from public.spots where id = 'bad';")).toBe('null');
    sql("delete from public.spots where id = 'bad';");
  });

  it('turns "no hookups" on campers\' campground spots into "not reported", once', () => {
    acceptTerms(TRAIL);
    const campground = asCamper(TRAIL, `${addSpot('Hookup Hollow')} returning id`);
    const dispersed = asCamper(TRAIL, `${addSpot('Dry Flat')} returning id`);
    sql(`update public.spots set site_type = 'campground' where id = '${campground}';`);
    sql(`update public.spots set hookups = '{}' where id in ('${campground}', '${dispersed}');`);
    // As a project that ran 0004 but not yet 0005 (where hookups were never null).
    sql("update public.spots set hookups = '{}' where hookups is null;");
    sql('alter table public.spots alter column hookups set not null;');
    runFile('supabase/migrations/0005_fixes.sql');
    const hookups = (id: string) => sql(`select coalesce(hookups::text, 'null') from public.spots where id = '${id}';`);
    expect(hookups(campground)).toBe('null');
    expect(hookups(dispersed)).toBe('{}');
    expect(hookups('smoky-gardens')).toBe('{electric,water}');
    // Run again after a camper says "None": their answer stays.
    asCamper(TRAIL, `update public.spots set hookups = '{}' where id = '${campground}'`);
    runFile('supabase/migrations/0005_fixes.sql');
    expect(hookups(campground)).toBe('{}');
    sql(`delete from public.spots where id in ('${campground}', '${dispersed}');`);
  });

  it('keeps updated_at current', () => {
    const before = sql("select updated_at from public.spots where id = 'smoky-gardens';");
    sql("update public.spots set report_count = report_count where id = 'smoky-gardens';");
    const after = sql("select updated_at from public.spots where id = 'smoky-gardens';");
    expect(Date.parse(after)).toBeGreaterThanOrEqual(Date.parse(before));
    expect(after).not.toBe(before);
  });
});
