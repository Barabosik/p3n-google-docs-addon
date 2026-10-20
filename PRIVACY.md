# Privacy policy: p3n for Google Docs

Effective 20 October 2026.

p3n for Google Docs is a Google Docs add-on published by Nikita Andreiev. It sends text to p3n only when you ask it to.

## What it reads from Google

The add-on asks Google for two permissions:

- **The document you use it in** (`documents.currentonly`). It reads the text you selected, and writes the rewrite in its place when you click Replace selection. It can't open any other document or file.
- **Its menu and sidebar** (`script.container.ui`). That's how it shows its Extensions menu items and the sidebar.

When you open the sidebar, it reads your current selection to show it in the text box. That text stays between Google Docs and the sidebar until you click a button. The add-on doesn't read your name, email address, contacts or Drive.

## What it sends, and where

- **What.** The text in the sidebar's box (your selection, or text you typed), when you click Check for AI or Rewrite. If you added an API key, the key goes with it so p3n can bill your account.
- **Where.** Only to `api.p3n.si`, over HTTPS, straight from your browser.
- **Nothing else.** No history, analytics or ads, and nothing is stored in your document.

## What it keeps

- **Your API key**, if you add one, in Google's per-user storage for this add-on (Apps Script user properties). Other people with access to the document can't see it. **Remove key** in the sidebar deletes it.
- Google keeps a log of the add-on's errors for its developer, as it does for every Apps Script add-on. The add-on puts no document text or keys in those messages.

To stop all access, remove the add-on in Google Docs (Extensions → Add-ons → Manage add-ons) and revoke it at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## What p3n does with the text

- It keeps the text for up to 7 days, to return results and debug failures, then deletes it.
- It sends the text through OpenRouter to the AI model providers that run the check or rewrite.
- It logs the time and IP address of each call. That's how the free limit works.
- It doesn't sell data or use your text to train models.

p3n's full policy is at [p3n.si/privacy](https://p3n.si/privacy).

## Google user data

p3n for Google Docs' use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. Text from your document is used only to run the check or rewrite you asked for. It is never sold, used for advertising, or read by people, except where you ask for help with a specific problem or the law requires it.

## Contact

Questions about the add-on: [GitHub issues](https://github.com/Barabosik/p3n-google-docs-addon/issues). Questions about p3n: [p3n.si/contact](https://p3n.si/contact).

Changes to this policy are published here with a new date.
