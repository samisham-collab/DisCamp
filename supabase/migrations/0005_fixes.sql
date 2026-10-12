-- DisCamp 1.4.1: fixes found in a whole-project review.
-- Run it once in the Supabase SQL Editor, along with updating the app to
-- 1.4.1 (the 1.4.1 app sends "not sure" hookups as null, which needs it).
-- Safe to run twice.
--
--   1. Hookups can be "not reported" (null), like every other detail. Until
--      now a spot where nobody said had to claim "no hookups", which priced
--      trailers on the (often free) standard fee. Campground spots campers
--      already added go back to "not reported" for the same reason.
--   2. The word filter reads repeated letters once ("shiiit"), the way the
--      app's filter does, and lets through a few real place names
--      ("Cummings Creek", "Rio Negro"). The app and the database run the same
--      check on the same rules; src/lib/wordFilter.ts makes the rows below and
--      a test checks they still match.

-- 1. Hookups ---------------------------------------------------------------------

-- The first time only (while the column still says "not null"): spots
-- campers added before had no way to say "not sure", so their "no hookups"
-- may only mean nobody picked any. Make those unknown again, except at
-- dispersed spots, which have none anyway. Starter spots keep theirs.
do $$
begin
  if (select attnotnull from pg_attribute
      where attrelid = 'public.spots'::regclass and attname = 'hookups') then
    alter table public.spots alter column hookups drop not null;
    update public.spots
    set hookups = null
    where hookups = '{}' and created_by is not null and site_type <> 'dispersed';
  end if;
end;
$$;
alter table public.spots alter column hookups drop default;

-- 2. Word filter ---------------------------------------------------------------------

-- Repeated letters read once, or twice for the letters English often doubles
-- (b, e, g, l, o, s: "grass", "book"). collapseRepeats in src/lib/wordFilter.ts.
create or replace function moderation.collapse_repeats(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(input, '([beglos])\1+', '\1\1', 'g'),
    '([acdfhijkmnpqrtuvwxyz])\1+', '\1', 'g')
$$;

-- As in 0004, then repeated letters collapsed.
create or replace function moderation.normalize_text(input text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  word text;
  result text := '';
begin
  foreach word in array regexp_split_to_array(lower(normalize(coalesce(input, ''), NFKC)), '[[:space:]]+') loop
    word := translate(word, 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿšžčćřłğşď', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyyszccrlgsd');
    if word ~ '[a-z].*[a-z]' then
      word := translate(word, '013457@$!|', 'oieastasii');
    end if;
    result := result || ' ' || word;
  end loop;
  return ' ' || moderation.collapse_repeats(btrim(regexp_replace(result, '[^a-z]+', ' ', 'g'))) || ' ';
end;
$$;

-- Rules from 0004 that read repeated letters, now replaced.
delete from moderation.word_rules where rule in (
  'buttplug',
  'jerkoff',
  'jizz',
  'rapper',
  'twattle'
);

insert into moderation.word_rules (rule, kind) values
  ('analee', 'allow'),
  ('analena', 'allow'),
  ('analiese', 'allow'),
  ('analisa', 'allow'),
  ('analise', 'allow'),
  ('aroyo negro', 'allow'),
  ('assonet', 'allow'),
  ('butplug', 'block'),
  ('cero negro', 'allow'),
  ('chinkapin', 'allow'),
  ('chinquapin', 'allow'),
  ('cuming', 'allow'),
  ('cumings', 'allow'),
  ('cumins', 'allow'),
  ('fagan', 'allow'),
  ('georgy', 'allow'),
  ('jerkof', 'block'),
  ('jiz', 'block'),
  ('ojo negro', 'allow'),
  ('rapel', 'allow'),
  ('raper', 'allow'),
  ('rio negro', 'allow'),
  ('twatle', 'allow')
on conflict (rule) do update set kind = excluded.kind;

-- Words added with block_word or allow_phrase before now: collapse them too,
-- or they could never match.
with plain as (
  delete from moderation.word_rules
  where rule ~ '^[ a-z]+$' and rule <> moderation.collapse_repeats(rule)
  returning rule, kind
)
insert into moderation.word_rules (rule, kind)
select moderation.collapse_repeats(rule), kind from plain
on conflict (rule) do nothing;

-- Add a word or phrase to the filter, read the way the filter reads text
-- (whole words: "litter bug" blocks "Litter-Bug" but not "litterbugs").
create or replace function moderation.block_word(word text)
returns void
language sql
set search_path = ''
as $$
  insert into moderation.word_rules (rule, kind)
  values (moderation.normalize_text(word), 'block')
  on conflict (rule) do nothing;
$$;

-- Let a phrase through that the filter wrongly blocks (say, a real place name).
create or replace function moderation.allow_phrase(phrase text)
returns void
language sql
set search_path = ''
as $$
  insert into moderation.word_rules (rule, kind)
  values (btrim(moderation.normalize_text(phrase)), 'allow')
  on conflict (rule) do update set kind = 'allow';
$$;

revoke execute on function moderation.collapse_repeats(text) from public, anon, authenticated;
revoke execute on function moderation.block_word(text) from public, anon, authenticated;
revoke execute on function moderation.allow_phrase(text) from public, anon, authenticated;
-- normalize_text runs as the camper (see 0004, section 8), and calls this.
grant execute on function moderation.collapse_repeats(text) to authenticated;
