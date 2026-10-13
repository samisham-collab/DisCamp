# DisCamp

Community map of campsites that checks whether a camper's rig can reach and fit a spot, with a nightly cost meter. Read README.md first; CHANGELOG.md lists what changed and why.

- Keep rules in `src/lib/` (fit, cost, geo) as pure functions with unit tests in `__tests__/`.
- `null` in spot data means "not reported yet": show it as unknown, never guess. Missing reports outrank cautions in `fitFor`.
- The spot data shape lives in `src/types.ts`. Keep these in step with it: `src/lib/schemas.ts` (`spotSchema` for trusted data, `spotRowSchema` for database rows), `scripts/seedSql.ts`, and the SQL in `supabase/migrations/`.
- Migrations are append-only: never edit a file that may have run; add the next numbered file. `__tests__/database.test.ts` lists them and must be updated too.
- After editing `src/data/seedSpots.ts`, run `npm run seed:sql`.
- Validate anything from outside the code (server, storage, links) with zod at the boundary. Screens can then trust their data.
- Native code paths (maps, location, storage) sit behind small modules with test stand-ins in `test/mocks/` and `src/lib/__mocks__/`.
- Tests fail on unexpected `console.warn`/`console.error`. If a test expects a log, silence it with `jest.spyOn(console, 'warn').mockImplementation(() => undefined)`.
- Accounts and writes: the database decides who may change what (`supabase/migrations/0003_accounts.sql`: column grants, row-level security, the `guard_spot_write` trigger). The app checks first for friendlier messages, but never relies on that. New writable columns need a grant there and a test in `__tests__/database.test.ts`.
- Moderation (`supabase/migrations/0004_moderation.sql`, word filter updated in `0005_fixes.sql`): writes need the current terms (`TERMS_VERSION` in `src/config.ts` must equal `moderation.current_terms_version()`), pass the word filter and come from a camper who isn't banned. The app's word filter (`src/lib/wordFilter.ts`) runs the database's exact check on the same rules (`moderation.word_rules`); changing the rules means a new migration with the rows `serverWordRules()` makes, and a database test checks they match. Reports live in `public.flags` (never confused with `spots.report_count`, which counts on-site reports). Moderator tools are in the `moderation` schema, which the app can't reach. MODERATION.md is the runbook.
- Photos and check-ins (`supabase/migrations/0006_photos_checkins.sql`, `src/data/community.ts`): photo files live in the public Storage bucket `spot-photos` at `<camper id>/<photo id>.jpg`, and `public.spot_photos` lists them; the database checks the file exists and belongs to the camper. `src/lib/photoPicker.ts` shrinks every photo and saves it fresh, which strips EXIF (location); keep that step for any new photo path. Check-ins never change spot data: change reports show as `alerts` on `spots_api` until a "Still good". Reports (`public.flags`) have exactly one target: `spot_id`, `camper_id`, `photo_id` or `checkin_id`. Posting screens use `usePostingGate` (signed in, rules agreed). The fake in `test/fakeSupabase.ts` mirrors Storage too (`files`, `storageIntercept`).
- Crash reports go through `log.error` (Sentry, when `EXPO_PUBLIC_SENTRY_DSN` is set). Never put emails, names, account ids or tokens in log messages; `src/lib/crashReports.ts` scrubs them as a backstop.
- `docs/` is the public website (GitHub Pages): privacy policy, terms, support. When the app's data handling changes, update `docs/privacy.md` and `store/app-store-connect.md` too.
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
