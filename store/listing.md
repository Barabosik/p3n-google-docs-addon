# Marketplace listing

What goes into the Google Workspace Marketplace SDK and the OAuth consent screen (Google Auth Platform). The steps are in [marketplace-steps.md](marketplace-steps.md).

Google's rules that shape this copy:
- The app name may not contain Google's trademarks, and it must match the OAuth consent screen's app name. So the name is **p3n**, and "Google Docs™" appears only in the descriptions.
- The name has a 50-character limit, the short description 200 characters, and the detailed description 16,000.

## Store listing

| Field | Value |
| --- | --- |
| Application name | `p3n` |
| Category | Productivity › Office applications |
| Language | English |
| Application icon 128×128 | `dev/icons/128.png` |
| Application icon 32×32 | `dev/icons/32.png` |
| Application icon 48×48 | `dev/icons/48.png` (96×96 left empty) |
| Card banner 220×140 | `store/card-banner-220x140.png` (`python dev/banner.py`) |
| Screenshots | `store/screenshot-1.png` (Check) and `store/screenshot-2.png` (a rewrite with Replace selection), 1280×800. Both come from the live test deployment on 2026-10-20, with the account picture painted out. Shot 2 was recaptured after the headline fix. |
| Terms of service | https://barabosik.github.io/p3n-google-docs-addon/terms.html |
| Privacy policy | https://barabosik.github.io/p3n-google-docs-addon/privacy.html |
| Support | https://github.com/Barabosik/p3n-google-docs-addon/issues |
| Help (Editor add-ons) | https://barabosik.github.io/p3n-google-docs-addon/ |
| Report issue (Editor add-ons) | https://github.com/Barabosik/p3n-google-docs-addon/issues |
| Post Install Tip (required) | In a Google Docs document, select some text, then open Extensions → p3n → Open p3n. |
| Pricing | Free of charge with paid features: the add-on is free, and more than 10 calls an hour takes a paid p3n API key. |

Short description (146 characters):

```
Check selected text for signs of AI writing, and rewrite it so it reads as human. Replace puts the rewrite back in your document, formatting kept.
```

Detailed description:

```
Select text in a Google Docs™ document, then open Extensions → p3n.

Check for AI: a score, a one-line reason, and the sentences that read as AI-written.

Rewrite: a new version that keeps your facts and drops the filler. Replace selection puts it where your text was. Headings, list items and formatting stay, and one Ctrl+Z in the document undoes it.

You can also paste any text into the sidebar.

Free to try: without an account you get 10 checks or rewrites an hour, up to 5,000 characters each. For more, create an API key at p3n.si and paste it into the sidebar.

Privacy: the add-on can open only the document you use it in. It sends the text you chose to api.p3n.si only when you click Check for AI or Rewrite. It keeps no history, has no analytics and stores nothing in your document. Details: https://barabosik.github.io/p3n-google-docs-addon/privacy.html

A score is a probability, not proof. Read a rewrite before you keep it.

Open source (MIT): https://github.com/Barabosik/p3n-google-docs-addon

Google Docs is a trademark of Google LLC.
```

## App configuration

| Field | Value |
| --- | --- |
| App visibility | **Public** (decided 2026-10-20). It can't be changed after saving, and a personal (@gmail.com) account can only publish publicly anyway. |
| Installation settings | Individual + Admin install |
| App integration | Editor add-on → Docs add-on: the standalone script's **Script ID** (Apps Script → Project Settings → IDs) and the deployment's **version number** (Deploy → Manage deployments) |
| OAuth scopes | `https://www.googleapis.com/auth/documents.currentonly`, `https://www.googleapis.com/auth/script.container.ui`. They must match `src/appsscript.json` and the consent screen's Data Access list exactly. The SDK form pre-fills `https://www.googleapis.com/auth/userinfo.email` and `https://www.googleapis.com/auth/userinfo.profile`: delete those two rows. The add-on never uses them, the consent screen doesn't list them, and the privacy policy says it doesn't read your name or email address, so keeping them is a mismatch a reviewer can flag. |
| Developer name | Nikita Andreiev |
| Developer website | https://barabosik.github.io/p3n-google-docs-addon/ |
| Developer email | The publishing account's address (decided 2026-10-20; kept out of this repo). Google doesn't show it on the listing. |
| Trader status | **Non-trader** (decided 2026-10-20, as on the Chrome Web Store). EU law (the Digital Services Act) requires this declaration for the EEA, and a non-trader gives no mailing address. |
| Application website URL | https://barabosik.github.io/p3n-google-docs-addon/ (optional) |

