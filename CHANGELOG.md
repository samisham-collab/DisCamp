# Changelog

All notable changes to DisCamp. Dates are when the version was finished.

## Unreleased

### Changed

- **Bundle ID `com.samuelisham.discamp`.** The iPhone bundle ID and the Android package name replace the placeholder `org.discamp.app`, and the `apple-revoke` function now assumes it, so `APPLE_CLIENT_ID` is no longer needed. The app is also linked to the Expo project `@discamp/discamp`.

### Added

- **DisCamp's website.** `docs/` is now a full site for GitHub Pages: a home page (what DisCamp does, how fit and the cost meter work, cleanups and Embers, privacy, donations only) and the support, privacy and terms pages in the same design, with light and dark modes and a phone layout. The pages name Samuel Isham as the owner and discamphelp@yahoo.com as the support email (also in the app). The App Store Connect notes list the home page as the Marketing URL.

## 1.7.1 (2026-10-19)

A pre-TestFlight pass: fixes from going through every screen as a camper would, and native settings checked with a full `expo prebuild` for iPhone and Android. No database changes. Run `npm ci` after pulling (it adds `expo-system-ui`).

### Added

- **"Go to my location" on the add-spot map.** The location picker has a button that moves the map to where you are, so you can drop the pin without scrolling from across the country.
- **Cleanups need a precise location.** If the phone only shares an approximate location (iPhone's Precise Location off, or Android's "Approximate"), posting or sending a cleanup says so, with a **Settings** button, instead of letting a pin land miles away. Post and Send wait until the location is precise. "Too far from the pin" shows metres under 1 km.
- **Leaving an unsaved edit asks first.** Back, a swipe or Android's back button on **Edit spot** with changes asks "Discard your changes?" (Keep editing / Discard). After saving, it goes back to the spot without asking.
- **Fresh data after a while away.** Coming back to DisCamp after 15 minutes or more reloads the spots and cleanups, so a cleanup someone finished while the phone was in a pocket doesn't still show as open.

### Changed

- **Nearest first.** Once your location is on, the list sorts nearest first (then best fit, then name); without it, best fit first. The summary card shows the distance first.
- **The map frames you and what's near.** "Show my location" (and the first view after allowing location) centres on you, zoomed out just enough to show the 3 nearest spots, instead of fitting every spot in the country.
- Spot pages say "No check-ins yet" / "3 check-ins" instead of "camper reports" (those are the on-site "Still good" and "Something changed" taps, not reports to moderators).
- Reporting a spot explains the difference: private land or no campsite is a report; a locked gate or washout is "Something changed".
- Sign-in says browsing never needs an account.
- **No microphone permission on iPhone.** DisCamp never records sound, so the photo picker no longer adds a microphone message to the app.
- Adds `expo-system-ui`, so the app's light/dark setting and background color apply to the native window (prebuild warned without it).
- **A store build stops without the server.** A production build on EAS now stops at the start if `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` isn't set for the production environment on expo.dev, instead of building a TestFlight app with only the starter spots and no sign-in.
- The Apple disconnect setup (README, "Sign-in") sets `APPLE_CLIENT_ID` to your bundle ID; without it, `apple-revoke` used the placeholder `org.discamp.app`, and Apple would turn the disconnect down once the bundle ID changes.
- **TESTFLIGHT.md**: what to set up while Apple reviews your developer account, what to do the day it's approved, and a test script to run on your iPhone.
- The tip jar gives up after 20 seconds if the App Store or Google Play doesn't answer, and shows **Try again** instead of a spinner forever. Signing out offline waits at most 4 seconds per step.

### Fixed

- Tapping **Add spot**, a photo or a check-in in the first second after launch, while the saved sign-in is still loading, says "One moment" instead of sending a signed-in camper to sign in (or to the rules again).
- An add-spot draft saved by one camper isn't shown to the next camper who signs in on the same phone.
- Blocking someone from a full-screen photo while signed out closes the photo before sign-in opens (sign-in used to open behind it). Blocking or unblocking someone updates the cleanups list too.
- Opening a cleanup that has since been removed takes it off the lists.
- On **Review**, the keyboard no longer covers the send-back reason.
- **Edit spot** no longer says reports from other campers are "coming in a later version"; it points to "Something changed".
- CI's database check failed from 1.7.0 on: a test compared the starter spots in name order, and CI's database (US English) sorts some of the new names differently from JavaScript. It now compares them by id. The app and the database were never affected.

