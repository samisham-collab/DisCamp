# Moderation

DisCamp lets campers post spots, photos, check-in notes and cleanups and pick
display names, so Apple's App Review (Guideline 1.2) expects four things, and DisCamp
has all of them:

| What Apple asks for                                                                   | Where it is in DisCamp                                                                               |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Terms that rule out objectionable content and abusive users, agreed to before posting | The community rules screen, before a camper first posts; every write checks it (`accept_terms`)      |
| A filter for objectionable material                                                   | The word filter, in the app (`src/lib/wordFilter.ts`) and in the database (`moderation.word_rules`)  |
| A way to report content                                                               | "Report this spot" and "Report the name" on every spot page; "Report" on photos, check-ins, cleanups |
| A way to block abusive users                                                          | "Block" on every spot and photo added by another camper; Account lists who you've blocked            |

The fifth is on you: **act on every report within 24 hours.** This page is
how. It also covers reviewing cleanups, so campers get their Embers.

## Reviewing cleanups (in the app)

Once, in the SQL Editor, make yourself a moderator (put your display name in
the quotes; `find_camper` shows who matches):

```sql
select moderation.add_moderator(camper_id) from moderation.find_camper('Sam');
```

Then open **Account > Review cleanups**. Each cleanup waiting shows the before
photo, the after photo and the haul shot (tap one to see it full size), how
far from the cleanup's pin the after photo was taken (and how sure the phone
was), who sent it, when they joined and how many of their cleanups you've
approved before.

