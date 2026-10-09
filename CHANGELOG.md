# Changelog

All notable changes to DisCamp. Dates are when the version was finished.

## 1.3.0 (2026-10-07)

Accounts and camper-added spots (MVP story 5, and enabler E1: sign-in).

### Added

**Sign-in**

- Sign in with **Apple, Google, Microsoft or GitHub**, from the new **Account** tab or when adding a spot. Browsing never needs an account.
- On iPhone, Apple uses the built-in Sign in with Apple sheet. Everything else opens in a secure browser sheet and returns to the app.
- The sign-in session is kept in the phone's keychain (iOS Keychain or Android Keystore), on this device only.
- `EXPO_PUBLIC_AUTH_PROVIDERS` chooses which sign-in buttons show, so a provider that isn't set up yet stays hidden.

**Adding spots**

- **Add spot** button on Explore. Drop a pin on a satellite map, use your location, or paste GPS coordinates. Then add access, who fits, cost, amenities, rules and directions.
- Only the name, land manager and location are required; anything else can stay "Not sure".
- The draft is saved on the phone as you type, so leaving the screen or losing signal never loses it.
- A warning appears when another spot is within a quarter mile, with a link to it.
- Fields that need fixing are marked in red, and the form scrolls to the first one.
- New spots show for everyone right away, marked "Added by a camper, not yet confirmed".

**Your spots and your account**

- Spot pages show who added a spot and when. On your own spots you can **edit** or **delete**.
- The Account tab shows your display name (which you can change), the spots you added, **Sign out** and **Delete account**.

### Security and reliability

- New migration `0003_accounts.sql`:
  - Profiles hold display names.
  - Each spot records who added it.
  - The database itself decides who may change what: column grants, row-level security, and a trigger that sets the server-owned fields (who added it, when, confirmed status, report count, sources).
  - Campers can add at most 20 spots a day. This holds even when many adds arrive at once.
  - Names show only for campers who have added a spot.
  - The account-deletion function deletes your own account and nothing else.
- Adding a spot can be retried safely. Each draft gets its own id, so if the connection drops after the server saved the spot, trying again opens that spot instead of adding a second copy.
- Sign-in uses PKCE: the browser only ever carries a one-time code, which only this app can trade for a session. Each code is traded once, even if it arrives twice.
- Apple sign-in sends a hashed one-time nonce, so a captured answer can't be replayed.
- After sign-in, the app returns only to known screens; a crafted link can't redirect it anywhere else.
- Saving the session never leaves a half-written copy that would look like being signed out.

### For developers

- `test/fakeSupabase.ts` is now an in-memory Supabase with the same ownership rules as the database, so screen tests can sign in and add, edit and delete spots.
- The database test now runs against a stand-in for Supabase's auth schema. It checks every permission rule: who can add, edit, delete and rename, the daily limit under concurrent requests, and that account deletion keeps spots.
- 348 tests plus 13 database tests. Coverage floors raised to 97% statements, 89% branches, 96% functions, 98% lines.
- New packages (Expo SDK 57 versions): `expo-web-browser`, `expo-apple-authentication`, `expo-crypto`, `expo-secure-store`.

### Still to do before the App Store

- Switch on Sign in with Apple. Apple requires it whenever Google, Microsoft or GitHub sign-in is offered.
- Revoke Apple tokens when an account is deleted, which needs a small server function holding the Apple key (planned for Sprint 6).

## 1.2.0 (2026-10-07)

### Added

Five starter spots, filled in from public listings (Forest Service, Idaho Fish and Game, Campendium, The Dyrt, Trails Offroad, WTA). Each page links its sources and is marked "not yet confirmed on site".

- **Sublett Reservoir, Idaho** (three spots, west to east):
  - **Sublett Dam**: free Fish and Game access site, vault toilet, RVs up to 35 ft, 10-day limit. The road across the dam is narrow.
  - **Sublett Campground**: free Forest Service campground, 5 to 9 small sites in one loop, vault toilet, tables, fire rings, RVs up to 20 ft. No drinking water.
  - **South Fork Sublett Creek**: free dispersed sites on Forest Road 583 just past the campground. No road reports yet.
- **Forest Road 46 near Packwood, Washington**: free dispersed camping on a gravel forest road off US 12, with camps near the FR 4610 junction and Goat Rocks Wilderness trailheads. The pin is approximate (no source lists coordinates).
- **Forest Road 356 near Mount Rushmore, South Dakota**: free dispersed sites about 0.6 mile east of the Mount Rushmore KOA at Palmer Gulch. 2WD to the first sites, high clearance beyond; a 30 ft trailer has made it. No open campfires anywhere in the South Dakota Black Hills.

### For developers

- New `__tests__/seedSpots.test.ts`: every starter spot is valid, sits in the right state, cites https sources, and gives each preset rig the fit rating its sources support.
- New `__tests__/screens/starterSpots.test.tsx` opens every starter spot in the full app.
- The Explore and Spot screen tests now run against Smoky Gardens only (`test/mocks/seedSpots.ts`), so adding spots never changes their expected counts or distances.
- 232 tests, plus the 7 database tests.

## 1.1.1 (2026-10-07)

### Fixed

