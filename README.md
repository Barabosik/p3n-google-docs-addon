# p3n for Google Docs

Select text in a Google Doc and see whether it reads as AI-written. Or rewrite it so it doesn't, and put the rewrite back in place of your selection, formatting kept. It uses the [p3n API](https://p3n.si/docs): the same Check and Rewrite skills as p3n.si, the browser extension and the Word add-in.

![Check for AI, in Google Docs](docs/docs-check.png) ![Rewrite, in Google Docs](docs/docs-rewrite.png)

*In Google Docs, mock API (nothing sent to p3n). Text typed in the box gets Copy; text taken from the document also gets Replace selection, shown here in the local harness (`dev/harness.mjs`): the real sidebar next to a stand-in document.*

![Rewrite, then Replace selection](docs/harness-rewrite.png)

Version 0.1.0. Not on the Google Workspace Marketplace yet; install it as a test deployment (below).

## Use

- Select text in the document, then **Extensions → p3n → Check selection for AI** or **Rewrite selection**. The sidebar opens and runs it.
- Or **Extensions → p3n → Open p3n** and use the buttons. With the sidebar open, select other text and click **Check for AI** or **Rewrite** again: they always take the current selection while the box shows text from the document. Text you type or paste in the box is used as it is.
- After a rewrite, **Replace selection** puts it in place of the selected text and selects it. Ctrl+Z (Cmd+Z on a Mac) in the document undoes it. **Copy** is there too; where the browser doesn't give the sidebar the clipboard, it selects the rewrite and says to press Ctrl+C.
- Docs' own right-click menu can't be extended by add-ons (and the browser extension's menu doesn't show in Docs either), so the entry points are the Extensions menu and the sidebar.

## Editor add-on, not a Workspace add-on

