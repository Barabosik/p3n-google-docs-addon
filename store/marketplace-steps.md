# Publishing on the Google Workspace Marketplace

The clicks, in order, for publishing p3n as a public Editor add-on from a personal Google account. The values to type come from [listing.md](listing.md).

Who does each step:
- **[user]**: needs the publishing account's sign-in, accepting terms, or a decision only the user can make.
- **[lead]**: the GitHub side.
- **[us]**: prepared here, or done by a session once the user has signed in.

Checked against Google's docs in October 2026; the links are at the end.

**Status, 2026-10-20:**
- Steps 1–6 are done. The Search Console domain is verified, the Cloud project exists, the consent screen is In production, and the standalone project is linked and test-deployed. The demo video is recorded, and the screenshots are in `store/`.
- The demo video is on YouTube, Unlisted. Its link is in the team's notes, not here, because the video shows the publishing account. Next: steps 7–10. Decided: Public, non-trader, no reviewer key.
- Step 7, 2026-10-21: script **version 2** (`v0.1.1`, release build of `128d15e`, the audit fixes) is on the same deployment as version 1 (`v0.1.0`), which stays. The fixes don't change the views in the demo video or the screenshots.
- 2026-10-21: script **version 3** (`v0.1.2`, release build of `4f5c672`: every API call sends `X-P3N-Client: p3n-gdocs/0.1.2`) is on the same deployment. Versions 1 and 2 stay. The SDK's script version field is **3**.
- 2026-10-21: the site moved to the user's domain, `nikita-andreiev.com`, because the branding check rejected the github.io homepage. The old github.io URLs 301-redirect there. OAuth branding (step 4) and the listing's links (step 8) take the new URLs, then re-verification.
- Project numbers, IDs and the client ID stay out of this repo.

## 0. Before starting

- **[user] Pick the publishing Google account.** One account should do all of the following:
  - verify `nikita-andreiev.com` in Search Console (a Domain property, through DNS);
  - own the Cloud project;
  - have edit access to the standalone script.

  A personal @gmail.com account works, but its apps can only be Public.
- **[user] Decide the trader status** for the EEA: declared as a trader or not, as the Digital Services Act requires.
- **[user] Decide whether to give reviewers a test API key** with a small balance. Reviewers may share an IP and hit the free limit of 10 calls an hour.
- **[lead] Look at the review risks** below before submitting.

### Review risks

Google's [app review checklist](https://developers.google.com/workspace/marketplace/about-app-review) for Editor add-ons includes these lines, quoted, and this is how p3n answers them:

| Checklist item | p3n |
| --- | --- |
| "follows the UI style guide for editor add-ons and uses the CSS package for editor add-ons" | The sidebar loads Google's `add-ons1.css` first. p3n adds only its logo, wordmark, score colours and motion. |
| "only uses one blue primary action per display" | Exactly one blue button per view: Check for AI before a result, Replace selection after a rewrite (Sign up or Top up on those errors). The e2e tests check it. |
| "requires confirmation or displays warnings for all sensitive actions" (it adds that "you can avoid this requirement through design changes") | No confirm dialog, by design. The click on a button that says Replace selection is the consent, one Ctrl+Z undoes it, and the sidebar says so right after. This is explained in the reviewer notes. |
| "Content width doesn't extend beyond 300p", one dialog at a time, buttons disabled while loading, links open in new windows, menu from `onInstall`/`onOpen`, V8 runtime | Met. |

The third row is the one a reviewer could still question. If they do, the answer is in the reviewer notes; a confirm step is the fallback.

### Domain risk

**Settled 2026-10-21: a domain the user owns.** The site is at `nikita-andreiev.com`, the custom domain of `Barabosik.github.io`. The Docs pages are served at `https://nikita-andreiev.com/p3n-google-docs-addon/`, and the old github.io URLs 301-redirect there. Google accepted `barabosik.github.io` as an authorized domain on 2026-10-20, but its branding check then rejected the github.io homepage: its rules want a domain the developer owns.

