# Translating MAC

Thank you for helping! Each language in MAC is **one JSON file**. That file serves the Stream Deck action list, the texts on the keys and the settings panels (property inspectors).

## Add a new language

1. Copy `plugin/de.boriskemper.music-assistant-controller.sdPlugin/en.json` to a file with the two-letter code of your language. Stream Deck supports `de`, `en`, `es`, `fr`, `ja`, `ko`, `zh_CN` and `zh_TW`, so for French the file is `fr.json`.
2. Translate the **values** only. Keep every key (the part left of the colon) unchanged.
   - Keys that are English sentences, like `"Play/Pause"`, belong to the manifest. Translate only the value on the right.
   - Keys like `key.*` appear on the Stream Deck keys. Keep them short, because a key is tiny.
   - Keys like `pi.*` appear in the settings panel.
3. Open a pull request, or attach the file to an issue if you are not familiar with Git.

Missing keys fall back to English, so a partial translation is fine.

## Test your translation (optional)

```bash
npm install
npm run build        # bundles all language files for the settings panels
```

Then set your Stream Deck app or OS language to your language and restart Stream Deck.
