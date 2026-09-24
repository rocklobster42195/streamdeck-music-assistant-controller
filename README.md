# Music Assistant Controller (MAC) for Elgato Stream Deck

Control **[Music Assistant](https://www.music-assistant.io/)** from your Stream Deck. Every speaker and every streaming service in one deck, with cover art, live state and physical buttons.

![Status](https://img.shields.io/badge/status-early%20development-orange)
![Stream Deck SDK](https://img.shields.io/badge/Stream%20Deck%20SDK-3-black)
![Music Assistant](https://img.shields.io/badge/Music%20Assistant-%E2%89%A5%202.10-blue)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Disclaimer:** This is an independent, community-made plugin. It is not affiliated with, endorsed by, or officially connected to the Music Assistant project or Elgato in any way.

> **Status:** MAC is in early development. The connection layer and the first action (Play/Pause) work. The remaining MVP actions are in progress. See the [roadmap](#roadmap).

---

## Why MAC?

Music Assistant brings Spotify, Tidal, Qobuz, radio, podcasts, audiobooks and your own files together in **one library**. It plays them on almost any speaker: Sonos, AirPlay, Chromecast, Squeezebox, DLNA and more, all in the same house.

MAC puts that on physical buttons and dials:

- **One plugin for all speaker brands.** Any player that Music Assistant knows about can be controlled from the deck.
- **Live state.** Keys update instantly through Music Assistant's event stream, so there is no polling.
- **"Active player" concept.** A whole deck profile can follow one switchable player, so you don't have to configure each key.
- **Beyond remote control:** a Like key, "Don't stop the music", crossfade, and later queue transfer ("music follows me"), party mode and more.

MAC is the sister project of **[Sonos Controller](https://github.com/rocklobster42195/streamdeck-sonos-controller)** and shares its UI foundation.

---

## Actions

| Action | Controller | Status |
|---|---|---|
| **Play / Pause**: cover art, live play state, optional progress bar and player name | Key | ✅ working |
| **Playback Control**: next · previous · shuffle · repeat · crossfade · "Don't stop the music" | Key | 🚧 MVP |
| **Volume**: up · down · mute · preset | Key | 🚧 MVP |
| **Volume**: rotate to change, press to mute | Dial (SD+) | 🚧 MVP |
| **Track Control**: cover, title and progress on the LCD, rotate to seek | Dial (SD+) | 🚧 MVP |
| **Play Item**: play any playlist, album, radio station or podcast from your library | Key | 🚧 MVP |
| **Like**: add the current track to your favorites; the heart fills when it already is one | Key | 🚧 MVP |

### Play / Pause

Toggles playback of the selected player. While playing, the key shows the cover art of the current track or station. When paused, the cover is dimmed and a play symbol appears. The key reacts immediately when pressed and then syncs with what Music Assistant reports.

The settings panel shows a **live preview of the key** together with what is playing and where. The player picker shows the current state of every player (playing, paused, ready, offline). For keys set to "Active player", it also shows which player they currently follow.

| Setting | Description |
|---|---|
| Player | A specific player/group, or **Active player** (default) |
| Player name | Show the player's name as the key title |
| Progress | Thin progress bar at the bottom, tinted with the cover's accent color |

When a key can't do its job, it tells you: **Setup** means connection details are missing, **Offline** means the server is not reachable (MAC reconnects automatically), **Token?** means the token was rejected, and **No player** means no player is selected or the player is gone.

---

## Requirements

- Elgato Stream Deck app **6.9** or later (Windows 10+ or macOS 12+)
- A running **Music Assistant server 2.10 or later**, either standalone or as a Home Assistant add-on
- A **long-lived access token** from Music Assistant

## Setup

1. In Music Assistant, open **Settings → Profile** and create a **long-lived token**. Name it, for example, "Stream Deck".
2. Drag any MAC action onto your Stream Deck. Its settings panel guides you through two steps:
   - **Server address**: the address of your Music Assistant server, e.g. `192.168.1.10` or `192.168.1.10:8095`. Port `8095` is used when you leave it out.
   - **Token**: the token from step 1
3. Click **Connect**. The panel shows the result right away: connected (with server version and player count), server not reachable, or token rejected.
4. Under **Music Assistant → Change**, pick the **Active player**. Keys set to "Active player" control this player.

The connection settings are shared by all MAC keys, so you only enter them once.

> Running Music Assistant as a Home Assistant add-on? Use the IP of your Home Assistant host with port `8095`.

---

## Roadmap

**MVP (first release):** Play/Pause · Playback Control (incl. crossfade and "Don't stop the music") · Volume key and dial · Track dial · Play Item · Like

**v2:** Queue browser dial · Favorites/Library browser dial · Group volume · **Queue transfer** ("music follows me") · **Player switcher** (change the active player from the deck)

**Later:** Panorama effects across dials · audiobook and podcast resume · search · radio mode

**Ideas:** sleep timer · party mode (guest QR code on a key) · announcements/TTS · source select · lyrics on the SD+ touch strip · ambient sounds · cast dashboard

Have an idea? [Open an issue](../../issues).

---

## Translations

MAC ships in **English** and **German**. Each language is a **single JSON file**, so adding yours is easy. See [TRANSLATING.md](TRANSLATING.md).

---

## Development

This repository is a small npm-workspaces monorepo:

```
packages/ma-client/        TypeScript client for the Music Assistant WebSocket API (no Stream Deck code)
packages/streamdeck-core/  Stream Deck UI building blocks shared with Sonos Controller (in progress)
plugin/                    The Stream Deck plugin (actions, property inspectors, manifest)
docs/ma-api/               Music Assistant API reference captured from a live server
tools/                     Dev scripts (icon generation, API probe)
```

```bash
npm install          # installs all workspaces
npm run build        # builds ma-client and streamdeck-core, then the plugin and the PI bundle
npm test             # vitest (ma-client and plugin)
npm run lint

# Stream Deck dev loop
npm run link -w mac-plugin    # link the .sdPlugin folder into Stream Deck (once)
npm run watch                 # rebuild and restart the plugin on every change

# Property inspector in a normal browser (fake Stream Deck + fake plugin data)
npm run pi:preview            # http://localhost:5199/play-pause-key.html?scenario=connected&lang=de
                              # scenarios: connected · setup · auth · offline — lang: en · de
```

### Property inspectors

The settings panels do not use `sdpi-components`. They are built on a small, framework-free kit from `packages/streamdeck-core`:

- `streamdeck-core/pi`: the Stream Deck PI socket client, i18n, and light-DOM components (`<pi-section>`, `<pi-toggle>`, `<pi-field>`)
- `streamdeck-core/styles/pi-theme.css`: the shared dark theme, used by both MAC and Sonos Controller

MAC adds `<mac-key-preview>`, `<mac-player-picker>` and `<mac-connection-card>` (`plugin/src/pi-ui/`). The plugin feeds these through a small message protocol (`plugin/src/pi/protocol.ts`).

For API experiments, create a `.env` file (it is gitignored) with `MA_URL=http://<host>:8095` and `MA_TOKEN=<token>`. Then run `npm run probe`.

### `music-assistant-client`

The Music Assistant client is deliberately **independent of Stream Deck**. It handles token authentication, keeps player and queue state live from server events, reconnects with backoff, and offers typed convenience commands. It is planned to be published to npm once its API has settled.

```ts
import { MusicAssistantClient } from "music-assistant-client";

const ma = new MusicAssistantClient({ url: "http://192.168.1.10:8095", token: "…" });
ma.on("player_updated", (player) => console.log(player.name, player.playback_state));
ma.start();
await ma.playPause("RINCON_…");
```

On Node 20, pass a WebSocket implementation: `webSocketFactory: (url) => new WebSocket(url)` from the [`ws`](https://www.npmjs.com/package/ws) package.

---

## Related projects

- **[Sonos Controller](https://github.com/rocklobster42195/streamdeck-sonos-controller)**: the sister plugin for Sonos systems ([Elgato Marketplace](https://marketplace.elgato.com/product/sonos-controller-083f868f-c0b5-43bc-8db5-ba287254fce5))
- **[JS Automations for Home Assistant](https://github.com/rocklobster42195/ha-js_automations_addon)**: write Home Assistant automations in JavaScript/TypeScript

## Credits

- [Music Assistant](https://www.music-assistant.io/): the server that makes all of this possible
- Icons: [Material Design Icons](https://pictogrammers.com) (Pictogrammers)
- [ws](https://github.com/websockets/ws)

## License

[MIT](LICENSE) © Boris Kemper