## OAuth consent screen (Google Auth Platform)

| Field | Value |
| --- | --- |
| App name | `p3n` |
| User support email | The publishing account, or a group it manages |
| App logo | Optional (`dev/icons/128.png`). A logo makes Google verify the branding, which can add days. |
| Application home page | https://barabosik.github.io/p3n-google-docs-addon/ |
| Privacy policy | https://barabosik.github.io/p3n-google-docs-addon/privacy.html |
| Terms of service | https://barabosik.github.io/p3n-google-docs-addon/terms.html |
| Authorized domain | `barabosik.github.io` (verified in Search Console by the same account; Google accepted it on 2026-10-20) |
| Audience | External, In production |
| Developer contact | The publishing account's email |

Scope justifications (Verification center):

- `documents.currentonly`: "p3n reads the text the user has selected in the open document so it can check it for AI writing or rewrite it. When the user clicks Replace selection, it writes the rewrite in place of that selection. It needs no access to any other document, which is why it uses this scope and not documents."
- `script.container.ui`: "p3n adds its items to the Extensions menu and shows its results in a sidebar inside Google Docs."

Data Access lists `script.container.ui` as **sensitive** and `documents.currentonly` as non-sensitive (2026-10-20). So the app needs sensitive-scope verification, with the demo video below.

## Demo video (for OAuth verification)

**Recorded 2026-10-20** (3:49, unedited), with the standalone project linked to the Cloud project. Its Unlisted YouTube link goes in the Verification center. The plan it followed: YouTube, **Unlisted**, English UI, recorded with the standalone project linked to the Cloud project:

1. Open a test document and install the add-on from the test deployment.
2. Pick **Extensions → p3n → Open p3n** while signed out of the grant, so the consent screen appears. Show the app name **p3n**, then click into the address bar so the OAuth client ID (`client_id=…`) is visible. Show both scopes and **Allow**.
3. `script.container.ui`: show the Extensions menu items and the sidebar opening.
4. `documents.currentonly`: select a paragraph, click **Rewrite**, then **Replace selection**. Show the text change in the document and Ctrl+Z bringing it back. Then **Check for AI** on a selection.
5. End on the homepage and privacy policy URLs.

## Notes for Google's reviewers

```
No account is needed to test. Open any document, select a paragraph, then Extensions → p3n → Check selection for AI (or Rewrite selection). The sidebar opens with the result. After a rewrite, "Replace selection" writes it in place of the selected text, and Ctrl+Z in the document undoes it.

Replace selection has no confirm dialog, by design. Nothing in the document changes until the user clicks a button that says exactly what it does, Replace selection, which is the sidebar's one blue action at that point; that click is the consent. The rewrite is shown in full above the button before the click. Afterwards the sidebar says "Replaced in the document and selected there. Ctrl+Z in the document undoes it.", and one Ctrl+Z restores the original text and formatting. The add-on never writes to the document in any other way. It refuses to write over tables (text inside a table cell included), pictures, equations, footnotes or smart chips, and refuses if the selection changed since the rewrite.

Calls without an API key are free: 10 an hour per IP address, up to 5,000 characters each. If several reviewers share one IP and hit the limit, the sidebar says so.

The add-on calls only https://api.p3n.si, from the sidebar in the user's browser, and only when the user clicks. It reads only the selection in the open document (documents.currentonly).

Known Google limitation: with several Google accounts signed in, Apps Script add-ons can't reach the document unless it belongs to the browser's default account. Please test in a window signed in to one account.

Source: https://github.com/Barabosik/p3n-google-docs-addon
```
