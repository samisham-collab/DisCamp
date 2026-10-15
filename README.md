# DisCamp

A free, community-built map of campsites that tells you whether your rig can reach a spot, whether it fits, and what it costs to stay.

**Version 1.4** gets DisCamp ready for the App Store: reporting, blocking, a word filter and terms of use for camper-added content (Apple's Guideline 1.2), a privacy policy, terms and support page to publish, crash reports, over-the-air updates and a privacy manifest. Version 1.3 added accounts and camper-added spots. See [CHANGELOG.md](CHANGELOG.md) for every version.

It ships with six starter spots from public listings:

| Spot                                | Where                                               | Type       |
| ----------------------------------- | --------------------------------------------------- | ---------- |
| Smoky Gardens                       | Soldiers Memorial Park, Sherman County, Kansas      | Campground |
| Sublett Dam                         | Sublett Reservoir, Idaho (Fish and Game)            | Dispersed  |
| Sublett Campground                  | Sublett Reservoir, Idaho (Sawtooth National Forest) | Campground |
| South Fork Sublett Creek            | Forest Road 583, Sublett Reservoir, Idaho           | Dispersed  |
| Forest Road 46 near Packwood        | Gifford Pinchot National Forest, Washington         | Dispersed  |
| Forest Road 356 near Mount Rushmore | Black Hills National Forest, South Dakota           | Dispersed  |

## What the app does

- **Map** with a pin for each spot, colored by fit: green check = fits, amber ! = tight, red × = won't fit, gray ? = not enough reports. Tap a pin for a summary card; the map moves the pin into view above it.
- **List view**, sorted best fit first, then nearest. Distances show the direction too ("11 mi S").
- **My Rig**: pick a preset or set clearance, drivetrain, how you camp, and trailer or rig length. Saved on the phone.
- **Spot page**: fit for your rig with the reasons, a C1–C7 clearance gauge, who fits, amenities, rules and directions, plus **Directions**, **Share**, **Copy GPS** and **Call** buttons.
- **Cost meter**: Free / $ / $$ / $$$ per night. Trailers and big rigs are priced on the RV site fee and see the meter first. At Smoky Gardens that's $20 a night for an RV site, and free for dry camping.
- **Filters**: "Fits my rig" and "Free for my rig". Filters, map or list, and satellite view are remembered.
- **Works offline**: the last spots loaded are saved on the phone. If the server can't be reached, a banner says so and offers Retry.
- **Location only when asked**: DisCamp never asks for location on launch. Tap "Show my location" or "Sort by distance" when you want distances.
- **Screen readers**: every control has a label and role, and filter counts and connection problems are read out.
- **Sign in** with Apple, Google, Microsoft or GitHub (Account tab, or "Add spot"). Only needed to post (spots, photos, check-ins, cleanups).
- **Add a spot**: drop a pin on a satellite map (or use your location, or paste GPS), then rate access, who fits and cost. Only the name, land manager and location are required; anything else can stay "Not sure". The draft is saved as you type. New spots show for everyone right away, marked "not yet confirmed".
- **Your spots**: edit or delete the spots you added (deleting stops once other campers have reported on a spot). The Account tab lists them, and lets you change your display name, sign out or delete your account.
- **Community rules**: before they first post, campers agree to the terms of use. A word filter keeps offensive words out of spots, notes and names.
- **Photos**: campers add up to 3 photos per spot, from the camera or their library. Each photo is shrunk to 1,600 pixels and saved fresh before it's sent, which strips its location and camera details. Tap a photo to see it full size, delete your own, or report or block someone else's.
- **Still good?**: one tap tells other campers a spot is still as described, and the spot shows when it was last confirmed. Each camper can do it once per spot every 30 days; afterwards the button shows it's done. Reporting a change afterwards takes their "Still good" back. Two campers (other than the one who added it) saying "Still good" mark a spot confirmed. **Something changed** reports a washout, a locked gate, trash or a closure; it shows as a warning on the spot until someone says it's still good.
- **Cleanups**: found trash at a site? The **Cleanups** tab (or a spot's page) posts it with a before photo from the camera, pinned where you stand and linked to a spot within 2 km. Open cleanups show as orange pins on the map and in the Cleanups tab, nearest first. Whoever packs it out (the camper who posted it too) taps **I cleaned it up** and sends an after photo, taken within 150 m of the pin, and a haul shot of what they carried out. It waits for a moderator; a camper can send a cleanup twice.
- **Review** (moderators only, from Account): the before, after and haul photos side by side, how far from the pin the after photo was taken, and who sent it. **Approve** at the size you see, or **Send back** with a reason the camper reads.
- **Embers**: points for helping, shown on Account with your rank (Tenderfoot, Scout at 250, Trailblazer at 1,000, Pathfinder at 3,000, Steward at 7,500, Guardian at 15,000), how far to the next, today's count and what earned them. An approved cleanup earns 50, 100 or 150 by size, and 10 for whoever posted it; a spot you added that 2 campers confirm earns 50; your first "Still good" and first change report on a spot earn 10 each; photos earn 5 (3 a spot; deleting a photo takes its 5 back). Up to 300 a day, 100 a day in an account's first two weeks, and at most 50 a day from check-ins. Embers have no cash value and can't be bought; only the database adds them.
- **Report and block**: every spot page has **Report this spot**, and for spots campers added, **Report the name** and **Block**. Blocked campers' spots and photos disappear for you; Account lists them. Photos can be reported too. Each report emails you, and 3 reports hide a spot or photo until you review it. [MODERATION.md](MODERATION.md) is the routine.
- **Help and contact**: the Account tab shows the support email and links to the privacy policy, terms and support page.
- Works with **no backend**: then it shows the starter spots, and sign-in and adding spots are turned off. Supabase is optional (see below).

## Run it on your phone (free)

You need Node.js 22 on your Mac and the free **Expo Go** app on your phone.

1. Install Node.js 22 LTS from [nodejs.org](https://nodejs.org) if `node -v` doesn't print `v22` or newer.
2. In Terminal:

   ```sh
   cd ~/Documents/DisCamp
   npm ci
   npx expo start
   ```

   `npm ci` installs exactly the versions in `package-lock.json`, the same ones the tests ran against.

3. **iPhone:** make a free account at [expo.dev/signup](https://expo.dev/signup), run `npx expo login`, and sign in to Expo Go with the same account. Then scan the QR code with the Camera app.
   **Android:** open Expo Go and scan the QR code.
4. Your phone and Mac need to be on the same Wi-Fi. If the network blocks it, run `npx expo start --tunnel` instead.

Save a file and the app reloads on your phone. Press `w` in the terminal for a quick browser preview (the map shows as a list there).

## Check your work

```sh
npm run check      # everything CI runs: types, lint, formatting, tests with coverage
npm test           # just the tests
npm run test:watch # re-run tests as you edit
```

`npm run check` must pass before a change is done. It fails if:

- TypeScript finds an error, or ESLint finds a problem (including promises nobody waits for)
- a file isn't formatted (run `npm run format` to fix)
- a test fails, a test prints an unexpected warning or error, or coverage drops below the thresholds in `package.json`

GitHub runs the same checks on every push to `main` and on every pull request (`.github/workflows/ci.yml`), plus a database test against a real Postgres + PostGIS.

## Update the starter spots

Edit `src/data/seedSpots.ts`. Every spot came from the public listings linked on its page (and in the file) and needs a visit to confirm. Comments in the file mark each ASSUMPTION; `null` means no source reported it. The biggest gaps:

| Spot                                | Confirm on site                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smoky Gardens                       | Exact pin (approximate now); clearance C2 and "2WD OK" are assumptions; big-rig fit, longest trailer, turnaround, stay limit, wet roads             |
| Sublett Dam                         | Turnaround; whether the road is OK when wet                                                                                                         |
| Sublett Campground                  | Clearance C3 (from "washboard"); number of sites (sources say 5 and 9)                                                                              |
| South Fork Sublett Creek            | Everything about the road: no camper has reported on FR 583                                                                                         |
| Forest Road 46 near Packwood        | **Exact pin**: the current one is worked out from road mileages and could be off by a few hundred yards. Also longest trailer, big rigs, turnaround |
| Forest Road 356 near Mount Rushmore | Turnaround; whether the road is OK when wet (campers report big puddles after storms)                                                               |

After editing, run `npm run seed:sql` to regenerate `supabase/seed.sql` (a test fails if you forget). `__tests__/seedSpots.test.ts` also checks what each preset rig sees at each spot, so a changed rating shows up there; update the expected table if the change was meant.

When a spot is confirmed on site, set `verified: true` and its "Starter info" banner disappears. If you've connected Supabase, run this in the SQL Editor too, because re-running the seed never overwrites camper-earned fields:

```sql
update public.spots set verified = true where id = 'smoky-gardens';
```

## Connect Supabase (optional, free)

1. Create a project on the free plan at [supabase.com](https://supabase.com). Under **Security**, leave **Enable Data API** and **Automatically expose new tables** on, and **Enable automatic RLS** off: the files below set every table's access themselves.
2. Load the database. The easy way is one command in Terminal, from the DisCamp folder:

   ```sh
   bash scripts/setup-database.sh
   ```

   It installs `psql` if needed (with Homebrew), asks for the **Session pooler** connection string (Supabase > **Connect**) and the database password, then runs each file below that hasn't run yet, in order, and the seed. Each file runs all-or-nothing, and the database keeps a list of the ones that ran, so run it again after any update that adds a migration. It finishes by listing the tables, the number of starter spots, and whether photo storage is ready.

   Or by hand: open **SQL Editor** and run these files in order, each pasted in and run on its own. Check the first and last lines after pasting; long files don't always paste whole, and don't use **Debug with Assistant** on them (it rewrites the SQL).
   1. `supabase/migrations/0001_init.sql` creates the `spots` table.
   2. `supabase/migrations/0002_harden.sql` makes it read-only for the app and adds data checks.
   3. `supabase/migrations/0003_accounts.sql` adds accounts: profiles, who added each spot, and exactly what signed-in campers may change.
   4. `supabase/migrations/0004_moderation.sql` adds moderation: terms of use, the word filter, reports, blocking, hidden spots, bans and your moderator tools.
   5. `supabase/migrations/0005_fixes.sql` lets hookups be "not reported" and sharpens the word filter (1.4.1).
   6. `supabase/migrations/0006_photos_checkins.sql` adds photos (and their Storage bucket), "Still good" check-ins and change reports (1.5.0). See "Photos" below.
   7. `supabase/migrations/0007_still_good_once.sql` makes "Still good" once per spot every 30 days, and lets a change report take it back (1.5.1).
   8. `supabase/migrations/0008_cleanups_embers.sql` adds cleanups, the moderators' review, and Embers (1.6.0). It also gives earlier photos and check-ins their Embers.
   9. `supabase/seed.sql` adds the starter spots.

   Already ran some for an earlier version? Run only the ones after it (for 1.3: 0004 to 0008; for 1.4.0: 0005 to 0008; for 1.4.1: 0006 to 0008; for 1.5.0: 0007 and 0008; for 1.5.1: just 0008), then the seed. Never rerun an older file after a newer one: newer files change things the older ones made. To switch a database set up by hand over to the script, tell it the last file that ran, for example `bash scripts/setup-database.sh --after 0005`.

3. Copy your **Project URL** and **publishable key** from the project's API settings.
4. For your phone: `cp .env.example .env`, put both values in `.env`, and restart `npx expo start`.
5. For builds made on EAS: `.env` isn't uploaded, so add both values on expo.dev (your project > **Environment variables**) for the **preview** and **production** environments. Without them, a build quietly uses the starter spots only.

The app then reads spots from the database. If it can't reach it, it shows the last saved copy (or the starter spots) and a banner with Retry. Never put the secret (service role) key in the app or in `.env`.

To let campers sign in and add spots, set up sign-in next.

### Photos

Migration 0006 also makes the **spot-photos** Storage bucket and its rules. Check it worked: in **Storage**, a public bucket called `spot-photos` is listed, and its policies show three for spot photos (upload, see and delete).

If 0006 printed a warning that Storage was not set up (some projects don't let the SQL Editor change Storage's tables), set it up in the dashboard instead:

1. **Storage > New bucket**: name `spot-photos`, turn on **Public bucket**, set the file size limit to 3 MB and the allowed MIME types to `image/jpeg`.
2. On the bucket's **Policies**, add three policies "For full customization", each for the `authenticated` role:
   - **INSERT**, named "Campers upload spot photos to their folder", with this check:
     `bucket_id = 'spot-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and moderation.camper_status((select auth.uid())) = 'ok' and moderation.photo_files_today((select auth.uid())) < 25`
   - **SELECT**, named "Campers see their own spot photo files", using:
     `bucket_id = 'spot-photos' and owner_id = (select auth.uid()::text)`
   - **DELETE**, named "Campers delete their own spot photos", using:
     `bucket_id = 'spot-photos' and owner_id = (select auth.uid()::text) and not moderation.photo_listed(name)`

Cleanup photos (before, after and haul shots) use the same bucket and rules: 0008 adds nothing to Storage. They don't count toward the 25 files a day (cleanups have their own limits: 10 posted and 10 sent a day), and a photo already on DisCamp can't be used again.

Photos are public files: anyone with a photo's address can open it, which is what lets them show on spot pages. File names are random, so they can't be guessed. Campers can only upload files named like a photo into their own folder, up to 25 a day, and can't delete a file while a photo on a spot uses it (so a reported photo's file stays for you to review). When you remove a photo after a report, delete its file too (MODERATION.md says how). The free plan's 1 GB of Storage holds about 3,000 photos.

## Sign-in

Supabase Auth handles sign-in. The app opens each provider in a secure browser sheet (Apple uses the built-in sheet on iPhone) and keeps the session in the phone's keychain. Set up the providers you want; each takes about 10 minutes.

**1. Tell Supabase where to send campers back.** In Supabase: **Authentication > URL Configuration > Redirect URLs**, add:

- `discamp://auth/callback` (the app)
- `exp://**` (Expo Go, for testing)

Without these, sign-in opens and then quietly comes back as "cancelled".

**2. Switch on each provider** in **Authentication > Sign In / Providers**. Every provider asks for a callback URL: use `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase shows it on the provider's page).

- **GitHub** (easiest, free): GitHub > Settings > Developer settings > OAuth Apps > **New OAuth App**. Callback URL: the Supabase one. Copy the Client ID, generate a client secret, and paste both into Supabase's GitHub provider.
- **Google** (free): in [Google Cloud Console](https://console.cloud.google.com), set up the **OAuth consent screen** (External), then **Credentials > Create credentials > OAuth client ID > Web application**. Authorized redirect URI: the Supabase one. Paste the client ID and secret into Supabase's Google provider.
- **Microsoft** (free; Supabase calls it **Azure**): in the [Azure portal](https://portal.azure.com), **Microsoft Entra ID > App registrations > New registration**. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**. Redirect URI (Web): the Supabase one. Under **Certificates & secrets**, make a client secret and copy its **Value**. In Supabase's Azure provider, paste the Application (client) ID and the secret, and leave the tenant URL empty. Recommended: under **Token configuration**, add the optional claim `xms_edov`, so Supabase can tell whether the email address is verified.
- **Apple** (needs the $99/year Apple Developer Program): in Supabase's Apple provider, put your app's bundle ID under **Client IDs** (replace the placeholder `org.discamp.app` in `app.json` with your own first), plus `host.exp.Exponent` to test in Expo Go. That's all iPhone needs. Sign in with Apple on Android goes through the browser and also needs a Services ID and a signing key; Supabase's Apple page walks through it. That secret expires every 6 months, so set a reminder.

**3. Show only the buttons you've set up.** Until a provider is on, hide its button: in `.env` (and on expo.dev for builds), set for example `EXPO_PUBLIC_AUTH_PROVIDERS=google,microsoft,github`. Leave it empty for all four.

**Before the App Store:**

- Apple requires Sign in with Apple in any app that offers Google, Microsoft or GitHub sign-in (App Review guideline 4.8), so switch Apple on before submitting.
- Account deletion is in the app (Account > Delete account), as Apple requires. For accounts that used Sign in with Apple, the app then explains how to remove DisCamp from the Apple Account (Apple's minimum, TN3194). Revoking the tokens automatically needs a server function holding the Apple key; it's on the list after launch.

**What the database allows** (enforced by `0003_accounts.sql` and `0004_moderation.sql`, checked by the database tests):

- Anyone can read spots. Only signed-in campers can add them, at most 20 a day each.
- Campers can edit spots they added, and delete them until another camper has reported on them. Starter spots and other campers' spots can't be changed from the app. An edit clears a spot's "confirmed" status.
- The server sets who added a spot, when, whether it's confirmed, and its report count. The app can't.
- Display names show only on spots a camper has added. Emails are never shown to anyone else.
- Deleting an account removes the sign-in and the name. Spots it added stay, without a name.
- Campers must agree to the current terms before adding or editing spots. Banned campers can't add, edit, rename or report.
- Spot text and names pass the word filter. Reports and blocks are private; only you (in the SQL Editor) see reports.
- Hidden spots show only to the camper who added them. Only your moderator tools hide, restore and ban. A spot that's hidden or has open reports can't be deleted by its camper.
- Bans hold through account deletion: the database keeps one-way hashes of a banned account's email and sign-ins.

## Moderation, legal pages and crash reports

**Moderation.** Apple expects you to act on reports within 24 hours. [MODERATION.md](MODERATION.md) sets up an email for every report (a small Supabase Edge Function, `supabase/functions/report-alert`, plus Resend) and walks through the daily routine in the SQL Editor.

**Reviewing cleanups.** Make yourself a moderator once, in the SQL Editor (put your display name in the quotes):

```sql
select moderation.add_moderator(camper_id) from moderation.find_camper('Sam');
```

Then **Account > Review cleanups** shows what's waiting. MODERATION.md has the details.

**Legal pages.** The privacy policy, terms of use and support page are in `docs/`, ready for GitHub Pages:

1. Fill in your name and support email at the top of `docs/_config.yml`.
2. On GitHub: your DisCamp repo > **Settings > Pages** > Deploy from a branch: `main`, folder `/docs`. (Pages needs a public repo on a free account. Prefer a private repo? Copy `docs/` into a separate public one, then set `EXPO_PUBLIC_LEGAL_BASE_URL` to its address.)
3. The pages appear at `https://<your GitHub username>.github.io/DisCamp/` (`privacy/`, `terms/`, `support/`). The app links there by default.

They're drafts written from what the app does, not legal advice: have someone qualified read them before launch.

**Support email.** Set `EXPO_PUBLIC_SUPPORT_EMAIL` in `.env` and on expo.dev. The Account tab shows it, and a production build stops without it, since App Review needs a way to reach you.

**Crash reports (optional, free).** Make a project at [sentry.io](https://sentry.io) (React Native), copy its DSN into `EXPO_PUBLIC_SENTRY_DSN`. Reports carry the error, app version and phone model, never emails, names, account ids or sign-in tokens (`src/lib/crashReports.ts` scrubs them). They're off in Expo Go. To see your own code in crash reports, also set `SENTRY_ORG`, `SENTRY_PROJECT` and the `SENTRY_AUTH_TOKEN` secret on expo.dev.

**Over-the-air updates.** `expo-updates` is set up: after `npx eas-cli@latest init`, builds check for updates on launch, and a JavaScript-only fix reaches phones with `npx eas-cli@latest update --channel production --message "Fix ..."` without a new App Review. Anything that changes native code or permissions still needs a new build.

**App Store Connect.** `store/app-store-connect.md` has draft answers for App Privacy, the age rating and the App Review notes.

## Build for TestFlight and Android

Builds run on Expo's servers with EAS (`eas.json` has a **preview** and a **production** profile). The first time, run `npx eas-cli@latest login` and `npx eas-cli@latest init`.

- **Android needs a Google Maps key.** Android draws the map with Google Maps. Create a key with "Maps SDK for Android" turned on in Google Cloud, and add it on expo.dev as the environment variable `GOOGLE_MAPS_ANDROID_API_KEY` for each environment you build. An Android build stops with a clear message if it's missing, instead of shipping a blank map. iPhone uses Apple Maps and needs no key.
- **Android test build (APK you can install directly):** `npx eas-cli@latest build --profile preview --platform android`
- **iPhone for TestFlight:** `npx eas-cli@latest build --profile production --platform ios`, then `npx eas-cli@latest submit --platform ios`. This needs your Apple Developer account.
- **App ID:** `org.discamp.app` in `app.json` is a placeholder. Change it to one you own before your first store build; it can't be changed after release.

## Project map

```
src/
  app/                      Screens (Expo Router: every file here is a screen)
    _layout.tsx             Providers, splash screen, crash screen, main stack
    (tabs)/_layout.tsx      Bottom tabs: Explore, Cleanups, My Rig, Account
    (tabs)/index.tsx        Explore: map or list, filters, summary card, "Add spot"
    (tabs)/cleanups.tsx     Cleanups: to clean up (nearest first), waiting for review, done lately
    (tabs)/rig.tsx          My Rig
    (tabs)/account.tsx      Account: Embers and rank, name, your spots, blocked campers, help, sign out, delete account
    spot/[id].tsx           Spot page (edit and delete if you added it; report and block otherwise)
    report/[kind]/[id].tsx  Report a spot, a photo, a check-in, a cleanup or a camper's name
    checkin/[id].tsx        Report a change at a spot (washout, locked gate, trash, closed)
    rules.tsx               The community rules on their own, before a first photo or check-in
    cleanup/[id].tsx        A cleanup: before photo, status, "I cleaned it up", delete or report
    cleanup/new.tsx         Post a cleanup (before photo, pinned where you stand)
    cleanup/send/[id].tsx   Send a cleanup for review (after photo within 150 m, haul shot)
    review.tsx              Moderators: approve cleanups or send them back
    spot/new.tsx            Add a spot
    spot/edit/[id].tsx      Edit a spot you added
    sign-in.tsx             Sign in with Apple, Google, Microsoft or GitHub
    auth/callback.tsx       Where a sign-in link lands in a browser
    +native-intent.tsx      Catches the sign-in link on phones
    +not-found.tsx          Page for broken links
  components/               Map, pins, cost meter, clearance gauge, cards, shared UI
  data/seedSpots.ts         Starter spots (6, from public listings)
  data/spots.tsx            Shares spots with every screen: starter → saved → server
  data/spotsRepository.ts   Server queries and the offline copy
  data/spotWrites.ts        Adding, editing and deleting spots on the server
  data/moderation.ts        Reports, blocks and agreeing to the terms, on the server
  data/community.ts         Photos and check-ins on the server
  data/cleanups.ts          Cleanups, reviews and Embers on the server
  data/cleanupsStore.tsx    Shares cleanups with the map, Cleanups tab and spot pages
  lib/embers.ts             Embers amounts and ranks
  lib/camera.ts             Camera-only photos for cleanups
  lib/fit.ts                Rig-fit rules and the C1–C7 clearance tiers
  lib/cost.ts               Cost meter levels and the fee that applies to your rig
  lib/geo.ts                Distances, directions, map regions
  lib/schemas.ts            Checks every piece of outside data (server, saved settings)
  lib/rig.tsx, prefs.tsx    My Rig and remembered preferences
  lib/location.tsx          Location, only when asked
  lib/usePersistentState.ts Saved-on-phone state with safe loading and saving
  lib/links.ts              Directions, share, copy and call
  lib/auth.tsx              Who's signed in; sign in, sign out, rename, delete account
  lib/authFlows.ts          The sign-in steps for each provider (PKCE, Apple nonce)
  lib/secureStorage.ts      Keeps the sign-in session in the phone's keychain
  lib/spotDraft.ts          The add/edit form as data: checks and conversions
  lib/wordFilter.ts         The word filter (and the database's copy of it)
  lib/photoPicker.ts        Takes or picks a photo, shrinks it and strips its details
  lib/usePostingGate.ts     Before posting: signed in and agreed to the rules
  lib/crashReports.ts       Sentry crash reports, scrubbed of anything personal
  components/TermsGate.tsx  Community rules and "I agree", before a first post
  components/SpotPhotos.tsx A spot's photos: thumbnails, add, full-size view
  components/SpotCheckins.tsx "Were you here?": Still good, Something changed, recent check-ins
  components/Cleanups.tsx   Cleanup rows, photos, and the Cleanups card on spot pages
  components/EmbersCard.tsx Embers and rank on Account, and the moderators' way into Review
  config.ts                 App-wide settings (timeouts, storage keys, support and legal links)
  theme.ts                  Colors and sizes
supabase/migrations/        Database schema, one numbered file per change
supabase/seed.sql           Generated from seedSpots.ts (npm run seed:sql)
supabase/functions/         report-alert: emails you each report (Deno, runs on Supabase)
docs/                       Privacy policy, terms and support page (GitHub Pages)
store/                      Draft App Store Connect answers
MODERATION.md               Acting on reports within 24 hours
scripts/seedSql.ts          The seed generator
scripts/setup-database.sh   Loads (or updates) the Supabase database from Terminal
__tests__/                  Tests; screens/ renders the whole app
test/                       Test helpers and stand-ins for native modules
```

## How the rules work

- **Clearance:** your clearance sets the roughest tier you can handle (9" handles C4, 8–10"). One tier above is **tight**; two or more is **won't fit**.
- **Drivetrain:** "AWD recommended" without AWD is tight; "4WD required" without 4WD won't fit.
- **How you camp:** tent, rooftop tent and van need that box checked. Trailers and big rigs need enough length, and big rigs also need a turnaround.
- **Missing data never passes as a fit.** If anything needed is unreported, the pin is gray "not enough reports", even when the rest looks tight or fine. The details page still lists every reason.
- **Cost meter:** Free = $0, $ = under $15, $$ = $15–30, $$$ = over $30 a night. Trailers and big rigs pay the RV site fee. If a spot has hookups but nobody has reported that fee, the cost shows as "Not reported" instead of guessing.

## Security

- Visitors can only read. Signed-in campers can change only their own spots and account, enforced by grants, row-level security and triggers in the database (see "What the database allows"). Reports, blocks and moderator tools are out of reach of the app. The database test checks every rule on each push.
- Embers are written only by the database (an append-only ledger campers can read but not write), from what campers do; no request from the app can add any directly. A modified app can still claim to be where it isn't, which is why a moderator approves every cleanup, check-ins earn at most 50 a day, and deleting a photo takes its Embers back. Cleanup reviews run in database functions that check the camper is a moderator.
- The camera is asked for only when a camper taps "Take a photo" (or a cleanup's photo button); choosing from the library uses the phone's own picker, which needs no permission. DisCamp never records sound, so Android's microphone permission is removed. Android 9 and older keep one storage permission, because their camera needs it to save the photo it takes.
- iPhone asks for location only while the app is in use; the unused "always" and motion permission messages, background location, Android's overlay permission and (on Android 10 and newer) storage access are removed.
- Every row from the server is validated. A bad field becomes "not reported"; a broken row is skipped; links can only be web links.
- `npm audit` lists advisories in packages Expo uses at build time (its command-line tools and config plugins). They don't ship inside the app. Keep Expo up to date with `npx expo install --fix` to pick up their fixes.

## Notes for later

- **Maps:** v1 uses `react-native-maps` (Apple Maps on iPhone, Google Maps on Android) because it runs in Expo Go for free. The plan's MapLibre + OpenFreeMap switch comes with offline maps; only `src/components/SpotMap.tsx` touches the map.
- **Lots of spots:** the app loads every spot in one request, and Supabase returns at most 1,000 rows per request. Before you get close, switch to loading spots for the visible map area (the app logs a warning if it ever hits the limit).
- **Cleanups later:** AI checks of before and after photos (an Edge Function, so the key never ships in the app), duplicate-photo checks, and trusted campers reviewing cleanups. Until then a moderator reviews every one.
- **Next up:** TestFlight on a real iPhone and the App Store. The product plan's MVP backlog lists the rest, sprint by sprint.

## Put it on GitHub

```sh
cd ~/Documents/DisCamp
git init
git add .
git commit -m "DisCamp v1.4"
```

Then create an empty repo on GitHub and follow its "push an existing repository" steps. CI starts running on the first push.