## 1.7.0 (2026-10-16)

Notifications, the tip jar, disconnecting Apple on account deletion, an accessibility pass and 53 more starter spots. Run migration `0009_push.sql` along with this version: `bash scripts/setup-database.sh` runs just that file and reloads the starter spots. Notifications, tips and the Apple disconnect each need one-time setup outside the code (README and MODERATION.md say how); until then, the app explains instead of failing.

### Added

- **Notifications for cleanups.** Campers hear when a cleanup they sent is approved (with the Embers it earned) or sent back (with the reason), and when someone cleans up one they posted; moderators hear about each new cleanup to review. Tapping one opens that cleanup, or Review. The app offers them after a camper sends their first cleanup, and in a new **Account > Notifications** card; it never asks on launch. A new Edge Function, `cleanup-push`, sends them through Expo's push service from a Database Webhook on `cleanup_completions`. Migration 0009 keeps each phone's push address (up to 10 per camper, never readable from the app); signing out removes this phone's (asking the phone for it if this launch never registered it), and deleting an account removes them all. A camper whose cleanups a ban sent back isn't notified. On Android the notification shows DisCamp's tent. They need a store or TestFlight build: Expo Go can't receive them.
- **Tip jar.** **Account > Support DisCamp** takes tips of $2.99, $4.99 or $9.99 (Coffee at camp, A bundle of firewood, A tank of gas) as in-app purchases, at the store's local prices. A tip unlocks nothing, and DisCamp keeps no record of who tipped. It shows for everyone, signed in or not; in Expo Go it says tips need the store version. The store connection runs for the whole app, and each time DisCamp comes back to the front it finishes any paid tip left unfinished (Google refunds tips not finished within 3 days); a tip still waiting for payment is never finished early. Uses `expo-iap` 5.8.2.
- **Deleting an account disconnects Sign in with Apple.** On iPhone, Apple's sheet confirms it's the camper, and a new Edge Function, `apple-revoke`, revokes DisCamp's Apple tokens before the account is deleted (App Store rule 5.1.1(v), master task list Q6). It only revokes when Apple's answer is for the account's own Apple ID, so a phone signed in to someone else's Apple ID can't disconnect theirs. Closing Apple's sheet keeps the account, with an option to delete without Apple. If the function isn't set up (or on Android), the account is still deleted and the app explains the manual step, as before.
- **53 more starter spots** across 24 states (59 in all): 38 dispersed spots, from Valley of the Gods and Alabama Hills to Gale River Road and Flagpole Knob, and 15 KOAs, including Goodland's. Each was checked against current sources for closures and rule changes (several popular spots now need designated sites or permits, and the entries say so), and lists its sources. They're in `src/data/seeds/`, one file per region.

- **Keep Supabase awake.** A GitHub Actions workflow (`.github/workflows/keep-awake.yml`) reads one starter spot every Monday and Thursday, so the free Supabase project isn't paused after a week with no activity. It needs two repository secrets (README, "Connect Supabase").

### Changed

- **Accessibility pass (master task list Q5).** Decorative icons are hidden from screen readers everywhere (VoiceOver and TalkBack no longer stop on them); photo thumbnails say when a photo is hidden for review; banners read their message without the icon; the tab names grow with the phone's text size up to what fits; the add-spot loading spinner has a label.
- CI type-checks all three Edge Functions (report-alert, cleanup-push, apple-revoke).
- The privacy policy covers push addresses, Expo's push service and tips; the support page covers notifications, tips and the Apple disconnect; the App Store Connect notes describe the tips and the token revocation.

## 1.6.1 (2026-10-15)

### Fixed

- **The bottom tabs show which one you're on.** The selected tab's icon and name turn green, its icon fills in and its name goes bold, with a short green line under it; the others stay gray outlines. Before, the selected and other tabs were nearly the same dark color.