- **Approve** when the after photo shows the same place, now clean, and the
  haul shot fits the size. Change the size first if it was posted too big or
  too small: small earns 50 Embers, medium 100, large 150. Whoever posted the
  cleanup (if it's someone else) earns 10.
- **Send back** with a reason when it doesn't. The camper sees it on the
  cleanup and can send it once more (two tries each).
- You can approve your own cleanups. Add a second moderator with the same
  line, and remove one with `select moderation.remove_moderator('<camper_id>');`.
- To list what's waiting from the SQL Editor:
  `select * from public.cleanup_completions where status = 'pending';`
  Approving and sending back only work in the app (they check who you are).
- **Embers** are a ledger: `select * from public.embers where camper_id = '<camper_id>' order by id;`
  Never edit or delete rows by hand (the database refuses edits). Removing a
  spot, photo, check-in or cleanup with the tools below takes its Embers back,
  and so does a camper deleting their own photo.

## One-time setup

### 1. Run the migration

`bash scripts/setup-database.sh` runs every migration that hasn't run yet,
`0004_moderation.sql` through `0011_free_plan_guard.sql` included (README, "Connect
Supabase"). They're all safe to run again, as long as they run in order.

### 2. Get an email for every report

Reports go to a small server function, `supabase/functions/report-alert`,
which emails you through [Resend](https://resend.com) (free for this volume).

1. Make a Resend account and an API key. Until you add your own domain in
   Resend, it can only send to the address you signed up with, so use that
   address below.
2. In Terminal, from the DisCamp folder:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your project ref>   # Settings > General in Supabase
   SECRET=$(openssl rand -hex 24); echo "$SECRET"       # keep this for step 3
   npx supabase secrets set RESEND_API_KEY=re_... MODERATION_EMAIL=you@example.com REPORT_WEBHOOK_SECRET="$SECRET"
   npx supabase functions deploy report-alert
   ```

3. In Supabase, open **Database > Webhooks > Create a new hook**:
   - Name: `report-alert`
   - Table: `public.flags`, events: **Insert** only
   - Type: **Supabase Edge Functions**, function `report-alert`, method POST
   - HTTP headers: turn on "Add auth header with service key", and add
     `x-discamp-secret` with the secret from step 2
4. Test it: in the app, sign in with a second account and report a spot. The
   email should arrive within a minute. If not, open **Edge Functions >
   report-alert > Logs** in Supabase.

Optional: `REPORT_FROM_EMAIL` sets the sender once you've verified a domain
in Resend, for example `DisCamp <reports@yourdomain.com>`.

### 3. Notifications for cleanups

A second function, `supabase/functions/cleanup-push`, sends phone
notifications through Expo's free push service: moderators hear about each
new cleanup to review, and campers hear when theirs is approved or sent back,
or when someone cleans up one they posted. Migration `0009_push.sql` keeps
each phone's push address (campers never see them) and works out who to tell.

1. In Terminal, from the DisCamp folder (logged in and linked as in step 2):

   ```bash
   npx supabase functions deploy cleanup-push
   ```

   It uses the same `REPORT_WEBHOOK_SECRET` as report-alert, so there's no new
   secret to set. (To give it its own, set `PUSH_WEBHOOK_SECRET`.)

2. In Supabase, open **Database > Webhooks > Create a new hook**:
   - Name: `cleanup-push`
   - Table: `public.cleanup_completions`, events: **Insert** and **Update**
   - Type: **Supabase Edge Functions**, function `cleanup-push`, method POST
   - HTTP headers: turn on "Add auth header with service key", and add
     `x-discamp-secret` with the same secret as report-alert
3. Turn on notifications on your phone (**Account > Notifications**, in a
   TestFlight or store build: Expo Go can't receive them). Then, from a
   second account, send a cleanup for review: you should get "New cleanup to
   review" within a minute. If not, open **Edge Functions > cleanup-push >
   Logs**. "Nobody to tell" means no moderator has notifications on yet.

Notifications also need the app side set up once: the EAS project id, the
Apple push key and Firebase for Android (README, "Build for TestFlight and
Android").

Optional: if you turn on **Enhanced Security for Push Notifications** on
expo.dev, set the access token it gives you as the `EXPO_ACCESS_TOKEN` secret.

## The routine (at least once a day)

Each email says what was reported, why, and the exact lines to run. Or see
everything waiting in the **SQL Editor**:

```sql
select * from moderation.queue;
```

One row per reported spot, photo, check-in, cleanup or name, oldest first: how many
campers reported it, their reasons and notes, and whether it's already hidden.
The `kind` column says which. For photos, `photo_path` is the file (open it in
**Storage > spot-photos**, or from the link in the email); for check-ins,
`checkin_note` is what the camper wrote; for cleanups, `task_photo_path` is the
before photo.

Then decide:

| If…                                                          | Run                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| A spot breaks the rules                                      | `select moderation.hide_spot('<spot_id>', 'Not a real spot');` |
| A spot is fine (also brings back one that 3 reports hid)     | `select moderation.restore_spot('<spot_id>');`                 |
| A name breaks the rules                                      | `select moderation.reset_name('<camper_id>');`                 |
| A name is fine                                               | `select moderation.dismiss_name('<camper_id>');`               |
| A photo breaks the rules                                     | `select moderation.hide_photo('<photo_id>');`                  |
| A photo is fine (also brings back one that 3 reports hid)    | `select moderation.restore_photo('<photo_id>');`               |
| A check-in note breaks the rules                             | `select moderation.hide_checkin(<checkin_id>);`                |
| A check-in is fine                                           | `select moderation.restore_checkin(<checkin_id>);`             |
| A cleanup breaks the rules (fake, offensive photo)           | `select moderation.hide_task('<task_id>');`                    |
| A cleanup is fine (also brings back one that 3 reports hid)  | `select moderation.restore_task('<task_id>');`                 |
| Someone keeps breaking the rules, or posts something serious | `select moderation.ban('<camper_id>', 'Hateful content');`     |

Each one closes the reports it covers, so they leave the queue.

Good to know:

- **3 reports hide a spot on their own.** When 3 different campers report the
  same spot, it comes off the map until you look. Restore it if it's fine.
  Once you've dismissed someone's report on a spot (by restoring it), their
  later reports on it don't count toward hiding it again, so the same few
  campers can't keep taking it down.
- **3 reports hide a photo, a check-in or a cleanup too**, the same way.
- **Delete a removed photo's file.** `hide_photo` takes it off the spot, but the
  file stays in Storage, where anyone with its address could still open it. For
  anything that shouldn't exist (someone's face, a license plate, anything
  offensive), also open **Storage > spot-photos**, find the folder and file
  from `photo_path` (`<camper id>/<photo id>.jpg`) and delete it.
- **Files without a photo.** If an upload's answer is lost and the camper gives
  up, a file can be left with no photo on a spot (nobody sees it in the app).
  Once a month, list them in the SQL Editor:
  `select o.name, o.created_at from storage.objects o where o.bucket_id = 'spot-photos' and o.created_at < now() - interval '1 day' and not exists (select 1 from public.spot_photos p where p.path = o.name);`
  and delete them in **Storage > spot-photos** (deleting the rows in SQL
  leaves the files behind).
- **3 reports on a name reset it to "Camper"**, and the camper can't change it
  until you run `reset_name` or `dismiss_name`.
- **Hidden spots aren't deleted.** The camper who added it still sees it, with
  a note that it's under review, and can fix it, but can't delete it (or any
  spot with open reports). Restore it once it's right.
- **A ban** stops a camper posting, editing, renaming and reporting. Their
  spots, photos, check-ins and cleanups come off the map too, and cleanups
  they sent for review are sent back; add `keep_spots => true` to leave what
  they posted up:
  `select moderation.ban('<camper_id>', 'Rude name', keep_spots => true);`
  The ban sticks even if they delete their account and sign up again with the
  same email or the same Apple, Google, Microsoft or GitHub sign-in (the
  database keeps one-way hashes of those, never the addresses).
  Undo with `select moderation.unban('<camper_id>');` (what they posted stays
  hidden until you restore each one). If the account was deleted after the ban, lift
  it by email instead:
  `select moderation.forget_ban('their@email.com');` (add
  `provider => 'apple', provider_id => '<id>'` to clear a sign-in too).
- **Emails can go missing** (Resend down, a typo in a secret), and Supabase
  doesn't retry a failed webhook. That's why the queue is the real list: look at
  it at least once a day even if no email came.
- **Only run the SQL lines from the email's action section.** The reporter's note
  is printed separately, on one line, and could contain anything.
- **Keep the `moderation` schema private.** Never add it to "Exposed schemas"
  in Supabase's API settings; the app must never reach these tools.
- **Find a camper's id** by name: `select * from moderation.find_camper('alex');`
- **The word filter** can grow: `select moderation.block_word('some phrase');`.
  If it blocks a real place name, let it through with
  `select moderation.allow_phrase('Rapeseed');`. These work at once, for
  everyone. The app's own check (which shows the "not allowed" message as
  campers type) only learns them in its next version: add the phrase to
  `ALLOWED_PHRASES` in `src/lib/wordFilter.ts` (or ask Claude to), and it
  goes out with the next migration.

## Free plan

DisCamp runs on Supabase's free plan: 500 MB of database and 1 GB of files
(photos). Photos fill it first: about 4,000 of them. Migration 0011 keeps an
eye on both, and near a limit DisCamp pauses instead of letting Supabase
restrict the project:

- **At 75%** the "Keep Supabase awake" check on GitHub fails, so GitHub emails
  you (every day until it's sorted). The **Review** tab shows the numbers:
  how full each is, and how much they grew in the last month.
- **At 90% of photo storage**, new photos pause, and so do new cleanups (they
  need photos). Spots, check-ins, reports, blocking and edits keep working.
- **At 90% of the database**, new spots, photos and check-ins pause too.
  Reports still work.
- Nothing is deleted. The pause lifts by itself once there's room again
  (the numbers are checked at most once an hour).

### The switches

In Supabase, **Table Editor**, choose the **moderation** schema, then
**settings** (one row):

- `photos_paused` / `posting_paused`: pause new photos, or all new posts, by
  hand (a spam wave, say). Turn them back off to lift it.
- `storage_limit_mb` (1024) and `database_limit_mb` (500): the plan's limits.
  Change them if the plan changes.
- `pause_at_percent` (90) and `warn_at_percent` (75).

The numbers for each day are in **moderation.usage_daily**.

### When it's getting full

1. **Make room.** Photos you removed after reports may still have files:
   in **Storage > spot-photos**, delete the files of photos that are no longer
   on DisCamp (and their `.preview.jpg`). Deleting files never touches
   anything that's still listed.
2. **Pay for the next step**: Supabase's Pro plan (from $25 a month, with a
   spend cap on by default) has 100 GB of files, an 8 GB database and daily
   backups. Upgrade in the dashboard's billing settings, then set
   `storage_limit_mb` to 102400 and `database_limit_mb` to 8192 in
   **moderation.settings**. Tips from the tip jar could cover it.
3. **Move photos to cheaper storage** (a bigger change, ask Claude): photos
   could live on Cloudflare R2, which has 10 GB free and no download fees,
   while the database stays on Supabase's free plan.

Running Supabase on your own server is possible (it's open source) but
means keeping it patched, secured and backed up yourself; for one person
it's usually more work than it saves.

### Backups

The free plan keeps no backups. Every week or so (and before anything big),
on your Mac, in the DisCamp folder:

```sh
bash scripts/backup-database.sh
```

It saves everything into **Documents/DisCamp backups** (the newest 10) and
copies new photos. Backups hold campers' email addresses: keep them on your
Mac. `scripts/restore-database.sh` puts one back (the steps are at its top).

If a script says the database is missing PostgreSQL security fixes, back up,
then upgrade it: Supabase > **Project Settings > General > Upgrade project**
(a few minutes offline). README, "Keeping PostgreSQL patched", has the rest.

## Serious cases

- Threats of violence or someone in danger: contact local law enforcement.
- Child sexual abuse material: don't open or download it. Hide the spot or
  photo, ban the account, and report it to NCMEC's CyberTipline
  (report.cybertip.org). US law requires online services to report it. Keep
  the photo's file until NCMEC says what to do with it.
- Copyright or trademark complaints: hide the spot while you look into it, and
  answer the person from the support email.

## Campers' side

- Reports are private. The camper reported isn't told who reported them.
- Blocking is private too, and works on the map, in the list, and for photos
  and check-ins.
- Banned campers see: "Your account can't post or report anything on DisCamp. If you
  think this is a mistake, email (your support email)."
