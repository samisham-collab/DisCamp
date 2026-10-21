# Getting DisCamp onto TestFlight

Three parts: what you can set up while Apple reviews your developer account, what to do the day it's approved, and a test script for your iPhone once the build is on it. The README and MODERATION.md have the details for each step; this file is the order.

Costs: the Apple Developer Program ($99 a year) and, if you want Android too, a Google Play developer account ($25 once). Everything else here is free.

## Part 1: While you wait for Apple

None of these need the Apple account. The first six are what the TestFlight build needs; 7 and 8 are optional but start slow clocks.

1. **Update to 1.7.1.** In Terminal, from the DisCamp folder: `npm ci`. If you haven't run migration 0009 yet, run `bash scripts/setup-database.sh` (1.7.1 has no new migration).

2. **Bundle ID: done.** DisCamp is `com.samuelisham.discamp` in both stores (`ios.bundleIdentifier` and `android.package` in `app.json`). It can never change after the first upload, so use exactly this wherever a step asks for it (Firebase, Supabase's Apple provider, App Store Connect).

3. **Make a DisCamp support email.** It's public: it shows in the app, on the store listing and in the privacy policy. Use an address of your own (a new Gmail or iCloud address like `discamp.help@...` works), not your school district one: it outlives any job change and keeps campers' mail out of the district's systems. Then:
   - put it in `.env` as `EXPO_PUBLIC_SUPPORT_EMAIL`,
   - put it and your name at the top of `docs/_config.yml`.

4. **Publish the website.** Once `docs/_config.yml` has the support email, push, then on GitHub: your repo > **Settings > Pages** > Deploy from a branch: `main`, folder `/docs`. Done when `https://samisham-collab.github.io/DisCamp/` and its `support/`, `privacy/` and `terms/` pages open in a browser. (README, "Website and legal pages".)

5. **Keep Supabase awake.** If you haven't yet, unzip `discamp-keep-awake.zip` into the DisCamp folder (it adds `.github/workflows/`), commit and push. Add the two repository secrets `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (GitHub > repo > **Settings > Secrets and variables > Actions**), then **Actions > Keep Supabase awake > Run workflow**. Done when the run is green.

6. **Link the Expo project and set build variables.**
   - `npx eas-cli@latest login` (your expo.dev account), then `npx eas-cli@latest init`. It writes the project id into `app.json`, which turns on over-the-air updates and notifications. Commit that change.
   - On expo.dev: your project > **Environment variables**, add these for both **preview** and **production**:

     | Name                                   | Value                                                                              |
     | -------------------------------------- | ---------------------------------------------------------------------------------- |
     | `EXPO_PUBLIC_SUPABASE_URL`             | same as in `.env`                                                                  |
     | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same as in `.env`                                                                  |
     | `EXPO_PUBLIC_SUPPORT_EMAIL`            | the address from step 3                                                            |
     | `EXPO_PUBLIC_AUTH_PROVIDERS`           | the providers that are on in Supabase, for example `apple,google,microsoft,github` |

     A production build stops at the start if the first three are missing, so a missed one costs a minute, not a wasted build.

7. **Server functions.** MODERATION.md, "One-time setup", sections 2 and 3: a free Resend account and the `report-alert` function (an email for every report), then the `cleanup-push` function and its webhook (notifications). Done when reporting a spot from the app sends you an email.

8. **Google and Microsoft sign-in** in Supabase (README, "Sign-in"; about 10 minutes each). GitHub is already on. Apple waits for Part 2.

9. **Android, if you want it at launch.** Start now: Google's clock is the slow one.
   - Make a Google Play developer account at [play.google.com/console](https://play.google.com/console) ($25 once). Google verifies your identity first, which can take a few days.
   - New personal accounts must run a **closed test with at least 12 testers, opted in for 14 days in a row**, before the app can go public. Line up 12 people with Android phones (family, friends, campers) now, so the 14 days can run alongside TestFlight.
   - Make a Google Maps key and add it on expo.dev as `GOOGLE_MAPS_ANDROID_API_KEY` (README, "Build for TestFlight and Android"), and set up Firebase for Android notifications (same section). Use the bundle ID from step 2 as the Android package.
   - Then try it on an Android phone, no store needed: `npx eas-cli@latest build --profile preview --platform android` makes an APK you install from the link EAS gives you.

10. **Draft the store listing.** `store/app-store-connect.md` has the App Privacy answers, the age rating and the App Review notes. Write the description, subtitle (30 characters) and keywords (100 characters) now; take the screenshots from TestFlight later.

## Part 2: The day Apple says yes

1. **Accept the agreements.** Sign in to [App Store Connect](https://appstoreconnect.apple.com) and accept what it shows. Then **Business** (or **Agreements, Tax, and Banking**): accept the **Paid Apps** agreement and add bank and tax details. Tips need it, even in TestFlight, and it can take a day or more to go active.

2. **Create the app.** App Store Connect > **Apps > + > New App**: iOS, name "DisCamp" (it must be unused on the App Store; if it's taken, try something like "DisCamp: Dispersed Camping"), the bundle ID from Part 1 (pick "register a new bundle ID" if it isn't listed yet, or let the first EAS build register it and come back), and any SKU, such as `discamp`.

3. **Turn on Apple sign-in in Supabase.** **Authentication > Sign In / Providers > Apple**: Client IDs = your bundle ID, plus `host.exp.Exponent` for Expo Go. (README, "Sign-in".)

4. **Build:** `npx eas-cli@latest build --profile production --platform ios`. Sign in with your Apple ID when it asks, and let EAS handle the certificates and profiles. Say **yes** to "set up Push Notifications". It takes 15 to 40 minutes on Expo's servers.

5. **Upload:** `npx eas-cli@latest submit --platform ios --latest`. Apple processes it in 10 to 30 minutes and emails you. The encryption question is already answered in `app.json`.

6. **Install it.** App Store Connect > your app > **TestFlight > Internal Testing**: make a group and add yourself. Install the **TestFlight** app on your iPhone and accept the invite. Internal testers (up to 100 people on your App Store Connect team) need no review. Outside testers by email or public link need a short Beta App Review of the first build. A TestFlight build works for 90 days.

7. **Apple disconnect on account deletion.** README, "Sign-in" > "Before the App Store": the Sign in with Apple key and the `apple-revoke` secrets, including `APPLE_CLIENT_ID` = your bundle ID.

8. **Tips.** Create the three consumable products (`tip_small`, `tip_medium`, `tip_large`) in App Store Connect (README, "Tip jar"). In TestFlight, tips use Apple's test system and cost nothing.

Each new TestFlight build is steps 4 and 5 again; the build number goes up on its own. A JavaScript-only fix can skip both: `npx eas-cli@latest update --channel production --message "Fix ..."`.

## Part 3: Test script for your iPhone

Run it on the TestFlight build, top to bottom, the first time. Note anything off with a screenshot and send the list to Claude for a 1.7.x fix. Some steps need a second account: a second sign-in provider on the same phone works (sign out, sign in with another one).

### First launch, signed out

- [ ] Delete any old DisCamp first, then install from TestFlight. It opens to the map with no location question.
- [ ] Pins show across the US. Tap one: a summary card appears and the pin stays in view. Tap the card: the spot's page opens.
- [ ] On a spot's page: **Directions** opens Apple Maps, **Share** opens the share sheet, **Copy GPS** copies.
- [ ] **Route** on a spot's page: the route appears in blue, with any unpaved stretch in orange, plus miles and drive time. Change your rig to the Sedan preset and open it again: the note says it stays on paved roads. **Open in Apple Maps** opens the drive.
- [ ] **Drive mode** (best with someone else driving): on a route preview, tap **Start**. The header goes, the screen stays on, and DisCamp says the first step. Drive toward the turn: half a mile out it says "In half a mile, turn …", and again just before the turn. Pan the map: **Re-center** appears and brings the map back to you. Tap the speaker to mute, then turn the voice back on. Take a wrong turn on purpose: "Off route" shows and is said once; **Reroute** works out a new route from there. Try it with the Ring/Silent switch on silent and with music playing, and note whether you hear the voice. **End** (or **Done** on arrival) goes back to the route preview.
- [ ] **List**: sorted best fit first. Tap **Sort by distance**: iPhone asks for location "while using the app" only. Allow: the list is nearest first, and on the map **Show my location** centres on you with the nearest spots in view.
- [ ] **My Rig**: change the preset; the fit colors change. Turn on **Fits my rig**. Close DisCamp fully (swipe it away) and reopen: the rig, the filter and map/list are remembered.
- [ ] Airplane mode on, close and reopen: the last spots show with an offline banner. Airplane mode off, tap **Retry**.
- [ ] **Account**: the support email, privacy policy, terms and support page open; the tip jar shows.

### Signing in

- [ ] Each sign-in you've turned on works: Apple, Google, Microsoft, GitHub. Each returns to DisCamp, not a browser page.
- [ ] The first time you post anything, the community rules come first.
- [ ] Right after reopening DisCamp, signed in, tap **Add spot** straight away: it opens, or says "One moment". It never sends you to sign in.
- [ ] Sign out and back in.

### Adding and editing spots

- [ ] **Add spot**: tap **Go to my location** on the map; the map jumps to you. Drop the pin, fill in a few fields, save. The spot shows with "not yet confirmed".
- [ ] Start another spot, close DisCamp mid-way, reopen: the draft is still there.
- [ ] Edit your spot, change something, then go back without saving: it asks "Discard your changes?". **Keep editing** stays; save takes you back to the spot with the change.
- [ ] Add a photo from the camera and one from the library. Open it full size; delete one.
- [ ] Delete the test spot.

### With a second account

- [ ] **Still good** on a spot; then **Something changed**, which takes the "Still good" back.
- [ ] Report a spot and a photo. The report email reaches you.
- [ ] Block the camper who added a spot: their spots and cleanups disappear. Unblock under **Account**: they come back.

### Cleanups, Review and notifications

- [ ] Make yourself a moderator if you haven't (README, "Reviewing cleanups").
- [ ] Post a cleanup where you stand (camera only, no photo library).
- [ ] iPhone **Settings > DisCamp > Location**: turn **Precise Location** off. Back in DisCamp, posting says the location is approximate, with a **Settings** button, and **Post** waits. Turn it back on.
- [ ] As the second account: **I cleaned it up**, with the after photo and the haul shot. Allow notifications when DisCamp offers.
- [ ] As the moderator: **Account > Review cleanups**. Send it back with a reason: the keyboard doesn't cover the reason box, and the sender gets a notification with the reason. Tapping it opens the cleanup.
- [ ] Still on **Review cleanups**: the **Free plan** card shows photos and files, and the database, as "X MB of 1 GB" and "X MB of 500 MB". Pull down to refresh it.
- [ ] Add a photo to a spot, then look at the spot's photo strip: it loads quickly (the small preview). Tap it: the full photo opens. In Supabase **Storage > spot-photos**, the photo's folder has both `<id>.jpg` and `<id>.preview.jpg`.
- [ ] Pause by hand: in Supabase **Table Editor**, schema **moderation**, table **settings**, turn on `photos_paused`. Close and reopen DisCamp (it checks every 10 minutes): a spot's **Add a photo** shows "New photos are paused for now…", and trying anyway explains it. Check-ins still work. Turn it back off.
- [ ] Send it again and approve it: a notification arrives, and the Embers show on **Account**.
- [ ] Leave DisCamp in the background for 15 minutes or more, then open it: the lists are up to date.

### Tips and deleting an account

- [ ] **Account > Support DisCamp**: buy "Coffee at camp". Apple's sheet says it's a test purchase; DisCamp thanks you. Start another and cancel: nothing happens, no error.
- [ ] With a spare account that used **Sign in with Apple**: **Delete account**. Apple's sheet confirms it's you, and the account is gone. Then iPhone **Settings > [your name] > Sign-In & Security > Sign in with Apple**: DisCamp is no longer listed (once `apple-revoke` is set up).

### Accessibility and looks

- [ ] VoiceOver on: move through the map, list, a spot's page and Add spot. Every button says what it does; no icon is read on its own.
- [ ] Largest text size (**Settings > Accessibility > Display & Text Size > Larger Text**): nothing is cut off or overlapping.
- [ ] Dark mode: everything readable.

### An over-the-air update

- [ ] Make a small text change, run `npx eas-cli@latest update --channel production --message "Test update"`, then close and reopen DisCamp twice. The change shows without a new build. Put the text back the same way.

When everything here passes, the store listing and `store/app-store-connect.md` "Before each submission" are what's left before you submit for App Review.