- When the phone couldn't get a GPS fix (indoors, poor signal, or the iPhone Simulator with no location set), "Show my location" treated it as an app error: in development it opened a red "Console Error" screen. It's now handled as "no fix yet": the camper sees "Couldn't find your location. Try again in a moment, ideally with a clear view of the sky."

## 1.1.0 (2026-10-06)

Hardening release: same features as 1.0, made reliable, plus quality-of-life additions.

### Fixed

**Map and screens**

- Android pins kept their old color after you changed your rig. They now redraw.
- Opening a link straight to a spot left no way back. The back button now returns to Explore.
- On small phones, the summary card covered the map buttons. Buttons it would cover now hide until the card closes.
- A tapped pin could end up hidden behind the summary card, and on Android the map's own centering was cut short. The chosen pin now moves into view above the card.
- Android's back button left the app while a summary card was open. It now closes the card first.
- The keyboard covered the rig name on smaller phones. The name field now sits at the top of My Rig.
- Typing a rig name rebuilt every pin and list row on each keystroke.
- Wording: "1 spot matches", "No camper reports yet", "(RV site)".
- Source links were smaller than the 44-point minimum touch size.

**Fit and cost rules**

- A spot with missing reports could show as "tight" and pass the "Fits my rig" filter. Missing reports now always mean "not enough reports".
- Trailers and big rigs at a spot with hookups but no reported RV fee were shown the standard fee (often "Free"). That fee now shows as not reported.

**Data and saving**

- If reading saved settings took over 3 seconds, the app started with the default rig and the first change overwrote your saved rig. A late read is now used if you haven't changed anything.
- A change made less than 0.3 seconds before the app's crash screen appeared was never saved.
- A server row with one odd value could hide the whole spot: an empty item in a list, a name of only spaces or tabs, or a long emoji name. These are now cleaned up and the spot shows.
- Phone numbers: strings with no digits were accepted, and long numbers were cut short before checking. Both fixed; a number needs 7 to 15 digits.
- Offline, the app waited about 7 seconds (hidden automatic retries) before saying so. It now says so right away; Retry and pull-to-refresh try again.
- Re-running the database seed reset camper-earned fields (verified, report count). It no longer does.
- Logged errors for some unusual thrown values came out empty.

**Location**

- On iPhone, saying "Don't Allow" was immediately followed by a "go to Settings" alert. The alert now only appears on a later tap.
- If the phone never answered a location request, "Show my location" could spin forever. Every step now has a time limit.
- A location failure at launch hid the blue location dot even when permission was granted.

**Build and setup**

- Android builds would have shown a blank map: no Google Maps key was set up. The key now comes from the `GOOGLE_MAPS_ANDROID_API_KEY` environment variable, and an Android build without it stops with a clear message.
- Three native libraries were installed at versions Expo SDK 57 doesn't support (gesture handler, reanimated, worklets), which could break native builds. Pinned to the supported versions.
- `expo-asset` is now a declared dependency. Icon fonts need it at runtime, and it was only present by luck of install order.
- The EAS "development" build profile couldn't build (it needs a package that isn't installed). Removed; Expo Go covers development.
- The README said the first migration added Smoky Gardens (the seed file does) and pointed to the wrong place for the Maps key.

### Security

- New migration `0002_harden.sql`: the public can read spots and do nothing else. Supabase's default grants allowed TRUNCATE, which row-level security doesn't cover.
- The database now rejects data the app can't use: names made only of spaces, tabs or line breaks; empty or invalid map points; nested lists and missing (NULL) list items; and phone numbers without enough digits.
- The database test now starts from Supabase's real default permissions and checks that row-level security and the read-only view stay in place.
- iOS and Android only ask for location while the app is in use; background location permissions are blocked outright.

### Added

- List view, sorted best fit first, then nearest.
- Distances with direction ("11 mi S"; "11 mi south of you" on the spot page).
- "Impassable when wet" warning on list rows and the summary card.
- Share and Copy GPS buttons on the spot page; Directions opens Apple Maps on iPhone and Google Maps on Android.
- Offline copy of spots, with a banner and Retry when the server can't be reached, and pull-to-refresh in the list.
- The map frames your spots (or your location, if you've allowed it before) when they first load, unless you've already moved it.
- Remembered filters, map or list view, and satellite view.
- Location is only requested when you tap "Show my location" or "Sort by distance".
- Legend explaining pin colors and the cost meter.
- Screen readers: labels and roles everywhere, adjustable steppers, and announcements for filter counts and connection problems.
- App icon and splash screen.

### For developers

- Strict TypeScript, ESLint (with checks for forgotten promises) and Prettier; `npm run check` runs everything.
- 202 tests as of 1.1.1, including full-app screen tests, plus 7 database tests that run in CI. Coverage thresholds: 96% statements, 86% branches, 94% functions, 97% lines.
- Tests fail on any unexpected console warning or error.
- Every outside input is validated with zod at the boundary.
- GitHub Actions CI, plus a database job against Postgres + PostGIS.

## 1.0.0 (2026-10-06)

First version: map with fit-colored pins, spot pages, My Rig with presets, cost meter for big rigs and trailers, filters, and Smoky Gardens as the starter spot. Optional Supabase backend.
