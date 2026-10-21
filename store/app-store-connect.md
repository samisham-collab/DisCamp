# App Store Connect answers for DisCamp 1.7

Drafts for the forms in App Store Connect, written from what the code actually
does. Check each one against the app before you submit; if the app changes,
update these and the privacy policy together.

## URLs

| Field                    | Value                                                   |
| ------------------------ | ------------------------------------------------------- |
| Privacy Policy URL       | `https://samisham-collab.github.io/DisCamp/privacy/`    |
| Support URL              | `https://samisham-collab.github.io/DisCamp/support/`    |
| Marketing URL            | `https://samisham-collab.github.io/DisCamp/`            |
| User Privacy Choices URL | Leave empty (no opt-outs to offer: no ads, no tracking) |

These are the pages in `docs/`, published with GitHub Pages (see README). The
app links to the same pages; set `EXPO_PUBLIC_LEGAL_BASE_URL` if you host them
elsewhere.

## App Privacy

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking:** DisCamp does not track. Answer "No" to using data for tracking for
every type below, and the app needs no App Tracking Transparency prompt.

| Data type                           | Collected?                                                    | Linked to the user? | Used for tracking? | Purposes          |
| ----------------------------------- | ------------------------------------------------------------- | ------------------- | ------------------ | ----------------- |
| Contact Info > Email Address        | Yes                                                           | Yes                 | No                 | App Functionality |
| Contact Info > Name                 | Yes (the display name)                                        | Yes                 | No                 | App Functionality |
| Identifiers > User ID               | Yes (account ID)                                              | Yes                 | No                 | App Functionality |
| User Content > Photos or Videos     | Yes (photos of spots and cleanups)                            | Yes                 | No                 | App Functionality |
| User Content > Other User Content   | Yes (spots, check-ins, cleanups and reports)                  | Yes                 | No                 | App Functionality |
| Location > Precise Location         | Yes (placing a spot, cleanups, route previews and Drive mode) | Yes                 | No                 | App Functionality |
| Diagnostics > Crash Data            | Yes (Sentry)                                                  | No                  | No                 | App Functionality |
| Diagnostics > Other Diagnostic Data | Yes (Sentry error reports)                                    | No                  | No                 | App Functionality |

Not collected: phone number, physical address, payment info, contacts,
browsing or search history, purchases, usage data, advertising data,
health, financial info, sensitive info, coarse location (distances are worked
out on the phone).

Tips (in-app purchases) are handled by Apple, and DisCamp keeps no record of
them, so **Purchases** stays "not collected". Push addresses for notifications
aren't a data type Apple asks about; the privacy policy covers them.

If you don't set up Sentry (`EXPO_PUBLIC_SENTRY_DSN` empty), leave out the two
Diagnostics rows.

These match the privacy manifest in `app.json` (`ios.privacyManifests`).

## Age rating

Answer the questionnaire like this:

- User-generated content: **Yes**. (Campers post spots, photos, check-in notes,
  cleanups and display names.
  DisCamp has terms, a word filter, reporting, blocking and 24-hour review; see
  MODERATION.md.)
- Messaging or chat between users: **No**.
- Advertising: **No**.
- Unrestricted web access: **No**. (Links open in the browser; there's no
  in-app web browsing.)
- Gambling, contests, loot boxes: **No**.
- Violence, sexual content or nudity, profanity, horror, mature themes, drugs,
  alcohol, tobacco, medical or wellness topics: **None**.

DisCamp's terms require campers to be 13 or older. If App Store Connect lets you
choose a higher rating than it calculates, pick 13+ so the two agree.

## App Review notes

Paste into **App Review Information > Notes** and fill in the brackets:

> DisCamp is a free map of dispersed campsites. Browsing needs no account.
>
> To test camper features, sign in from the Account tab with Sign in with Apple
> (your own Apple Account works; no demo account is needed). Before a camper
> first posts (a spot, a photo, a check-in or a cleanup), the app shows its
> community rules and asks them to agree. The camera is used only when "Take a
> photo" (or a cleanup's photo button) is tapped; photos are shrunk and stripped
> of location data before they're sent. Cleanups (the Cleanups tab) use the
> camper's location to pin the cleanup and check the after photo was taken
> there. Embers are points with no cash value; they can't be bought.
> To report a cleanup, open it and tap "Report this cleanup".
>
> User-generated content (Guideline 1.2):
>
> - Terms: shown and agreed to before posting (Explore > Add spot). Full terms:
>   [terms URL]
> - Filter: offensive words are blocked in spot text, check-in notes and display
>   names, in the app and again on the server.
> - Report: on any spot's page, scroll to "Something wrong?" > "Report this spot"
>   or "Report the name". To report a photo, tap it under Photos > Report.
> - Block: on a spot added by another camper (for example "[demo spot name]"),
>   "Block [name]" hides their spots and photos; tapping their photo also
>   offers Block.
>   Blocked campers are listed under Account > Blocked campers.
> - Every report emails the developer, who reviews it within 24 hours. Three
>   reports hide a spot or photo automatically until reviewed.
> - Contact: Account > Help and contact, or [support email].
>
> Account deletion (5.1.1(v)): Account > Delete account. For accounts that used
> Sign in with Apple, Apple's sheet confirms it's the camper, and DisCamp
> revokes its Sign in with Apple tokens before deleting the account.
>
> Tips: Account > Support DisCamp offers three consumable in-app purchases
> (tip_small, tip_medium, tip_large). They are tips only: they unlock no
> content, features or status, and the app works the same without them.
>
> Notifications are optional and asked for only after a camper sends a cleanup
> (or from Account > Notifications). They tell campers when their cleanup is
> reviewed; nothing is marketing.

## Give reviewers something to report

App Review checks that Report and Block work. Starter spots have no camper
behind them, so they only show **Report this spot**. Before submitting, sign in
with a second account (say, GitHub) and add one real spot with a photo, so
reviewers can also find **Report the name**, a photo to report, and **Block**.
Mention its name in the notes.

## Before each submission

- [ ] `EXPO_PUBLIC_SUPPORT_EMAIL` set on expo.dev for production (the build
      stops without it)
- [ ] `docs/_config.yml` filled in and the pages published
- [ ] Supabase: migrations 0001–0009 and the seed run
      (`bash scripts/setup-database.sh`; 0006 also makes the `spot-photos`
      Storage bucket), all four sign-ins on,
      the report-alert and cleanup-push webhooks working (send yourself a
      test report and a test cleanup)
- [ ] A TestFlight build passes the test list on a real iPhone
- [ ] Route previews: FOSSGIS has OK'd DisCamp using their public Valhalla
      server (webmaster@openstreetmap.de), or `EXPO_PUBLIC_ROUTING_URL` points
      at another Valhalla server (or is `off`)
- [ ] One spot added by a second account, for reviewers (see above)
- [ ] Apple token revocation working: the `apple-revoke` function deployed
      with its three Apple secrets (README, "Before the App Store"). Test it:
      delete a test account made with Apple on an iPhone; the app should say
      "DisCamp is disconnected from your Apple ID too."
- [ ] The three tip products created in App Store Connect (Monetization >
      In-App Purchases), each with a review screenshot, and attached to this
      version. The Paid Apps agreement needs to be active first.
- [ ] Notifications set up: `eas init` done, the push key made on the first
      iOS build, `google-services.json` for Android (README)