The history: Google says any verified "top private domain" can be an authorized domain. `github.io` is a public suffix, so `barabosik.github.io` should qualify. But a [forum report from 13 October 2026](https://discuss.google.dev/t/google-oauth-domain-not-found-for-verified-github-pages-domain/404025) describes Branding answering "Domain not found" for exactly this setup: a `github.io` site verified in Search Console with the HTML file. Google's own docs don't settle it. Google accepted `barabosik.github.io` on 2026-10-20, but the branding check failed on 2026-10-21, so the fallback was used: a custom domain the user owns, pointed at GitHub Pages and verified in Search Console as a Domain property through DNS.

## 1. Repo and Pages: [lead]

1. Create the public repo `Barabosik/p3n-google-docs-addon` and push `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/docs` → Save**.
3. The custom domain is set on the user-site repo `Barabosik/Barabosik.github.io` (**Settings → Pages → Custom domain** `nikita-andreiev.com`, then **Enforce HTTPS** once the certificate is issued). Project sites like this one follow it.
4. Check that these three load over HTTPS without signing in:
   - https://nikita-andreiev.com/p3n-google-docs-addon/
   - …/privacy.html
   - …/terms.html

## 2. Search Console: [lead] adds the DNS record, [user] signs in

1. [user] Go to https://search.google.com/search-console with the publishing account. **Add property → Domain → `nikita-andreiev.com` → Continue**.
2. [lead] Add the `TXT` record Google shows (`google-site-verification=…`) at the domain's DNS provider. Wait until `nslookup -type=TXT nikita-andreiev.com` shows it.
3. [user] Click **Verify**. Keep the record for good: removing it unverifies the domain.

Before the custom domain (2026-10-20), `https://barabosik.github.io/` was verified as a URL-prefix property with an HTML file in `Barabosik/Barabosik.github.io`. That file stays, but the authorized domain is now `nikita-andreiev.com`.

## 3. Google Cloud project: [user]

1. Go to https://console.cloud.google.com with the publishing account and accept the Cloud terms if asked.
2. **Select a project → New project**. Name it `p3n docs add-on`. A Cloud project name needs at least 4 characters, so plain `p3n` won't do; the app name users see comes from the consent screen and stays `p3n`. Create it.
3. Note the **Project number**: **⋮ (More) → Project settings**.

A published add-on needs its own standard Cloud project. The default project Apps Script makes can't be published, and two published apps can't share a project.

## 4. OAuth consent screen (Google Auth Platform): [user], with the values from listing.md

1. **Menu → Google Auth Platform → Branding → Get started**:
   - App information: App name `p3n`, User support email.
   - Audience: **External**. Internal and Testing get the listing rejected.
   - Contact information: an email address.
   - Finish: tick the Google API Services User Data Policy box → **Create**.
2. **Branding**: add the application home page, privacy policy and terms of service links. Under **Authorized domains**, add `nikita-andreiev.com`. Fill in the developer contact. Skip the logo unless the user wants it, since a logo means Google checks the branding first. **Save**.
3. **Data Access → Add or remove scopes → Manually add scopes**: paste the four scope URLs from listing.md → **Add to table → Update → Save**. They must be identical to the manifest's and the SDK's. The table marks `script.container.ui` as **sensitive** and `documents.currentonly` as non-sensitive, so step 9 needs the demo video.
4. **Audience → Publish app → Confirm**. The status becomes In production.

## 5. Standalone script: [us], after [user] signs in to clasp

An Editor add-on is published from a standalone Apps Script project, not one bound to a document.

1. [user] If clasp is logged in to another account: `npx clasp logout`, then `npx clasp login`, and pick the publishing account. The Apps Script API must be on for it: https://script.google.com/home/usersettings.
2. [us or user] `node dev/standalone.mjs`. It keeps a bound test project's `.clasp.json` as `.clasp.test.json`, creates the standalone project "p3n", restores the manifest that clasp overwrites, pushes `src/` without the dev-only `src/dev.js` (so no mock mode and no Mock API badge), and prints the project's URL.
3. [user] Open the project (the printed URL) and go to **Project Settings → Google Cloud Platform (GCP) Project → Change project**. Enter the project number from step 3 → **Set project**. This can't be undone.

## 6. Test deployment: [user], in a window signed in to the publishing account only

The demo video and screenshots need the user's screen, so steps 2–6 are one sitting for the user.

1. In the editor: **Deploy → Test deployments → Editor add-on → Create new test**:
   - Version: Latest code.
   - Config: Installed and enabled.
   - Test document: any test document.
   - **Save test**, then **Execute**.
2. Check the following:
   - the menu is named **p3n**;
   - the consent screen shows **p3n**;
   - Check, Rewrite, Replace and Undo work;
   - the four edge cases still open in CONTRIBUTING.md (soft line break, table cell, picture, second tab).
3. Take screenshots of the Docs window during this run (`python dev/store-shots.py` fits them onto 1280×800), and record the demo video (listing.md).

## 7. Versioned deployment: [us] or [user]

**Deploy → New deployment → ⚙ next to Select type → Add-on**. Description: `0.1.0` → **Deploy**. Then **Deploy → Manage deployments**: note the **version number**. Also note the **Script ID** from **Project Settings → IDs**. Neither is committed: the Script ID goes in the Marketplace SDK, nowhere else.

Later updates: bump `VERSION` in `src/api.html` and `version` in `package.json` (`npm test` checks they match), `npm run push` (never `push:dev`, which adds mock mode), then **Manage deployments → ✎ the active deployment → Version: New version → Deploy**, then enter the new version number in the SDK's App Configuration. Don't make a new deployment for an update.

## 8. Marketplace SDK: [user] clicks, values from listing.md

1. **APIs & Services → Library**: search "Google Workspace Marketplace SDK" (the SDK, not the API) → **Enable**.
2. **Marketplace SDK → App Configuration**:
   - App visibility: **Public**. This can't be changed later.
   - Installation: **Individual + Admin install**.
   - App integration: **Editor add-on → Docs**, with the Script ID and version number.
   - OAuth scopes: the same four as the manifest and Data Access. The form adds `userinfo.email` and `userinfo.profile` by default, and the other two go after them.
   - Developer information and trader status.

   **Save draft**.
3. **Store Listing**:
   - name, descriptions and category;
   - icons, card banner and screenshots;
   - terms, privacy and support links, plus help and report-issue links.

   **Save draft**.

## 9. OAuth verification: [user]

1. **Google Auth Platform → Verification center**. If a logo was added, verify and publish the branding first. Then start **Prepare for verification** for the scopes.
2. Paste the scope justifications from listing.md, and the demo video's YouTube link (Unlisted).
3. Answer Google's emails; they come to the developer contact. Branding checks take minutes to a few business days, and sensitive-scope review typically 3–5 business days.

Until it's verified, users see "Google hasn't verified this app", and at most 100 new users can authorize the app.

## 10. Submit: [user]

**Store Listing → Submit for review**. Google won't approve the listing until OAuth verification is complete. Review takes several days, and the result comes by email. There's no listing fee.

## 11. After approval: [us]

- Only now put the Marketplace link on the homepage (`docs/index.html`) and in the README. Never before approval: Google says links to an unapproved listing, unclickable links and "coming soon" text delay the OAuth review (rejection email, 2026-10-21).
- Tag the release in git (`v0.1.0`).

## Sources

- Editor add-ons are standalone projects: https://developers.google.com/workspace/add-ons/how-tos/building-editor-addons
- Deployments and versions: https://developers.google.com/apps-script/concepts/deployments, https://developers.google.com/workspace/add-ons/how-tos/update-published-add-on
- Standard Cloud projects: https://developers.google.com/apps-script/guides/cloud-platform-projects
- Consent screen and authorized domains: https://developers.google.com/workspace/guides/configure-oauth-consent, https://support.google.com/cloud/answer/10311615
- Sensitive-scope verification and the 100-user cap: https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification, https://support.google.com/cloud/answer/7454865
- Marketplace SDK and listing: https://developers.google.com/workspace/marketplace/enable-configure-sdk, https://developers.google.com/workspace/marketplace/create-listing
- App review: https://developers.google.com/workspace/marketplace/about-app-review
- Branding (trademarks): https://developers.google.com/workspace/marketplace/terms/branding
- No listing fee: https://developers.google.com/workspace/marketplace/overview
