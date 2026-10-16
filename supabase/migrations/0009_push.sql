-- DisCamp 1.7.0: phone notifications for cleanups.
--
--   1. public.push_tokens: the Expo push address of each phone where a camper
--      turned notifications on. Campers never read or write the table; the
--      app calls register_push_token and forget_push_token.
--   2. public.cleanup_push_targets(completion, what): who to tell, and what,
--      when a cleanup is sent for review, approved or sent back. Only the
--      cleanup-push Edge Function calls it (as the service role), from a
--      Database Webhook on cleanup_completions (setup in MODERATION.md).
--   3. public.forget_push_tokens(tokens): drops addresses Expo says no longer
--      reach a phone (the app was deleted, say).
--
-- Deleting an account deletes its push addresses with it.
--
-- Run after 0008 (scripts/setup-database.sh does it). Safe to run twice.

-- 1. Push addresses ------------------------------------------------------------

create table if not exists public.push_tokens (
  -- Expo's address for one install of DisCamp on one phone.
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  camper_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_camper_idx on public.push_tokens (camper_id, updated_at desc);

-- Row-level security with no policies: only the functions below (and the
-- service role) can reach it.
alter table public.push_tokens enable row level security;
revoke all on table public.push_tokens from public, anon, authenticated;

-- The signed-in camper's phone, at this address, should get notifications.
-- An address belongs to whoever signed in on that phone last.
create or replace function public.register_push_token(push_token text, os text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if push_token is null or push_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$' then
    raise exception 'bad_push_token' using errcode = 'P0001';
  end if;
  if os is null or os not in ('ios', 'android') then
    raise exception 'bad_platform' using errcode = 'P0001';
  end if;

  insert into public.push_tokens as p (token, camper_id, platform, updated_at)
  values (push_token, uid, os, now())
  on conflict (token) do update
    set camper_id = excluded.camper_id, platform = excluded.platform, updated_at = excluded.updated_at;

  -- Keep the 10 phones (installs) the camper used most recently.
  delete from public.push_tokens p
  where p.camper_id = uid
    and p.token not in (
      select q.token from public.push_tokens q
      where q.camper_id = uid
      order by q.updated_at desc, q.token
      limit 10
    );
end;
$$;

-- Signing out: this phone stops getting the camper's notifications.
create or replace function public.forget_push_token(push_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens p where p.token = push_token and p.camper_id = auth.uid();
$$;

-- 2. Who to tell ---------------------------------------------------------------

-- `what` is what just happened to the cleanup sent for review. Each row's
-- `role` says which message that phone gets:
--   'sent'      role 'moderator': moderators (except whoever sent it)
--   'approved'  role 'approved': the camper who cleaned it up, with the
--               Embers it earned; role 'poster': the camper who posted it,
--               if someone else, with theirs
--   'rejected'  role 'sent_back': the camper who cleaned it up, with the
--               moderator's reason
-- Nothing comes back when the cleanup has moved on since (approved before the
-- "sent" notice went out, say), so a late webhook never tells anyone
-- something that's no longer true.
create or replace function public.cleanup_push_targets(completion uuid, what text)
returns table (
  token text,
  role text,
  task_id uuid,
  kind text,
  size text,
  spot_name text,
  embers integer,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cleanup_completions%rowtype;
  t public.cleanup_tasks%rowtype;
  place text;
begin
  select * into c from public.cleanup_completions cc where cc.id = completion;
  if not found then
    return;
  end if;
  select * into t from public.cleanup_tasks ct where ct.id = c.task_id;
  if not found or t.hidden_at is not null then
    return;
  end if;
  select s.name into place from public.spots s where s.id = t.spot_id and s.hidden_at is null;

  if what = 'sent' and c.status = 'pending' then
    return query
      select p.token, 'moderator'::text, t.id, t.kind, coalesce(c.size, t.size), place, null::integer, null::text
      from public.push_tokens p
      join moderation.moderators m on m.camper_id = p.camper_id
      where p.camper_id is distinct from c.camper_id;
  elsif what = 'approved' and c.status = 'approved' then
    return query
      select p.token, 'approved'::text, t.id, t.kind, c.size, place,
        (select e.amount from public.embers e
         where e.camper_id = c.camper_id and e.reason = 'cleanup' and e.ref = t.id::text),
        null::text
      from public.push_tokens p
      where p.camper_id = c.camper_id;
    if t.created_by is not null and t.created_by is distinct from c.camper_id then
      return query
        select p.token, 'poster'::text, t.id, t.kind, c.size, place,
          (select e.amount from public.embers e
           where e.camper_id = t.created_by and e.reason = 'cleanup_reported' and e.ref = t.id::text),
          null::text
        from public.push_tokens p
        where p.camper_id = t.created_by;
    end if;
  -- Sent back by a moderator (a ban sends cleanups back too, with no reviewer:
  -- that camper hears nothing).
  elsif what = 'rejected' and c.status = 'rejected' and c.reviewed_by is not null then
    return query
      select p.token, 'sent_back'::text, t.id, t.kind, coalesce(c.size, t.size), place, null::integer, c.review_note
      from public.push_tokens p
      where p.camper_id = c.camper_id;
  end if;
end;
$$;

-- 3. Addresses that stopped working -----------------------------------------

create or replace function public.forget_push_tokens(tokens text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.push_tokens p where p.token = any (tokens) returning 1
  )
  select count(*)::integer from gone;
$$;

-- Who may call what -------------------------------------------------------------

revoke execute on function public.register_push_token(text, text) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
revoke execute on function public.forget_push_token(text) from public, anon, authenticated;
grant execute on function public.forget_push_token(text) to authenticated;
revoke execute on function public.cleanup_push_targets(uuid, text) from public, anon, authenticated;
grant execute on function public.cleanup_push_targets(uuid, text) to service_role;
revoke execute on function public.forget_push_tokens(text[]) from public, anon, authenticated;
grant execute on function public.forget_push_tokens(text[]) to service_role;
