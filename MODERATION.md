# Moderation

DisCamp lets campers post spots and pick display names, so Apple's App Review
(Guideline 1.2) expects four things, and DisCamp has all of them:

| What Apple asks for                                                                   | Where it is in DisCamp                                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Terms that rule out objectionable content and abusive users, agreed to before posting | The "Before you add spots" screen; every write checks it (`accept_terms`, migration 0004)           |
| A filter for objectionable material                                                   | The word filter, in the app (`src/lib/wordFilter.ts`) and in the database (`moderation.word_rules`) |
| A way to report content                                                               | "Report this spot" and "Report the name" on every spot page                                         |
| A way to block abusive users                                                          | "Block" on every spot added by another camper; Account lists who you've blocked                     |

The fifth is on you: **act on every report within 24 hours.** This page is
how.

## One-time setup

### 1. Run the migration

In Supabase, open **SQL Editor**, paste `supabase/migrations/0004_moderation.sql`
and run it, then do the same with `0005_fixes.sql`. (Both are safe to run again,
as long as they run in that order.)

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

## The routine (at least once a day)

Each email says what was reported, why, and the exact lines to run. Or see
everything waiting in the **SQL Editor**:

```sql
select * from moderation.queue;
```

One row per reported spot or name, oldest first: how many campers reported
it, their reasons and notes, and whether the spot is already hidden.

Then decide:

| If…                                                          | Run                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| A spot breaks the rules                                      | `select moderation.hide_spot('<spot_id>', 'Not a real spot');` |
| A spot is fine (also brings back one that 3 reports hid)     | `select moderation.restore_spot('<spot_id>');`                 |
| A name breaks the rules                                      | `select moderation.reset_name('<camper_id>');`                 |
| A name is fine                                               | `select moderation.dismiss_name('<camper_id>');`               |
| Someone keeps breaking the rules, or posts something serious | `select moderation.ban('<camper_id>', 'Hateful content');`     |

Each one closes the reports it covers, so they leave the queue.

Good to know:

- **3 reports hide a spot on their own.** When 3 different campers report the
  same spot, it comes off the map until you look. Restore it if it's fine.
  Once you've dismissed someone's report on a spot (by restoring it), their
  later reports on it don't count toward hiding it again, so the same few
  campers can't keep taking it down.
- **3 reports on a name reset it to "Camper"**, and the camper can't change it
  until you run `reset_name` or `dismiss_name`.
- **Hidden spots aren't deleted.** The camper who added it still sees it, with
  a note that it's under review, and can fix it, but can't delete it (or any
  spot with open reports). Restore it once it's right.
- **A ban** stops a camper adding, editing, renaming and reporting. Their spots
  come off the map too; add `keep_spots => true` to leave them up:
  `select moderation.ban('<camper_id>', 'Rude name', keep_spots => true);`
  The ban sticks even if they delete their account and sign up again with the
  same email or the same Apple, Google, Microsoft or GitHub sign-in (the
  database keeps one-way hashes of those, never the addresses).
  Undo with `select moderation.unban('<camper_id>');` (their spots stay hidden
  until you restore each one). If the account was deleted after the ban, lift
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

## Serious cases

- Threats of violence or someone in danger: contact local law enforcement.
- Child sexual abuse material: don't open or download it. Hide the spot, ban
  the account, and report it to NCMEC's CyberTipline
  (report.cybertip.org). US law requires online services to report it.
- Copyright or trademark complaints: hide the spot while you look into it, and
  answer the person from the support email.

## Campers' side

- Reports are private. The camper reported isn't told who reported them.
- Blocking is private too, and works both on the map and in the list.
- Banned campers see: "Your account can't add, change or report spots. If you
  think this is a mistake, email (your support email)."
