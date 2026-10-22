<p align="center">
  <img src="dev/icons/logo-512.png" width="88" alt="">
</p>

<h1 align="center">p3n for Google Docs</h1>

<p align="center">
  Select text in a Google Doc. See if it reads as AI-written, or rewrite it and put the new version in its place.
</p>

<p align="center">
  <a href="https://nikita-andreiev.com/p3n-google-docs-addon/">Homepage</a> · <a href="https://p3n.si">p3n.si</a> · <a href="https://nikita-andreiev.com/p3n/">All p3n apps</a>
</p>

<p align="center">
  <a href="https://github.com/Barabosik/p3n-google-docs-addon/actions/workflows/ci.yml"><img src="https://github.com/Barabosik/p3n-google-docs-addon/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  <img src="docs/sidebar-check.png" width="300" alt="Check for AI in the p3n sidebar">
  <img src="docs/sidebar-rewrite.png" width="300" alt="A rewrite in the p3n sidebar, with Replace selection">
</p>

## What it does

- **Check for AI.** A score, a one-line reason, and the sentences that give it away.
- **Rewrite.** A version that keeps your facts and drops the filler. **Replace selection** puts it where your text was, with headings, lists and formatting kept, and one Ctrl+Z undoes it.
- It works from **Extensions → p3n** or the sidebar. Text you paste into the sidebar works too.

## Free, or with a key

You get 10 checks or rewrites an hour without an account, up to 5,000 characters each. For more, [sign up at p3n.si](https://p3n.si/register) (you get free credit), make a key on the [API keys](https://p3n.si/dashboard/keys) page, and add it with **Add API key** in the sidebar.

## Privacy

The add-on sends the text you chose to `api.p3n.si`, and only when you click Check or Rewrite. It can open only the document you use it in. It keeps no history, has no analytics, and never stores anything in your document. Your API key stays in your Google account's settings for this add-on. The details are in [PRIVACY.md](PRIVACY.md).

## Run your own copy

You can run your own copy with [clasp](https://github.com/google/clasp): the steps are in [CONTRIBUTING.md](CONTRIBUTING.md#try-it-in-google-docs).

## Known gaps

- If you're signed in to several Google accounts and the document isn't on your default one, Google blocks the add-on from reading the document. Use a browser window with just that account.
- Google's Docs apps for phones and tablets don't run add-ons.

## Other p3n apps

p3n also works in [Chrome and Firefox](https://nikita-andreiev.com/p3n/#browser), [Word and Excel](https://nikita-andreiev.com/p3n/#office), [VS Code](https://nikita-andreiev.com/p3n/#vscode), [Obsidian](https://nikita-andreiev.com/p3n/#obsidian) and [Sublime Text](https://nikita-andreiev.com/p3n/#sublime). Install steps for each are on [nikita-andreiev.com/p3n](https://nikita-andreiev.com/p3n/).

## Develop

Layout, tests and how Replace works are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT
