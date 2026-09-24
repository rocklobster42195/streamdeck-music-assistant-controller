# Translating MAC

Thank you for helping! Each language in MAC is **one JSON file**. That file serves the Stream Deck action list, the texts on the keys and the settings panels (property inspectors).

## The easy way: the translation page

Open the **[translation page](translate/)** (run `npm run translate` locally, then go to http://localhost:5399/translate/):

- Pick your language under **To**. `?to=fr` in the link preselects it. New languages are marked with ✚.
- Every text shows **where it appears**, for example "Play/Pause · settings" or "Track · dial hint".
- Texts shown on keys get a **live key preview** that warns when a text is too wide. Missing placeholders like `{player}` are flagged too.
- **Missing** and **outdated** texts are marked. "Outdated" means the English text changed after the translation.
- Your draft is saved in the browser. When you're done, use **Download JSON**, or **Propose on GitHub**, which copies the file and opens GitHub's editor for you.

## By hand

1. Copy `plugin/de.boriskemper.music-assistant-controller.sdPlugin/en.json` to a file with the two-letter code of your language. Stream Deck supports `de`, `en`, `es`, `fr`, `ja`, `ko`, `zh_CN` and `zh_TW`, so for French the file is `fr.json`.
2. Translate the **values** only. Keep every key (the part left of the colon) unchanged.
   - Keys that are English sentences, like `"Play/Pause"`, belong to the manifest. Translate only the value on the right.
   - Entries in the `"key"` group appear on the Stream Deck keys. Keep them short, because a key is tiny.
   - Entries in the `"pi"` group appear in the settings panel.
   - Leave placeholders like `{player}` or `{count}` as they are. They are filled in at runtime, and you may move them within the sentence.
3. Open a pull request, or attach the file to an issue if you are not familiar with Git.

Missing keys fall back to English, so a partial translation is fine.

## Test your translation (optional)

```bash
npm install
npm run build        # bundles all language files for the settings panels
```

Then set your Stream Deck app or OS language to your language and restart Stream Deck.

For other ways to help (bug reports, code, effects), see [CONTRIBUTING.md](CONTRIBUTING.md).