## 1.6.0 (2026-10-15)

Cleanups, the moderators' review, and Embers (product plan stories 7, 8 and 9). Run migration `0008_cleanups_embers.sql` along with this version: `bash scripts/setup-database.sh` runs just that file. Then make yourself a moderator (README "Moderation").

### Added

- **Cleanups.** A new **Cleanups** tab (and **Post a cleanup here** on every spot's page) posts trash at a site with a before photo from the camera, never the photo library. It's pinned where the camper stands, linked to a spot within 2 km, with what it is (litter, a fire ring, dumped trash, other), how big (small, medium, large) and an optional note. One cleanup per place: a second within 30 m is turned away. Up to 10 a day. Open cleanups show as orange pins on the map, in the Cleanups tab (nearest first) and on the spot's page; the Cleanups tab also lists those waiting for review and those done in the last 30 days. Whoever posted one can delete it until someone acts on it.
- **I cleaned it up.** Anyone, the camper who posted it included, sends an after photo, taken within 150 m of the pin (the app checks a fresh location from right after the photo; the database checks the location the app sends, and a moderator looks at every cleanup), and a haul shot of what they packed out. It waits for review; one at a time per cleanup, two tries per camper. A cleanup sent back shows why.
- **Review** for moderators, from Account: before, after and haul photos side by side, how far from the pin the after photo was taken, who sent it and their record. Approve at the size you see, or send it back with a reason. Moderators are added in the SQL Editor (`moderation.add_moderator`).
- **Embers and ranks** on Account: the total, rank (Tenderfoot to Guardian), how far to the next, today's count against the daily limit, recent Embers, and how to earn them. An approved cleanup earns 50/100/150 by size and 10 for whoever posted it; a spot you added that 2 campers confirm, 50; your first "Still good" and first change report on each spot, 10 each (a "Still good" taken back keeps its Embers); photos, 5 (3 a spot, ever). Up to 300 a day, 100 a day for an account's first two weeks, and at most 50 a day from check-ins (they need no proof of a visit). Only the database writes Embers, in an append-only ledger; photos and check-ins from 1.5 earned theirs when 0008 ran. Deleting a photo takes its Embers back, and so does a moderator removing a spot, photo, check-in or cleanup. A photo already on DisCamp can't be used for a cleanup.
- **Reports for cleanups**, with their own reasons, an email with the before photo and the lines to run, and `moderation.hide_task` / `restore_task`. Three reports hide a cleanup until reviewed. A ban takes down a camper's cleanups and sends back what they sent for review.

### Changed

- Location gets a fresh, high-accuracy fix (with how sure it is) for cleanup photos; the rest of the app is unchanged.
- The terms of use cover cleanups and Embers (no cash value, can't be bought, can be taken back for abuse); the privacy policy, App Store privacy answers and permission messages cover cleanup photos and locations. The terms version goes to 2, so campers agree again before their next post.
- The community-rules screen before a first post says "Before you post" (it's no longer only about spots).
- The map legend explains the orange cleanup pins.

## 1.5.1 (2026-10-14)

"Still good" changes, from testing 1.5.0. Run migration `0007_still_good_once.sql` along with this version: `bash scripts/setup-database.sh` runs just that file.

### Changed

- **"Still good" works once per spot every 30 days** for each camper (it was once a day). After a tap, the button is replaced by "You said it's still good…", so it can't be tapped twice by mistake.
- **"Something changed" takes it back.** Reporting a change after saying "Still good" withdraws that "Still good": it no longer counts toward the spot's confirmed date or toward confirming the spot, and the change shows as a warning. The report screen says so first. A taken-back "Still good" still counts toward the 30 days, so the two can't be flipped back and forth. Starter spots you confirmed yourself stay confirmed.
- Taken-back check-ins are left out of the spot's recent check-ins (their own camper still sees when they can confirm again).

### Added

- `scripts/setup-database.sh` loads or updates the Supabase database from Terminal: it runs each migration that hasn't run yet, all-or-nothing, then the starter spots, and reports what's there. README "Connect Supabase" now starts with it.

## 1.5.0 (2026-10-13)

Sprint 3: photos, "Still good?" check-ins and change reports, so campers can see what a spot looks like and whether it's still as described. Run migration `0006_photos_checkins.sql` along with this version (README "Photos" covers the Storage bucket it makes).

### Added

- **Photos.** Campers add up to 3 photos to a spot, from the camera or the photo library. Each photo is shrunk to 1,600 pixels and saved fresh as a JPEG before it's sent (about 300 KB), which strips its location, camera and time details. Tap a photo to see it full size; delete your own, or report or block someone else's. Photos go live right away; 3 reports hide one until you review it. A photo with reports waiting can't be deleted by its camper, and its file stays until you've reviewed it. If an upload fails, **Try again** sends the same photo without adding it twice.
- **Still good?** One tap on a spot's page says it's still as described. The spot shows when it was last confirmed, on its page, its map card and its list row. Two campers other than the one who added it saying "Still good" (since its last edit) mark it confirmed. The camper who added a spot can report changes but can't confirm it.
- **Something changed.** Report a washed-out road, a locked gate, trash or a closure, with an optional note. It shows as a warning on the spot, its map card and its list row until a camper says it's still good. Change reports never edit the spot itself.
- **Recent check-ins** on each spot, with names. Any other camper's check-in can be reported, then they can be blocked.
- **Reports for photos and check-ins**: their own reasons, an email for each with a link to the photo and the lines to run, and new moderator tools: `hide_photo`, `restore_photo`, `hide_checkin`, `restore_checkin`. The queue shows photos and check-ins too. A ban takes down a camper's photos and check-ins along with their spots.
- **Community rules on their own** (`/rules`): campers who haven't agreed yet see them before a first photo or check-in, and come straight back.

### Changed

- The community rules, terms of use and privacy policy cover photos and check-ins. Rule 3 asks campers to leave faces and license plates out of photos. The terms version stays 1: nothing campers agreed to changed in substance.
- iPhone asks for the camera only when a camper taps "Take a photo", and the library opens Apple's own picker. Android's microphone permission is removed (DisCamp never records sound). Android 9 and older keep the one storage permission their camera needs to save a photo. The privacy manifest and the App Store privacy answers list photos.
- Blocking a camper hides their photos and check-ins too.
- Each check-in counts as an on-site report, so a spot with check-ins can't be deleted by its camper (as with reports before).
- A banned camper sees "Your account can't post or report anything on DisCamp."
- Photo uploads get 90 seconds before giving up; everything else keeps 30.
- Storage only takes files named like a photo, in the camper's own folder, up to 25 a day.

### Fixed

- A test of signing out while spots were hidden for review could finish before the reload it started, which made the test suite flaky.

## 1.4.1 (2026-10-12)

Bug fixes from a review of the whole project. Run migration `0005_fixes.sql` along with this version.

### Fixed

**Saving, deleting and slow connections**

- Every request to the server now gives up on time. Before, a sign-in that needed renewing could keep "Saving…" or "Loading" spinning for a minute or more, and on Android a stalled connection could wait forever.
- Leaving "Add a spot" or "Edit" while it saves no longer jumps you to the spot afterwards (which could leave you on a screen with no tabs or way back), and the next new spot starts from a clean form instead of overwriting the one just saved.
- Leaving a spot page while it deletes no longer switches you to Explore.
- Trying a delete again after the first answer was lost says it's done, instead of "can't be deleted".
- Trying a save again after a lost answer, when that spot was your 20th of the day, finds the saved spot instead of saying you've hit the limit.
- A draft another camper left on a shared phone gets a new spot of its own, instead of changing theirs (or silently failing).
- "Add spot" or "Edit" no longer spins forever on "Loading your account" when the connection stalls.
- An edit link opened while spots are still loading shows a spinner, not "Spot not found".
- Signing out with no signal counts as signed out when the phone has forgotten the session.

**Spot details**

- Hookups can be "not reported", like every other detail. The form has a "None" choice; leaving all of them off means "not sure". Trailers and big rigs at a campground with unknown hookups now show their fee as unknown instead of the (often free) standard fee. Campground spots campers already added go back to "not reported", since the old form couldn't say "not sure".
- Trailers 40 ft and longer get the big-rig checks (suited to big rigs, room to turn around), as the spot form's "Big rigs (40 ft and up)" suggests.
- Switching My Rig to "Big rig" makes it at least 40 ft long.
- Smoky Gardens no longer claims "Big rigs: Yes"; no source says so.
- Fees typed with a decimal comma ("22,50") work.
- A long paste into GPS, "What's there" or "Rules" no longer wipes the whole saved draft; those fields have limits now.
- The map legend says "AWD is recommended", which is what makes a spot "tight".
- Distances just under 10 miles read "10 mi", not "10.0 mi", and "Under 0.1 mi" no longer has a capital U mid-sentence.

**Word filter**

- The app and the database now run exactly the same check on the same rules, so they never disagree. Stretched spellings ("shiiit") are caught everywhere, and real names that contain a blocked word are allowed: Cummings, Cummins, Fagan, Raper, Chinkapin, Assonet, Shiitake, Annalise, Rappel, and Rio, Cerro, Arroyo and Ojo Negro.
- `moderation.block_word` and `allow_phrase` read words the same way the filter does.

**Screens**

- On Android, the keyboard no longer covers the lower fields of the spot form, the report form and Account.
- On iPhone with Location Services off, "Show my location" says so, instead of sending you to DisCamp's settings, which can't fix it.
- Switching from List back to Map returns to where the map was.
- "Show all spots" no longer zooms all the way in when spots sit at almost the same place.
- A display name typed but not saved no longer carries over to the next camper who signs in on the phone.
- With very large text, the Explore header keeps "Add spot" and the help button on screen.

**Offline copy**

- Spots hidden for review come off the map as soon as their camper signs out, even with no signal.
- A local change (adding, deleting, blocking) no longer makes an old offline copy look "saved just now", and a time in the future never reads "just now".
- Unblocking a camper reloads the map even if a load was already on its way.

### For developers

- `src/lib/deadline.ts`: `withDeadline` (stops waiting, not just aborts) and a 30 s backstop fetch for the Supabase client.
- `src/lib/useStillHere.ts`: navigate after a wait only if the screen is still open.
- `src/components/KeyboardSafe.tsx`: Android keyboard padding (Android apps are edge to edge, so the window no longer resizes).
- Migration `0005_fixes.sql`: nullable hookups (with a one-time reset), `moderation.collapse_repeats`, the updated `normalize_text`, `block_word` and `allow_phrase`, and the new word rules. Safe to run twice, after 0004.
- `supabase/.temp/` (Supabase CLI files) is ignored by git.
- 455 tests (from 422) and 26 database tests (from 25).

## 1.4.0 (2026-10-08)

Ready for the App Store: moderation for camper-added content (App Review Guideline 1.2), legal pages, and release
settings. Master task list items B1, B2, B3, B5, B7, Q1, Q2 and Q4.

### Added

**Community rules and the word filter**

- Before their first spot, campers see the community rules and agree to the terms of use: real places only, no spam
  or fake spots, nothing offensive, zero tolerance for objectionable content and abusive campers, 13 or older. Campers
  from 1.3 are asked before their next spot or edit. If the terms change, everyone is asked again.
- A word filter keeps offensive words out of spot text and display names. It catches common disguises ("sh1t") and
  leaves place names alone ("Hooker Creek", "Shitake Flats", "bear scat").

**Report and block**

- Every spot page has **Something wrong?** with **Report this spot**. Spots campers added also have **Report the name**
  and **Block**.
- Reports ask what's wrong (offensive, spam, not a real spot, unsafe or private land, something else) with an optional
  note. Reports are private. Reporting the same thing twice just says it's already reported.
- When 3 different campers report a spot, it comes off the map until reviewed. 3 reports on a name reset it to
  "Camper". The camper who added a hidden spot still sees it, with a note explaining why.
- **Block** hides every spot from that camper for you, right away. After a report you're offered to block them too.
  **Account > Blocked campers** lists them, with **Unblock**.

**Help, legal and account deletion**

- **Account > Help and contact**: the support email (with Email us and Copy), and links to the support page, privacy
  policy and terms. Also on the sign-in screen, and when signed out.
- After deleting an account that used Sign in with Apple, the app explains how to remove DisCamp from the Apple
  Account, with Apple's help link.
- `docs/`: a privacy policy, terms of use and support page, ready to publish with GitHub Pages.
- `store/app-store-connect.md`: draft answers for App Privacy, the age rating and the App Review notes.
- `MODERATION.md`: setting up report emails, and the daily routine for acting within 24 hours.

**For you, the moderator**

- Every report emails you (new Supabase Edge Function `report-alert`, through Resend), with the exact SQL to act on it.
- `moderation.queue` lists open reports. `hide_spot`, `restore_spot`, `reset_name`, `dismiss_name`, `ban`, `unban`,
  `forget_ban` (for an account deleted after its ban), `find_camper`, `block_word` and `allow_phrase` do the rest,
  from the Supabase SQL Editor.

**Release settings**

- Crash reports through Sentry, when `EXPO_PUBLIC_SENTRY_DSN` is set: errors only, no tracing, screenshots or view
  trees, and every report scrubbed of emails, account ids, sign-in codes and tokens. Off in Expo Go.
- Over-the-air updates with `expo-updates` (on after `eas init`), with `preview` and `production` channels.
- iPhone privacy manifest: the reasons for the system features DisCamp's libraries use, and the data it collects.
- Only the permissions DisCamp uses: the iPhone asks for location while in use, and nothing else. The unused "always"
  location, motion and Face ID messages are gone, and Android no longer lists storage or overlay permissions.
- A production build stops if `EXPO_PUBLIC_SUPPORT_EMAIL` isn't set.

### Security

- New migration `0004_moderation.sql`:
  - Every spot add or edit checks the terms, the word filter (disguised spellings included) and bans in the database
    itself, so requests that don't come from the app are held to the same rules. Names from the sign-in provider pass
    the filter too.
  - Reports (`public.flags`) can be sent but never read from the app; one open report per camper per spot or name, up
    to 30 a day, never about yourself. Reports sent at the same moment all count.
  - A spot that's hidden or has open reports can't be deleted by its camper, so nothing leaves review early.
  - After the moderator restores a spot, the same campers can't hide it again; a reset name stays "Camper" until
    reviewed.
  - Bans hold if the camper deletes their account and comes back with the same email or sign-in (kept as one-way
    hashes).
  - Blocks are private to the camper who made them. Spots from blocked campers are filtered by the database.
  - Hidden spots are visible only to the camper who added them; only the moderator tools hide or restore.
  - Moderator tools live in a `moderation` schema the app can't reach.
- Account deletion also removes the camper's blocks and reports about their name; reports they sent stay without their
  id.
- Report emails keep what campers wrote on one line, apart from the SQL to run, so a note can't pose as an instruction.
- A server answer that started before a block, a new spot or a sign-in change is dropped and the spots load again, so
  blocked campers' spots can't flash back.

### For developers

- `test/fakeSupabase.ts` follows the moderation rules too: terms, bans, reports with auto-hide, blocks and hidden spots.
- 25 database tests (from 13), covering every moderation rule, the word filter and its list staying in step with the
  app, bans that survive account deletion, simultaneous reports, and the moderator tools.
- CI type-checks and lints the Edge Function with Deno.
- Each test may take up to 15 seconds (from 5), so a first run on a slow machine or a cold cache doesn't fail.
- 422 tests. Coverage 98% statements, 91% branches, 97% functions, 99% lines.
- New packages (Expo SDK 57 versions): `@sentry/react-native`, `expo-updates`; plus `obscenity` (word filter).

### Still to do before the App Store

- Fill in `docs/_config.yml`, publish the pages, and set `EXPO_PUBLIC_SUPPORT_EMAIL`.
- Run migration 0004, deploy `report-alert` and add its webhook (MODERATION.md).
- Switch on Sign in with Apple, then test on a real iPhone through TestFlight.
- Add one spot from a second account, so App Review can find Report the name and Block.
- Consider automatic Apple token revocation (master task list Q6) before the first submission: Apple says apps
  "should" revoke Sign in with Apple tokens on account deletion. 1.4 explains the manual step instead.

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