Google has two kinds of add-on for Docs ([add-on types](https://developers.google.com/workspace/add-ons/concepts/types)). This is an **Editor add-on**, because:

- **The selection.** An Editor add-on runs inside the open document, so `DocumentApp.getActiveDocument().getSelection()` gives the selected range with its offsets; Google's own [translate-the-selection quickstart](https://developers.google.com/workspace/add-ons/editors/docs/quickstart/translate) is an Editor add-on. A Workspace add-on's Docs event object carries only the document's ID and title, and only after a per-file `drive.file` grant ([event objects](https://developers.google.com/workspace/add-ons/concepts/event-objects)); nothing about a selection or cursor.
- **The interface.** Editor add-ons draw their sidebar in HTML and CSS. Workspace add-ons are built from Card service widgets, which can't do the score count-up, the highlighter sweep, the rewrite wipe or the p3n colours the other p3n clients share.
- **What it costs.** Editor add-ons run on desktop browsers only (no Docs mobile apps), must be written in Apps Script, and have stricter authorization rules. A Workspace add-on would reach Gmail and the other apps with one listing, but this one is about text in Docs. Google still documents and lists Editor add-ons; Workspace add-ons are the newer kind, not a replacement Google requires.

## Keys and IPs: why the sidebar calls the API itself

The free tier allows 10 calls an hour per IP. Where the call comes from decides whose IP that is:

| | From the sidebar (browser `fetch`) - **chosen** | From Apps Script (`UrlFetchApp`) |
| --- | --- | --- |
| Keyless calls | the user's own IP: each user gets their own 10 an hour | Google's shared servers: the 10 an hour is shared with every other Apps Script caller, so in practice a key is required |
| Extra OAuth scope | none | `script.external_request` (one more scope on the consent screen and in verification) |
| Long rewrites | the sidebar polls `/v1/runs/{id}` itself; closing the sidebar cancels | the server function would have to poll inside Apps Script's time limits |
| API key | kept in the user's own properties, handed to the sidebar when it opens, sent from their browser as a bearer token | the same, but sent from Google's servers |
| Depends on | the sidebar's sandbox allowing `fetch` to `api.p3n.si` (the API answers CORS for any origin and exposes `X-Free-Remaining`) | nothing in the browser |

So keyless use works as it does on p3n.si, and a key is optional, as it is in the extension and the Word add-in. The key is stored with `PropertiesService.getUserProperties()`: per user and per add-on, in the user's Google account, never in the document (document properties would be readable by every editor and would travel with copies). If Google ever blocks `fetch` from add-on sidebars, the fallback is `UrlFetchApp` with a required key.

## Install for testing

You need Node 18+ and a Google account to test with.

1. `npm install` in this folder.
2. Turn on the Apps Script API for that account: <https://script.google.com/home/usersettings> (pick the account first if you're signed in to several). clasp refuses to create anything until it's on.
3. `npx clasp login`. It prints a Google sign-in URL and waits; pick the test account in Google's chooser. clasp asks for its own scopes (Apps Script projects and deployments, Drive files it creates, Cloud and logging access); the token stays in `~/.clasprc.json` on your computer, and you can revoke "clasp" at <https://myaccount.google.com/permissions>.
4. The quickest test: a new Google Doc with the add-on bound to it (this is how it was tested).
   ```bash
   npx clasp create --type docs --title "p3n test" --rootDir src
   git checkout src/appsscript.json   # clasp replaces our manifest with its default one
   npx clasp push --force
   ```
   This writes `.clasp.json` with the script and document IDs (ignored by git; `.clasp.json.example` shows its shape). The Doc is in your Drive, named "p3n test", shared with no one.
5. Open the Doc and reload it, in a browser window signed in to the test account only, or with it as the default account (see [Several Google accounts](#several-google-accounts-in-one-browser)). The menu is under **Extensions → p3n test** (a bound script's menu takes the project's name; a published add-on's takes the add-on's).
6. The first menu click shows "Authorization required", then a Google sign-in popup:
   - "Google hasn't verified this app": **Advanced → Go to p3n test (unsafe)**. It's your own script.
   - Google then lists the two scopes below as checkboxes. Tick both (**Select all**) and **Continue**. With one left out, the sidebar can't read the document and says so.

For the Marketplace the add-on has to be a standalone project instead: `npx clasp create --type standalone --title "p3n for Google Docs" --rootDir src`, push, then **Deploy → Test deployments → Editor add-on** in the Apps Script editor (`npm run open`) and pick a test document.

After a change, `npx clasp push --force` and reload the document.

**Mock mode:** in the Apps Script editor (Extensions → Apps Script in the Doc, or `npm run open`), pick `devMockOn` in the function list and click Run, then reopen the sidebar. It shows a *Mock API* badge and answers from canned runs in `src/mock.html`: nothing goes to p3n and no free calls are used. When a call to Apps Script fails, the sidebar's message also shows Google's own error. `devMockOff` turns it off. Both change only your own properties.

## Several Google accounts in one browser

A long-standing Apps Script bug, not one in p3n: with several Google accounts signed in to one browser, and the document belonging to an account other than the browser's default one (the first signed in, `/u/0/` in Google's URLs), the sidebar opens and draws, but every call from it back to Apps Script (`google.script.run`) fails with "We're sorry, a server error occurred while reading from storage. Error code PERMISSION_DENIED." ([developer forum thread](https://discuss.google.dev/t/how-is-everyone-handling-the-dreaded-authuser-0-multiple-accounts-bug-in-apps-script-add-ons/363446)). The live test below ran into it with the test account as the third account signed in; in a Chrome profile signed in to that account only, the same steps all worked.

- What fails: reading the selection (Use selection, the menu's Check and Rewrite on a selection), Replace, saving or removing the key.
- What still works: text typed or pasted in the box, Check, Rewrite and Copy. They don't go through Apps Script; the sidebar calls p3n itself.
- The fix for users: open the document in a browser window or Chrome profile signed in to just the account that has it, or make that account the default (sign out of all accounts, sign in to that one first). The sidebar's error message says this when it hits the failure.
- The add-on can't fix it: the failure is in Google's frame between the sidebar and the script, before any p3n code runs.

## Scopes

Set in `src/appsscript.json`, so Apps Script doesn't widen them.

| Scope | Why |
| --- | --- |
| `documents.currentonly` | Read the selection and replace it, in the document the add-on is used in, and no other. |
| `script.container.ui` | The Extensions menu entries and the sidebar. |

Google's consent screen shows them as "View and manage documents that this application has been installed in" and "Display and run third-party web content in prompts and sidebars inside Google applications", each with its own checkbox. Google counts the request as sensitive: until the add-on is verified, users get the "Google hasn't verified this app" warning first.

Nothing else: no Drive access, no other documents, no `script.external_request` (the API is called from the browser, see above), no email address. `PropertiesService` (the API key) needs no scope.

## Privacy: what it sends

- Only the text you select or type, and only when you click Check or Rewrite (or choose them in the Extensions menu). It goes from your browser to `api.p3n.si` and nowhere else.
- Opening the sidebar reads your current selection into the box so you can see it; that read stays between Docs and the sidebar.
- No history, no analytics, nothing stored in the document. Replace writes only the rewrite you asked for, in place of the text you selected.
- Your API key, if you add one, is kept in your Google account's settings for this add-on (Apps Script user properties). Other people with access to the document can't see it.
- Apps Script errors are logged to the add-on's Google Cloud project (`exceptionLogging: STACKDRIVER`); the code puts no document text in error messages.

## How Replace works

`replaceSelection` in `src/Code.js`:

- It writes only if the selected text is still exactly what was rewritten. If the selection moved (you clicked in the document while waiting), it finds the text you sent and replaces it there, but only for a single paragraph that appears exactly once; otherwise it refuses and says why.
- The API reads a blank line as a paragraph break, so each selected paragraph goes over as a paragraph of its own, and the rewrite comes back one paragraph per paragraph. Each goes back into its own paragraph, so headings, list items, alignment and spacing stay. Paragraphs the rewrite left as they were (short ones such as headings) aren't touched at all.
- Inside a paragraph, the new words take the character formatting most of the old words had (bold, italic, font, size, colours). The rewrite doesn't say which new words came from which old ones, so a bold phrase inside a rewritten paragraph comes back plain. A link is kept only if the whole selection was that one link. The spaces at the edges of the selection stay.
- The rewrite ends with `"\n"`; that never becomes an empty paragraph. The new text goes in before the old is deleted, so no paragraph is left empty in between.
- It won't write over a selection with a table, picture, drawing, equation, footnote or smart chip in it. Check and Copy still work there.
- All edits happen in one server call, and one Ctrl+Z in the document takes them all back, formatting included (checked in Docs, on one paragraph and on six).

## Files

| File | Does |
| --- | --- |
| `src/Code.js` | Apps Script: the menu, opening the sidebar, reading the selection, replacing it, saving or removing the key, mock mode on and off. |
| `src/Sidebar.html` | The sidebar's markup. Pulls in the parts below as Apps Script template includes. |
| `src/host.html` | The Docs host adapter, the only sidebar code that knows it's in Docs: `getKey`/`setKey` (user properties via `Code.js`), the free count, `grabSelection()` → `{ text, editable, blocked }`, `replace(text)` → `{ ok, reason }`, `copy`, `openSettings` (none: the sidebar has its own key screen). The same shape as the extension's and the Word pane's adapters. |
| `src/app.html` | The controller: the text box, running a skill, Replace, the key screen. Talks to the document only through the adapter and to p3n only through the API client. |
| `src/render.html` | Results and their motion, host-free: score count-up, highlighter sweep, rewrite wipe, check marks, error copy. From the extension's `ui/panel.js` and the Word pane. |
| `src/api.html` | The API client, the extension's `lib/api.js` as a plain script: `POST /v1/detect` and `/v1/humanize`, polling `/v1/runs/{id}`, readable errors. |
| `src/mock.html` | Canned API runs for mock mode and the tests, with the API client's shape (`runSkill`, `me`). |
| `src/styles.html` | p3n colours and motion, the extension's CSS fitted to Docs' 300px sidebar. |
| `src/appsscript.json` | Manifest: V8, the two scopes. |
| `dev/` | Not uploaded: the local harness, tests, icons. |

Motion is kept to the result, as in the other clients: the score counts to its value and changes colour band by band, flagged sentences get a highlighter sweep, a rewrite wipes in, Replaced draws a check mark, the key screen slides in. With reduced motion on, the end state shows at once.

## Tests

```bash
npm test          # Code.js against a stand-in for DocumentApp (13 tests)
npm run e2e       # the sidebar in headless Chrome, on the local harness, mock API (28 checks)
LIVE=1 npm run e2e  # adds one Check and one Rewrite on the live API, keyless: 2 of the 10 free calls an hour
npm run harness   # the harness on http://127.0.0.1:8787/?mock=1, to try the sidebar by hand
```

- `npm test` loads `src/Code.js` with a small in-memory DocumentApp (Text elements with per-character attributes, range elements with inclusive offsets) and checks: reading across paragraphs, soft line breaks, replacing a word range with the majority formatting, the edge spaces, whole paragraphs, several paragraphs with an untouched heading, links, the refusals (edited text, tables, pictures), the find-once fallback, a dropped paragraph, and the key format.
- `npm run e2e` checks Check, Rewrite and Replace on one paragraph and on several, Check again after Replace, the edited-text refusal, a stale rewrite after other text was taken in, typed text (no Replace, Copy confirms), nothing selected, the menu's Check-on-open, the free limit, the key screen (malformed, accepted, revoked, removed), reduced motion, and no page errors. Captures go to `dev/out/`. `CHROME=path/to/chrome` if Chrome isn't in the default Windows location.
- The harness's document side mimics `Code.js` on a web page, so it tests the sidebar, not Docs. What only Docs can show is in the live test below.

### Live test in Google Docs

Run on 2026-10-20: a bound test document ("p3n test", in the test account's Drive, shared with no one), mock mode on, no free API calls used. Two rounds: first in a Chrome with several Google accounts signed in and the test account not the default one, then in a Chrome profile signed in to the test account only.

Passed with several accounts signed in:

- Install as above: `clasp create --type docs`, push, the menu under **Extensions → p3n test**. The consent screen asked for the two scopes in the wording above, behind the unverified-app warning, with a checkbox each.
- The sidebar opens from the menu and draws as in the harness at Docs' 300px width, the score's count-up included.
- `fetch` from the sidebar's sandbox reaches `api.p3n.si`, so the keyless design works from the add-on: a well-formed but unknown key on the key screen got the API's 401 "p3n doesn't accept this key" (the sandbox blocking it would read "Can't reach p3n"). `GET /v1/me` doesn't count against the free calls.
- Check and Rewrite on typed text: the score, the flagged sentences, the rewrite, the "Detector model … AI class" numbers. No Replace offered for typed text.
- Copy: the rewrite reached the system clipboard and the button said Copied.
- A failed call to Apps Script shows the sidebar's plain message (plus Google's own in mock mode) instead of breaking the sidebar.

Everything that goes through `google.script.run` failed there with the [several-accounts bug](#several-google-accounts-in-one-browser). In the single-account profile it all worked:

- The sidebar opens without the error, and **Use selection** reads the selected paragraph exactly (curly quotes included).
- **Rewrite → Replace selection** on one paragraph: the paragraph holds the rewrite, still Normal text in Arial 11, the next paragraph follows with no empty one in between, and the new text is selected. One Ctrl+Z puts the original back.
- **Six paragraphs**, from the Heading 2 through a bold phrase and both list items to a plain paragraph: one rewritten paragraph each, the heading untouched and still Heading 2, the list items still bullets, no paragraph added or lost. The bold phrase sat in a rewritten paragraph and came back plain, as designed (see [How Replace works](#how-replace-works)). One Ctrl+Z put all six back, bold included.
- **Key:** saved through Apps Script (a made-up key, which mock mode accepts), back in the sidebar after closing and reopening it, then removed. Nothing left behind.

Not verified in Docs, covered only by `npm test` and the harness e2e:

- A selection with a soft line break, in a table cell, or with a picture in it (refused).
- A selection in a document's second tab.
- That another account with access to the document can't see the key (user properties are per user by Google's design).
- A live call from Docs. The probe above shows the sidebar reaches the API; the API client is the extension's `lib/api.js` unchanged, already run live there and in Word.

## What needs the owner

To publish on the Google Workspace Marketplace under ZDResearch:

1. **Publisher account.** Decide which ZDResearch Google account (ideally a Google Workspace account on a ZDResearch domain) owns the Apps Script project and the listing; move the project to it.
2. **Google Cloud project.** A standard Cloud project owned by ZDResearch, linked to the script (Project Settings → Google Cloud Platform project). The default Apps Script project can't be published.
3. **OAuth consent screen** (External): app name p3n, the p3n logo, a support email, `p3n.si` as an authorized domain (verified in Google Search Console), and links to <https://p3n.si/privacy> and <https://p3n.si/terms>. The privacy policy needs a section on the Docs add-on: what it reads (only the text the user sends), that it keeps nothing, and Google's [API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) "Limited Use" statement.
4. **OAuth verification** for the two scopes. The Cloud console marks each scope sensitive or not; Google may ask for a demo video of the add-on using them. Until it's verified, users see the unverified-app warning and Google caps how many can authorize it.
5. **A versioned deployment** (Apps Script: Deploy → New deployment → Add-on), whose version number goes into the Marketplace SDK.
6. **Google Workspace Marketplace SDK** in the Cloud project: App configuration (Docs add-on, the script ID and version), Store listing (name, short and long description, category, icons 32x32 and 128x128, a 220x140 card banner, 1280x800 screenshots from a real Docs run, support, privacy and terms URLs), visibility Public, then submit for Google's review.

Also open for a later version: a Workspace add-on alongside (for Gmail, say), and the Docs mobile apps, which Editor add-ons can't reach.
