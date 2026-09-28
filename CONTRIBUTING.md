# Contributing to MA-C

Thanks for helping make MA-C better! You don't need to write code to contribute. Bug reports, ideas and translations are just as valuable.

- [Report a bug](#report-a-bug)
- [Suggest an idea](#suggest-an-idea)
- [Translate](#translate)
- [Contribute code](#contribute-code)
- [Contribute a panorama effect](#contribute-a-panorama-effect)

> MA-C is an independent community project. It is not affiliated with Music Assistant or Elgato. Please don't report MA-C issues to the Music Assistant project.

---

## Report a bug

Use the **[bug report form](../../issues/new/choose)**. The most useful reports include:

- **Versions:** MA-C, Music Assistant server, Stream Deck app, the Stream Deck model (e.g. Stream Deck +), and Windows or macOS.
- **Which action** is affected, and on which player (Sonos, AirPlay, Chromecast, …).
- **Steps to reproduce**, and what you expected instead.
- **The plugin log.** It lives here:
  - Windows: `%APPDATA%\Elgato\StreamDeck\Plugins\de.boriskemper.music-assistant-controller.sdPlugin\logs\`
  - macOS: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/de.boriskemper.music-assistant-controller.sdPlugin/logs/`

> ⚠️ **Never post your Music Assistant token.** Remove it, along with any IP addresses or names you'd rather keep private, before you paste logs or settings.

## Suggest an idea

Open a **[feature request](../../issues/new/choose)**, or start with a [discussion](../../discussions) if the idea is still vague. Describe the situation you want to solve ("I want to …"), not only the solution. If Music Assistant already has an API command for it, mention it. `docs/ma-api/commands-*.json` lists all of them.

## Translate

Every language is a single JSON file. The **translation page** (`npm run translate`, or the published page once the repo is public) shows every text, where it appears, a live key preview, and missing and outdated markers. It exports the finished file for you. See **[TRANSLATING.md](TRANSLATING.md)**.

---

## Contribute code

### Setup

Requirements: Node.js 24 or later, the Stream Deck app, and a Music Assistant server (developed against 2.10) with a long-lived token.

```bash
git clone https://github.com/rocklobster42195/streamdeck-music-assistant-controller.git
cd streamdeck-music-assistant-controller
npm install
npm run build
```

To try it on your Stream Deck:

```bash
npm run link -w mac-plugin   # once: links the .sdPlugin folder into Stream Deck
npm run watch                # rebuild and restart the plugin on every change
```

The layout of the repository is described in the README under **Development**. In short:
- The Music Assistant client is its own package, [`music-assistant-client`](https://github.com/rocklobster42195/music-assistant-client), installed from npm.
- The shared Stream Deck building blocks (rendering, animation, Panorama effects, PI kit) are their own package, [`@rocklobster42195/streamdeck-kit`](https://github.com/rocklobster42195/streamdeck-kit), installed from npm.
- `plugin/` is the Stream Deck plugin.

### Testing without a Stream Deck

You can develop almost everything without hardware:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (vitest) |
| `npm run pi:preview` | Property inspectors in your browser, with simulated states |
| `npm run pi:live` | A property inspector wired to the **real** plugin and **your** Music Assistant |
| `npm run sim:all` | The **Stream Deck simulator**: runs the real plugin, presses keys, turns dials, checks Music Assistant, and saves PNGs of every key and touch strip to `sim-out/` |
| `node tools/screenshot.mjs <url> <out.png>` | Reliable screenshots of PI pages |

The simulator and `pi:live` read `MA_URL`, `MA_TOKEN` and `MA_TEST_PLAYER` from a `.env` file in the repo root. `.env` is gitignored, so never commit it.

> 🔈 **Be considerate:** the simulator plays audio on `MA_TEST_PLAYER`. It plays quietly (volume 5) and restores everything afterwards, but pick a player where nobody is disturbed. Scenarios that need a second room (`MA_TRANSFER_PLAYER`) or a screen (`SIM_CAST_SCREEN`) only run when you set those explicitly.

Before you open a pull request for a change that affects what users see, check it on a real Stream Deck if you can. Timing, colors and touch behave differently on the device.

### Conventions

- **Code comments in English.** Keep them short and explain *why*, not *what*.
- **No hard-coded user-visible text.** Every text goes into the locale files (`plugin/…sdPlugin/en.json` and `de.json`) and is referenced by key. If you can't write the German text, add the English one to `de.json` as well and mention it in the PR.
- **Focused files.** One component per file. Keep logic apart from rendering (actions vs. `plugin/src/render/`). Split a file when it grows past roughly 200–250 lines or starts mixing concerns.
- **Reuse the layers.** Music Assistant calls go through `music-assistant-client`. Anything device-agnostic (rendering helpers, PI components, effects) belongs in `streamdeck-kit`.
- **Keep docs current.** Update the **README** (the action table and sections) and the **CHANGELOG** (`[Unreleased]`) in the same PR as the change.
- **TypeScript strict mode**, formatting as in the surrounding code.

### Pull requests

1. Create a branch from `main`.
2. Make your change, with tests where it makes sense. Pure logic (like `plugin/src/ma/*`) should get unit tests.
3. Make sure all of these are green:
   ```bash
   npm run build && npm test && npm run lint && npm run validate -w mac-plugin
   ```
4. Open the PR and fill in the template. The CI workflow runs the same checks. For visual changes, attach **screenshots from the simulator** (`sim-out/`) or the PI preview.

Changes to `streamdeck-kit` go to its own repository and also affect the other plugins that use it (Sonos Controller among them). Mention it in the PR if MA-C needs a new kit version.

---

## Contribute a panorama effect

Panorama effects are the ambient backgrounds that can span several Stream Deck + dials. Adding one takes a single folder. See **[CONTRIBUTING_EFFECTS.md](CONTRIBUTING_EFFECTS.md)**.

---

## Code of conduct

Be kind and constructive. Assume good intent, keep discussions about the work, and help newcomers find their way. Maintainers may close issues or PRs that don't follow this.
