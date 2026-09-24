# Music Assistant Controller (MAC) for Elgato Stream Deck

Control **[Music Assistant](https://www.music-assistant.io/)** from your Stream Deck. Every speaker and every streaming service in one deck, with cover art, live state and physical buttons.

![Status](https://img.shields.io/badge/status-early%20development-orange)
![Stream Deck SDK](https://img.shields.io/badge/Stream%20Deck%20SDK-3-black)
![Music Assistant](https://img.shields.io/badge/Music%20Assistant-%E2%89%A5%202.10-blue)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Disclaimer:** This is an independent, community-made plugin. It is not affiliated with, endorsed by, or officially connected to the Music Assistant project or Elgato in any way.

> **Status:** MAC is in early development. All MVP actions work (Play/Pause, Play Item, Playback Control, Volume, Like, plus the Volume and Track dials on Stream Deck +) and are tested end-to-end against a live Music Assistant server. They have not been tested on hardware yet. See the [roadmap](#roadmap).

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
| **Playback Control**: next · previous · shuffle · repeat · crossfade · "Don't stop the music" | Key | ✅ working |
| **Volume**: up · down · mute · preset | Key | ✅ working |
| **Volume**: rotate to change, push to mute, touch for a preset | Dial (SD+) | ✅ working |
| **Track**: cover, title and progress on the display, rotate to seek | Dial (SD+) | ✅ working |
| **Browser**: browse every provider or your library with the dial and play what you find | Dial (SD+) | ✅ working |
| **Player**: one key per room; makes it the active player and brings the music along | Key | ✅ working |
| **Active Player**: choose the active player with a turn, bring the music here | Dial (SD+) | ✅ working |
| **Queue**: scroll through the queue and jump to any track | Dial (SD+) | ✅ working |
| **Group Volume**: volume and mute for a whole speaker group | Dial (SD+) | ✅ working |
| **Play Item**: play any playlist, album, radio station or podcast from your library | Key | ✅ working |
| **Like**: add the current track to your favorites; the heart fills when it already is one | Key | ✅ working |

### Play / Pause

Toggles playback of the selected player. While playing, the key shows the cover art of the current track or station. When paused, the cover is dimmed and a play symbol appears. The key reacts immediately when pressed and then syncs with what Music Assistant reports.

The settings panel shows a **live preview of the key** together with what is playing and where. The player picker shows the current state of every player (playing, paused, ready, offline). For keys set to "Active player", it also shows which player they currently follow.

| Setting | Description |
|---|---|
| Player | A specific player/group, or **Active player** (default) |
| Player name | Show the player's name as the key title |
| Progress | Thin progress bar at the bottom, tinted with the cover's accent color |

### Play Item

One press plays **any item from Music Assistant**: a playlist, album, radio station, podcast, track or audiobook, from any of your streaming services or your own files. The key shows the item's cover. While that item is playing, the key gets a blue frame and a ▶ tag.

The settings panel has a **library browser**. It opens on your favorites, and you can search across all your providers, with filters for playlists, albums, radio, podcasts, tracks and audiobooks, all shown with covers. Under **When pressed**, choose what happens: **Play now** (replaces the queue), **Play next** or **Add to queue**.

### Playback Control

One key per function: **previous, next, shuffle, repeat, crossfade** or **"Don't stop the music"**. Toggles show their state: blue with a frame means on. Repeat cycles through off, all and one. Next and previous are dimmed while a live radio stream plays, because there is nothing to skip.

### Volume

**Down, up, mute** or a **preset** volume. The key shows the current volume. For down and up, the step per press can be set from 1 to 20 %. Several quick presses add up correctly.

### Like

Adds the current track or station to your Music Assistant **favorites**. The heart is filled when it already is a favorite, and pressing again removes it. Music Assistant also uses a heart for favorites.

### Volume dial *(Stream Deck + only)*

A ring shows the volume, with the number inside and the player's name next to it.

| Input | Effect |
|---|---|
| Rotate | Volume (step per tick adjustable, 1–10 %) |
| Push | Mute / unmute |
| Touch | Recall the preset volume |
| Touch and hold | Save the current volume as the preset |

Settings: show or hide the text (volume and name), and where the ring sits (left, center or right).

### Track dial *(Stream Deck + only)*

Shows the cover, the title (on up to two lines), the artist and a progress bar in the cover's accent color. Live radio shows **LIVE** instead of a progress bar.

| Input | Effect |
|---|---|
| Rotate | Seek (seconds per tick adjustable) |
| Push | Next track |
| Touch | Play / pause |

### Player (room key) and Active Player dial

**Music follows you.** Put one **Player** key per room on your deck. Pressing it makes that room the **active player**, and every key and dial set to "Active player" now controls it. With **Bring the music along** (on by default), whatever the previous active player was playing moves to this room too. The active room's key has a blue frame, and a dot shows its state (playing, paused, ready, offline).

The **Active Player** dial does the same with a turn. Rotate to choose the active player. **Push** brings the music here from wherever it is playing. **Touch** is play/pause.

### Queue dial *(Stream Deck + only)*

Rotate to scroll through the queue, starting at the current track. Each entry shows its cover, title and artist, plus **Now playing**, **Up next** or **Played**. **Push** plays the selected track, and **touch** jumps back to the current one. After a few seconds without input, the dial returns to the current track on its own.

### Group Volume dial *(Stream Deck + only)*

Controls the volume of the **whole group** the player belongs to, and shows the group's rooms ("Group · 2 rooms"). Rotate for volume, push to mute the group, touch for a preset (hold to save it). A player that isn't grouped is controlled on its own.

### Browser dial *(Stream Deck + only)*

Browse **every provider** in Music Assistant (radio directories, streaming services, your files) or your **library**, right on the dial. The display shows where you are ("… › By tag › Jazz"), the current entry with its cover, and the position ("3 / 24").

| Input | Effect |
|---|---|
| Rotate | Scroll through the entries |
| Push | Open a folder, or play the entry |
| Touch | One level back |
| Touch and hold | Back to the start |

When idle, the dial shows what is playing. The first turn continues browsing where you left off. After a configurable time without input it returns to "now playing".

Settings:
- **Start at**: all providers, or your library (favorites, playlists, albums, radio, podcasts, audiobooks, tracks)
- **When pressed**: play now, play next or add to queue
- **Playable folders**: open them or play them
- **Timeout**: seconds without input before returning to "now playing"

Providers that can't be browsed are hidden automatically.

### Status on the keys

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

**MVP (first release):** ✅ Play/Pause · Playback Control (incl. crossfade and "Don't stop the music") · Volume key and dial · Track dial · Play Item · Like

**v2:** ✅ **Browser dial** · ✅ **Player switcher** · ✅ **Queue transfer ("music follows me")** · ✅ **Queue dial** · ✅ **Group volume**

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

### Testing without hardware

`tools/sd-sim/` is a **Stream Deck simulator**. It runs the real `bin/plugin.js` against a fake Stream Deck app over the plugin WebSocket protocol, places actions on a virtual Stream Deck +, presses keys and turns dials. It records everything the plugin sends back (images, titles, feedback, alerts, PI messages) and renders the deck to PNG.

```bash
npm run build
npm run sim:play-pause    # end-to-end against your MA server (needs .env), snapshots in sim-out/
npm run sim:keys          # playback control, like and volume keys: presses everything, checks MA, restores state
npm run sim:play-item     # Play Item: search like the PI, choose, press, check it plays
npm run sim:dials         # Volume and Track dials: turn, push, touch, check MA, restore
npm run sim:browser       # Browser dial: RadioBrowser → By tag → Jazz → play a station, library start
npm run sim:players       # Player key/dial: switch the active player; with MA_TRANSFER_PLAYER also music-follows-me
npm run sim:queue-group   # Queue dial (jump to a track) and Group Volume dial (temporary group, restored afterwards)
npm run sim:all           # all of the above
npm run pi:live           # a PI page in your browser, wired to the REAL plugin and your MA (http://localhost:5299)
node tools/screenshot.mjs <url> <out.png> [--type "<sel>=<text>"] [--click <sel>]   # reliable PI screenshots
```

For API experiments, create a `.env` file (it is gitignored) with `MA_URL=http://<host>:8095`, `MA_TOKEN=<token>` and `MA_TEST_PLAYER=<player_id>`. The simulator plays quietly on that player. `npm run probe` records raw API traffic.

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
