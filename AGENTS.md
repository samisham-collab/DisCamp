# DisCamp

Community map of campsites that checks whether a camper's rig can reach and fit a spot, with a nightly cost meter. Read README.md first; CHANGELOG.md lists what changed and why.

- Keep rules in `src/lib/` (fit, cost, geo) as pure functions with unit tests in `__tests__/`.
- `null` in spot data means "not reported yet": show it as unknown, never guess. Missing reports outrank cautions in `fitFor`.
- The spot data shape lives in `src/types.ts`. Keep these in step with it: `src/lib/schemas.ts` (`spotSchema` for trusted data, `spotRowSchema` for database rows), `scripts/seedSql.ts`, and the SQL in `supabase/migrations/`.
- Migrations are append-only: never edit a file that may have run; add the next numbered file. `__tests__/database.test.ts` lists them and must be updated too.
- After editing `src/data/seedSpots.ts`, run `npm run seed:sql`.
- Validate anything from outside the code (server, storage, links) with zod at the boundary. Screens can then trust their data.
- Native code paths (maps, location, storage, notifications, in-app purchases) sit behind small modules with test stand-ins in `test/mocks/` and `src/lib/__mocks__/`.
- Tests fail on unexpected `console.warn`/`console.error`. If a test expects a log, silence it with `jest.spyOn(console, 'warn').mockImplementation(() => undefined)`.
- Accounts and writes: the database decides who may change what (`supabase/migrations/0003_accounts.sql`: column grants, row-level security, the `guard_spot_write` trigger). The app checks first for friendlier messages, but never relies on that. New writable columns need a grant there and a test in `__tests__/database.test.ts`.
- Moderation (`supabase/migrations/0004_moderation.sql`, word filter updated in `0005_fixes.sql`): writes need the current terms (`TERMS_VERSION` in `src/config.ts` must equal `moderation.current_terms_version()`), pass the word filter and come from a camper who isn't banned. The app's word filter (`src/lib/wordFilter.ts`) runs the database's exact check on the same rules (`moderation.word_rules`); changing the rules means a new migration with the rows `serverWordRules()` makes, and a database test checks they match. Reports live in `public.flags` (never confused with `spots.report_count`, which counts on-site reports). Moderator tools are in the `moderation` schema, which the app can't reach. MODERATION.md is the runbook.
- Photos and check-ins (`supabase/migrations/0006_photos_checkins.sql`, `src/data/community.ts`): photo files live in the public Storage bucket `spot-photos` at `<camper id>/<photo id>.jpg`, and `public.spot_photos` lists them; the database checks the file exists and belongs to the camper. `src/lib/photoPicker.ts` shrinks every photo and saves it fresh, which strips EXIF (location); keep that step for any new photo path. Check-ins never change spot data: change reports show as `alerts` on `spots_api` until a "Still good". "Still good" is once per camper per spot every 30 days, and a later change report from the same camper takes it back (`checkins.withdrawn_at`, 0007); taken-back rows stay, so Embers can count each camper's first "Still good" per spot. Reports (`public.flags`) have exactly one target: `spot_id`, `camper_id`, `photo_id`, `checkin_id` or `task_id`. Posting screens use `usePostingGate` (signed in, rules agreed). The fake in `test/fakeSupabase.ts` mirrors Storage too (`files`, `storageIntercept`).
- Cleanups and Embers (`supabase/migrations/0008_cleanups_embers.sql`, `src/data/cleanups.ts`, `src/data/cleanupsStore.tsx`): a cleanup (`public.cleanup_tasks`) is posted with a before photo from the camera (`src/lib/camera.ts`, never the library) at `<camper id>/<cleanup id>.jpg`, pinned where the camper stood; a camper sends an after photo and haul shot (`public.cleanup_completions`) from within 150 m, at most twice per cleanup, one waiting at a time. Moderators (`moderation.moderators`) review in the app through `public.cleanup_review_queue`, `approve_cleanup` and `reject_cleanup`, which check `moderation.is_moderator`. Embers live in an append-only ledger (`public.embers`, edits refused) written only by `moderation.award` / `award_per_spot` / `take_back` from triggers and those functions, never by the app; daily limits count by the camper's Mountain-time day (300, 100 in an account's first two weeks, 50 of them from check-ins), and deleting a photo takes its Embers back (a trigger). A photo already listed anywhere (`moderation.photo_listed`) can't be used for a cleanup. Terms version 2 came with 0008. The amounts are in `src/lib/embers.ts` for showing; the database is the source of truth. Where the after photo was taken is private (no column grant): only moderators see it. The cleanups list loads quietly (no error logs: it runs on every launch); `test/fakeSupabase.ts` mirrors cleanups, reviews and Embers (`cleanups`, `completions`, `embers`, `moderators`).
- Starter spots (`src/data/seedSpots.ts` plus one file per region in `src/data/seeds/`): every value from a cited source, anything else marked `// ASSUMPTION` or left `null`; `verified: false`. `__tests__/seedSpots.test.ts` lists every id with its state (a rough box catches swapped coordinates) and `__tests__/seeds.test.ts` checks each region file on its own. KOAs are `siteType: 'campground'` with "KOA" in the land manager.
- Store-only features (notifications, tips) load their native modules lazily (`require` inside `src/lib/push.ts` and `src/lib/tips.ts`) and answer "unavailable" in Expo Go (`src/lib/expoGo.ts`, which tests mock) and on the web; importing `expo-notifications` in Expo Go only prints warnings. Push addresses (`public.push_tokens`, 0009) are reached only through `register_push_token` / `forget_push_token`; who to tell about a cleanup is `public.cleanup_push_targets`, for the `cleanup-push` Edge Function (service role only). Tips are consumable in-app purchases (`tip_small`, `tip_medium`, `tip_large`) that unlock nothing; `src/data/tipsStore.tsx` holds the store connection for the whole app and finishes only `purchased` tips (never `pending`), once each, on purchase and whenever the app comes to the front. There's no server record of them. Deleting an account that used Sign in with Apple first gets a one-time code from Apple's sheet and calls the `apple-revoke` Edge Function (`src/lib/appleRevoke.ts`); the Apple key lives only in Supabase secrets.
- Edge Functions (`supabase/functions/<name>/index.ts`, Deno) keep their logic in a sibling file of plain functions (`message.ts`, `apple.ts`) that Jest tests; `index.ts` is left out of typecheck and lint.
- Accessibility: decorative `Ionicons` get `accessibilityElementsHidden importantForAccessibility="no"`; every pressable has a role and a label (an icon-only one needs `accessibilityLabel`).
- Crash reports go through `log.error` (Sentry, when `EXPO_PUBLIC_SENTRY_DSN` is set). Never put emails, names, account ids or tokens in log messages; `src/lib/crashReports.ts` scrubs them as a backstop.
- `docs/` is the public website (GitHub Pages, Jekyll): home page, privacy policy, terms, support, with one layout and stylesheet. The home page describes features: keep it true to the app. When the app's data handling changes, update `docs/privacy.md` and `store/app-store-connect.md` too.
- Screens get the Supabase client from `useAuth().client` (one shared client via `ServerProvider`). Tests use the in-memory fake in `test/fakeSupabase.ts`, which follows the same ownership rules; connect it with `connectServer(backend)` from `test/helpers.ts`.
- Sign-in uses PKCE and keeps the session in the keychain (`src/lib/secureStorage.ts`). Never log tokens, codes or email addresses.
- Run `npm run check` (types, lint, formatting, tests with coverage thresholds) before calling a change done.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or install `expo-dev-client` and add a `development` profile to `eas.json` for `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
