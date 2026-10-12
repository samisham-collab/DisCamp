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

(DB_URL ? describe : describe.skip)('database (Postgres + PostGIS)', () => {
  it('applies every migration and the seed, each twice in a row, without errors', () => {
    expect(MIGRATIONS).toEqual([
      '0001_init.sql',
      '0002_harden.sql',
      '0003_accounts.sql',
      '0004_moderation.sql',
      '0005_fixes.sql',
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
