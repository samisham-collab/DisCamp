# DisCamp

A free, community-built map of campsites that tells you whether your rig can reach a spot, whether it fits, and what it costs to stay.

**Version 1.1** hardens the first version for real use: over 30 bugs fixed, every screen tested, the database locked down, and a set of quality-of-life features. See [CHANGELOG.md](CHANGELOG.md) for the full list. It starts with **Smoky Gardens** (Soldiers Memorial Park, Sherman County, Kansas).

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
- Works with **no backend**. Supabase is optional (see below).

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

## Update Smoky Gardens

Edit `src/data/seedSpots.ts`. These came from public listings and need a visit to confirm:

- **Pin location** is approximate (39.19, -101.76). Drop an exact pin on site.
- **Clearance (C2) and "2WD OK"** are assumptions about the county roads.
- **Not reported yet:** longest trailer or RV, big-rig turnaround, stay limit, whether the roads are impassable when wet.

After editing, run `npm run seed:sql` to regenerate `supabase/seed.sql` (a test fails if you forget).

When it's confirmed on site, set `verified: true` and the "Starter info" banner disappears. If you've connected Supabase, run this in the SQL Editor too, because re-running the seed never overwrites camper-earned fields:

```sql
update public.spots set verified = true where id = 'smoky-gardens';
```

## Connect Supabase (optional, free)

1. Create a project on the free plan at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run these files in order, each pasted in and run on its own:
   1. `supabase/migrations/0001_init.sql` creates the `spots` table.
   2. `supabase/migrations/0002_harden.sql` makes it read-only for the app and adds data checks.
   3. `supabase/seed.sql` adds Smoky Gardens.
3. Copy your **Project URL** and **publishable key** from the project's API settings.
4. For your phone: `cp .env.example .env`, put both values in `.env`, and restart `npx expo start`.
5. For builds made on EAS: `.env` isn't uploaded, so add both values on expo.dev (your project > **Environment variables**) for the **preview** and **production** environments. Without them, a build quietly uses the starter spots only.

The app then reads spots from the database. If it can't reach it, it shows the last saved copy (or the starter spots) and a banner with Retry. Never put the secret (service role) key in the app or in `.env`.

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
    (tabs)/_layout.tsx      Bottom tabs: Explore, My Rig
    (tabs)/index.tsx        Explore: map or list, filters, summary card
    (tabs)/rig.tsx          My Rig
    spot/[id].tsx           Spot page
    +not-found.tsx          Page for broken links
  components/               Map, pins, cost meter, clearance gauge, cards, shared UI
  data/seedSpots.ts         Starter spots (Smoky Gardens)
  data/spots.tsx            Shares spots with every screen: starter → saved → server
  data/spotsRepository.ts   Server queries and the offline copy
  lib/fit.ts                Rig-fit rules and the C1–C7 clearance tiers
  lib/cost.ts               Cost meter levels and the fee that applies to your rig
  lib/geo.ts                Distances, directions, map regions
  lib/schemas.ts            Checks every piece of outside data (server, saved settings)
  lib/rig.tsx, prefs.tsx    My Rig and remembered preferences
  lib/location.tsx          Location, only when asked
  lib/usePersistentState.ts Saved-on-phone state with safe loading and saving
  lib/links.ts              Directions, share, copy and call
  config.ts                 App-wide settings (timeouts, storage keys)
  theme.ts                  Colors and sizes
supabase/migrations/        Database schema, one numbered file per change
supabase/seed.sql           Generated from seedSpots.ts (npm run seed:sql)
scripts/seedSql.ts          The seed generator
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

- The app only reads. The database lets the public read spots and nothing else: no inserts, updates, deletes or truncates, enforced by both grants and row-level security. The database test checks this on every push.
- Every row from the server is validated. A bad field becomes "not reported"; a broken row is skipped; links can only be web links.
- `npm audit` lists advisories in packages Expo uses at build time (its command-line tools and config plugins). They don't ship inside the app. Keep Expo up to date with `npx expo install --fix` to pick up their fixes.

## Notes for later

- **Maps:** v1 uses `react-native-maps` (Apple Maps on iPhone, Google Maps on Android) because it runs in Expo Go for free. The plan's MapLibre + OpenFreeMap switch comes with offline maps; only `src/components/SpotMap.tsx` touches the map.
- **Lots of spots:** the app loads every spot in one request, and Supabase returns at most 1,000 rows per request. Before you get close, switch to loading spots for the visible map area (the app logs a warning if it ever hits the limit).
- **Next up (Sprint 2):** add a spot from the app, photo upload and sign-in.

## Put it on GitHub

```sh
cd ~/Documents/DisCamp
git init
git add .
git commit -m "DisCamp v1.1"
```

Then create an empty repo on GitHub and follow its "push an existing repository" steps. CI starts running on the first push.
