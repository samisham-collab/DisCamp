# App Store Connect answers for DisCamp 1.4

Drafts for the forms in App Store Connect, written from what the code actually
does. Check each one against the app before you submit; if the app changes,
update these and the privacy policy together.

## URLs

| Field                    | Value                                                   |
| ------------------------ | ------------------------------------------------------- |
| Privacy Policy URL       | `https://<github user>.github.io/DisCamp/privacy/`      |
| Support URL              | `https://<github user>.github.io/DisCamp/support/`      |
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
| User Content > Photos or Videos     | Yes (photos campers add to spots)                             | Yes                 | No                 | App Functionality |
| User Content > Other User Content   | Yes (spots, check-ins and reports)                            | Yes                 | No                 | App Functionality |
| Location > Precise Location         | Yes (only when a camper places a spot with "Use my location") | Yes                 | No                 | App Functionality |
| Diagnostics > Crash Data            | Yes (Sentry)                                                  | No                  | No                 | App Functionality |
| Diagnostics > Other Diagnostic Data | Yes (Sentry error reports)                                    | No                  | No                 | App Functionality |

Not collected: phone number, physical address, payment info, contacts,
browsing or search history, purchases, usage data, advertising data,
health, financial info, sensitive info, coarse location (distances are worked
out on the phone).

If you don't set up Sentry (`EXPO_PUBLIC_SENTRY_DSN` empty), leave out the two
Diagnostics rows.

These match the privacy manifest in `app.json` (`ios.privacyManifests`).

## Age rating

Answer the questionnaire like this:

- User-generated content: **Yes**. (Campers post spots, photos, check-in notes
  and display names.
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
> first posts (a spot, a photo or a check-in), the app shows its community rules
> and asks them to agree. The camera is used only when "Take a photo" is tapped;
> photos are shrunk and stripped of location data before they're sent.
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
> Sign in with Apple, the app then explains how to remove DisCamp from the Apple
> Account.
>
> Donations aren't in this version.

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
- [ ] Supabase: migrations 0001–0006 and the seed run (0006 also makes the
      `spot-photos` Storage bucket), all four sign-ins on,
      the report-alert webhook working (send yourself a test report)
- [ ] A TestFlight build passes the test list on a real iPhone
- [ ] One spot added by a second account, for reviewers (see above)
- [ ] Decide on Apple token revocation: Apple says apps that offer Sign in with
      Apple "should" revoke a camper's tokens when they delete their account
      (TN3194). DisCamp 1.4 tells campers how to do it themselves; doing it
      automatically needs your Apple key and a server function (master task
      list Q6). Building it before the first submission lowers the risk of a
      rejection.
