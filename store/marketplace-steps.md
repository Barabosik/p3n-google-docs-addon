# Publishing on the Google Workspace Marketplace

The clicks, in order, for publishing p3n as a public Editor add-on from a personal Google account. The values to type come from [listing.md](listing.md).

Who does each step:
- **[user]**: needs the publishing account's sign-in, accepting terms, or a decision only the user can make.
- **[lead]**: the GitHub side.
- **[us]**: prepared here, or done by a session once the user has signed in.

Checked against Google's docs in October 2026; the links are at the end.

## 0. Before starting

- **[user] Pick the publishing Google account.** One account should do all of the following:
  - verify `barabosik.github.io` in Search Console;
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

Google says any verified "top private domain" can be an authorized domain. `github.io` is a public suffix, so `barabosik.github.io` should qualify. But a [forum report from 13 October 2026](https://discuss.google.dev/t/google-oauth-domain-not-found-for-verified-github-pages-domain/404025) describes Branding answering "Domain not found" for exactly this setup: a `github.io` site verified in Search Console with the HTML file. Google's own docs don't settle it. If step 4 hits that error, the fallback is a custom domain the user owns, pointed at GitHub Pages and verified in Search Console as a Domain property through DNS. That costs a domain registration, so it's the user's call.

## 1. Repo and Pages: [lead]

1. Create the public repo `Barabosik/p3n-google-docs-addon` and push `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/docs` → Save**.
3. Check that these three load without signing in:
   - https://barabosik.github.io/p3n-google-docs-addon/
   - …/privacy.html
   - …/terms.html

## 2. Search Console: [lead] puts the file, [user] signs in

1. [user] Go to https://search.google.com/search-console with the publishing account. **Add property → URL prefix → `https://barabosik.github.io/` → Continue**.
2. Pick **HTML file** and download `google<code>.html`.
3. [user or lead] Commit that file, unchanged, to the root of `Barabosik/Barabosik.github.io` (GitHub's **Add file → Upload files** will do). Wait until `https://barabosik.github.io/google<code>.html` loads.
4. [user] Click **Verify**. Keep the file in that repo for good: removing it unverifies the domain.

## 3. Google Cloud project: [user]

1. Go to https://console.cloud.google.com with the publishing account and accept the Cloud terms if asked.
2. **Select a project → New project**. Name it `p3n`, since Google shows the project name in authorization prompts. Create it.
3. Note the **Project number**: **⋮ (More) → Project settings**.

A published add-on needs its own standard Cloud project. The default project Apps Script makes can't be published, and two published apps can't share a project.

## 4. OAuth consent screen (Google Auth Platform): [user], with the values from listing.md

1. **Menu → Google Auth Platform → Branding → Get started**:
   - App information: App name `p3n`, User support email.
   - Audience: **External**. Internal and Testing get the listing rejected.
   - Contact information: an email address.
   - Finish: tick the Google API Services User Data Policy box → **Create**.
2. **Branding**: add the application home page, privacy policy and terms of service links. Under **Authorized domains**, add `barabosik.github.io`. Fill in the developer contact. Skip the logo unless the user wants it, since a logo means Google checks the branding first. **Save**.
3. **Data Access → Add or remove scopes → Manually add scopes**: paste both scope URLs from listing.md → **Add to table → Update → Save**. Note whether the table marks them sensitive. Community reports say Google treats `script.container.ui` as sensitive.
4. **Audience → Publish app → Confirm**. The status becomes In production.

## 5. Standalone script: [us], after [user] signs in to clasp

An Editor add-on is published from a standalone Apps Script project, not one bound to a document.

1. [user] If clasp is logged in to another account: `npx clasp logout`, then `npx clasp login`, and pick the publishing account. The Apps Script API must be on for it: https://script.google.com/home/usersettings.
2. [us or user] `node dev/standalone.mjs`. It keeps a bound test project's `.clasp.json` as `.clasp.test.json`, creates the standalone project "p3n", restores the manifest that clasp overwrites, pushes `src/`, and prints the project's URL.
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

Later updates: **Manage deployments → ✎ the active deployment → Version: New version → Deploy**, then enter the new version number in the SDK's App Configuration. Don't make a new deployment for an update.

## 8. Marketplace SDK: [user] clicks, values from listing.md

1. **APIs & Services → Library**: search "Google Workspace Marketplace SDK" (the SDK, not the API) → **Enable**.
2. **Marketplace SDK → App Configuration**:
   - App visibility: **Public**. This can't be changed later.
   - Installation: **Individual + Admin install**.
   - App integration: **Editor add-on → Docs**, with the Script ID and version number.
   - OAuth scopes: the same two scopes.
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

- Put the Marketplace link on the homepage (`docs/index.html`, replacing "coming soon") and in the README.
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
