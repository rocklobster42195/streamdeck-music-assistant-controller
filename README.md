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

| Action | Controller |
|---|---|
| **Play / Pause**: cover art, live play state, optional progress bar and player name | Key |
| **Playback Control**: next · previous · shuffle · repeat · crossfade · "Don't stop the music" | Key |
| **Volume**: up · down · mute · preset | Key |
| **Volume**: rotate to change, push to mute, touch for a preset | Dial (SD+) |
| **Track**: cover, title and progress on the display, rotate to seek | Dial (SD+) |
| **Browser**: browse every provider or your library with the dial and play what you find | Dial (SD+) |
| **Player**: one key per room; makes it the active player and brings the music along | Key |
| **Active Player**: choose the active player with a turn, bring the music here | Dial (SD+) |
| **Queue**: scroll through the queue and jump to any track | Dial (SD+) |
| **Group Volume**: volume and mute for a whole speaker group | Dial (SD+) |
| **Panorama**: ambient effects spanning neighbouring dials, tinted by the cover, with the title or **synced lyrics** on top | Dial (SD+) |
| **Sleep Timer**: each press steps 15 → 30 → 60 → 90 min → off, with a countdown | Key |
| **Announcement**: speak a message on one or all speakers (TTS) | Key |
| **Source**: switch a speaker to Line-in, TV or another input | Key |
| **Cast Dashboard**: show "now playing", party or music quiz on a TV | Key |
| **Play Item**: play any playlist, album, radio station or podcast from your library | Key |
| **Continue Listening**: resume your latest audiobook or podcast episode where you left off | Key |
| **Like**: add the current track to your favorites; the heart fills when it already is one | Key |

### Play / Pause

Toggles playback of the selected player. While playing, the key shows the cover art of the current track or station. When paused, the cover is dimmed and a play symbol appears. The key reacts immediately when pressed and then syncs with what Music Assistant reports.

The settings panel shows a **live preview of the key** together with what is playing and where. The player picker shows the current state of every player (playing, paused, ready, offline). For keys set to "Active player", it also shows which player they currently follow.

| Setting | Description |
|---|---|
| Player | A specific player/group, or **Active player** (default) |
| Player name | Show the player's name as the key title |
| Title | Title and artist scroll along the bottom of the key |
| Progress | Thin progress bar at the bottom, tinted with the cover's accent color |

### Play Item

One press plays **any item from Music Assistant**: a playlist, album, radio station, podcast, track or audiobook, from any of your streaming services or your own files. The key shows the item's cover. While that item is playing, the key gets a blue frame and a ▶ tag.

The settings panel has a **library browser**. It opens on your favorites, and you can search across all your providers, with filters for playlists, albums, radio, podcasts, tracks and audiobooks, all shown with covers. Under **When pressed**, choose what happens: **Play now** (replaces the queue), **Play next** or **Add to queue**.

### Continue Listening

Picks up your **latest audiobook or podcast episode** where you left off, across all your players: Music Assistant remembers the position. The key shows the cover with the title scrolling along the bottom. Press to continue, press again to pause. While it plays, the key gets a blue frame and shows the progress.

Settings: **Show** both, only audiobooks, or only podcasts · **Name** on the key on or off · **Player**.

Audiobooks and podcasts come from Music Assistant's providers (for example Audiobookshelf, Audible, podcast feeds, or LibriVox via Internet Archive). A progress bar before you press appears when Music Assistant knows the position of the item, which is the case for items in your library.

### Playback Control

One key per function: **previous, next, shuffle, repeat, crossfade** or **"Don't stop the music"**. Toggles show their state: blue with a frame means on. Repeat cycles through off, all and one. Next and previous are dimmed while a live radio stream plays, because there is nothing to skip.

### Volume

**Down, up, mute** or a **preset** volume. The key shows the current volume. For down and up, the step per press can be set from 1 to 20 %. Several quick presses add up correctly.

### Like

Adds the current track or station to your Music Assistant **favorites**. The heart is filled when it already is a favorite, and pressing again removes it. Music Assistant also uses a heart for favorites.

### Volume dial *(Stream Deck + only)*

A ring shows the volume, with the number inside and the player's name next to it. The ring glides smoothly to each new value.

| Input | Effect |
|---|---|
| Rotate | Volume (step per tick adjustable, 1–10 %) |
| Push | Mute / unmute |
| Touch | Recall the preset volume |
| Touch and hold | Save the current volume as the preset |

Settings: show or hide the text (volume and name), and where the ring sits (left, center or right).

### Track dial *(Stream Deck + only)*

Shows the cover, the title and the artist (scrolling when they are too long), and a progress bar in the cover's accent color. Live radio shows **LIVE** instead of a progress bar.

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

### Panorama dial and effect backgrounds *(Stream Deck + only)*

Four ambient effects: **Particles**, **Matrix Rain**, **Boing Ball** and **Boing Globe**. Neighbouring dials with the same effect share **one continuous scene** across the touch strip. Rotating or pushing a Panorama dial changes the effect, for example its speed, and the dial remembers the change. With **Cover color** on, the effect takes the colors of what is playing.

**Text** puts the music of the chosen **Player** (default: the active player) on top of the effect:

- **Title**: title and artist, bottom right. A new song fades in.
- **Lyrics**: the line being sung, large, with the next line below it, in time with the music. Neighbouring Panorama dials share **one line across all their displays**. On a single dial, long lines wrap. Lyrics come from Music Assistant's metadata providers (for example [LRCLIB](https://lrclib.net), enabled by default), so they work for many well-known songs but not for everything. Without lyrics (radio, audiobooks, less-known tracks), the dial shows title and artist instead. The first lookup of a song can take a few seconds, so MAC fetches the lyrics of the next song in the queue ahead of time. If the lyrics run ahead of or behind the music (speakers buffer audio), adjust **Timing**.

The **Track**, **Volume** and **Group Volume** dials can show an effect as their **background** (dimmed, so the text stays readable). Put them next to Panorama dials with the same effect, and the scene runs underneath everything.

### Browser dial *(Stream Deck + only)*

Browse **every provider** in Music Assistant (radio directories, streaming services, your files) or your **library**, right on the dial. The first folder, **Continue listening**, holds the audiobooks and podcast episodes you started. The display shows where you are ("… › By tag › Jazz"), the current entry with its cover, and the position ("3 / 24").

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

### Sleep Timer, Announcement, Source, Cast Dashboard

- **Sleep Timer:** Each press sets the next duration (default 15, 30, 60 and 90 minutes; configurable). After the last one, the timer switches off. While running, the key counts down the minutes left.
- **Announcement:** Speaks your text on the chosen player or **on all players**, with an optional chime and its own volume. The voice comes from a TTS engine in Home Assistant or Music Assistant, which you pick in the settings.
- **Source:** Switches a player to one of its inputs (e.g. Line-in on a Sonos Five, or TV). The key lights up while that input is active. Only inputs you can actually select are offered.
- **Cast Dashboard:** Shows a Music Assistant dashboard ("Now playing", "Party" or "Music quiz") on a screen that Music Assistant knows, such as a Chromecast TV. Press again to take it down.

### Status on the keys

When a key can't do its job, it tells you: **Setup** means connection details are missing, **Offline** means the server is not reachable (MAC reconnects automatically), **Token?** means the token was rejected, and **No player** means no player is selected or the player is gone.

---

## Requirements

- Elgato Stream Deck app **6.9** or later (Windows 10+ or macOS 12+)
- A running **Music Assistant server 2.10 or later**, either standalone or as a Home Assistant add-on
- A **long-lived access token** from Music Assistant

## Setup

**Install:** download the `.streamDeckPlugin` file from the [latest release](../../releases/latest) and double-click it. **Beta builds** for testing new features are published as [pre-releases](../../releases); they install the same way and are replaced by the next stable release.

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

Have an idea? [Open an issue](../../issues/new/choose).

---

## Translations

MAC ships in **English** and **German**. Each language is a **single JSON file**, so adding yours is easy. The **[translation page](translate/)** shows every text with where it appears, a live key preview and missing/outdated markers, and exports the finished file. See [TRANSLATING.md](TRANSLATING.md).

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
node tools/sd-sim/motion.mjs sim-out   # frames over time: marquee on key and dial, gliding volume ring
node tools/sd-sim/panorama.mjs sim-out # panorama effects across dials and as dial backgrounds
npm run sim:all           # all of the above
npm run translate         # translation page at http://localhost:5399/translate/ (rebuilds translate/data.json)
npm run pi:live           # a PI page in your browser, wired to the REAL plugin and your MA (http://localhost:5299)
node tools/screenshot.mjs <url> <out.png> [--type "<sel>=<text>"] [--click <sel>]   # reliable PI screenshots
```

For API experiments, create a `.env` file (it is gitignored) with `MA_URL=http://<host>:8095`, `MA_TOKEN=<token>` and `MA_TEST_PLAYER=<player_id>`. The simulator plays quietly on that player. `npm run probe` records raw API traffic.

### Releases

Versions live in the plugin manifest (`A.B.C.D`, where `D` is the beta build number). Tags are semver: `v0.2.0`, or `v0.2.0-beta.1`.

```bash
npm run ship:beta     # check → next beta (0.2.1-beta.1, then -beta.2, …) → GitHub pre-release
npm run ship:patch    # check → release; while in beta, this promotes the beta line to stable
npm run ship:minor    # / ship:major
```

Each `ship:*` runs `npm run check` (build, tests, lint, validate), then `tools/bump-version.mjs` (manifest version, CHANGELOG `[Unreleased]` → version section for stable releases, commit and tag), then `tools/release.mjs` (push and GitHub release; betas as pre-releases). The **Release** workflow builds the plugin from the tag and attaches `de.boriskemper.music-assistant-controller-<tag>.streamDeckPlugin`. Stable releases are also packed locally into `release/` for the Elgato Marketplace upload, which has no beta channel. Release packages leave out the Node debug port (`tools/pack.mjs`). If only the publish step fails, fix it and re-run `npm run release`. The **CI** workflow runs the same checks on every push and pull request.

### `music-assistant-client`

The package has its own **[README](packages/ma-client/README.md)** and **[CHANGELOG](packages/ma-client/CHANGELOG.md)** and is released to npm separately: `npm run client:release:patch|minor|major` runs the checks, bumps its version, dates its changelog and pushes a `ma-client-v<version>` tag. The **Publish client** workflow then checks the tag and publishes to npm (repository secret `NPM_TOKEN`).

The Music Assistant client is deliberately **independent of Stream Deck**. It handles token authentication, keeps player and queue state live from server events, reconnects with backoff, and offers typed convenience commands. It is planned to be published to npm once its API has settled.

```ts
import { MusicAssistantClient } from "music-assistant-client";

const ma = new MusicAssistantClient({ url: "http://192.168.1.10:8095", token: "…" });
ma.on("player_updated", (player) => console.log(player.name, player.playback_state));
ma.start();
await ma.playPause("RINCON_…");
```

On Node 20, pass a WebSocket implementation: `webSocketFactory: (url) => new WebSocket(url)` from the [`ws`](https://www.npmjs.com/package/ws) package.

**Convenience methods** cover what automations and remote controls typically need:

| Area | Methods |
|---|---|
| Playback | `playPause` `play` `pause` `stopPlayback` `next` `previous` `seek` `skipSeconds` `setShuffle` `setRepeat` `setCrossfade` `setAutoplay` `setPlaybackSpeed` `playMedia` `transferQueue` |
| Queue | `queueItems` `playIndex` `clearQueue` `removeQueueItem` `moveQueueItem` `saveQueueAsPlaylist` |
| Players and groups | `playerByName` `setPower` `setVolume` `volumeUp` `volumeDown` `setMute` `selectSource` `groupPlayers` `ungroup` `ungroupMany` `setGroupVolume` `setGroupMute` `setSleepTimer` `sleepTimer` `clearSleepTimer` |
| Library | `search` `browse` `libraryItems` `itemByUri` `albumTracks` `playlistTracks` `artistTopTracks` `podcastEpisodes` `recommendations` `addToLibrary` `removeFromLibrary` `addFavorite` `removeFavorite` `addCurrentlyPlayingToFavorites` |
| Listening history | `recentlyPlayed` `inProgressItems` `markPlayed` `markUnplayed` |
| Playlists | `createPlaylist` `addToPlaylist` `removeFromPlaylist` |
| Extras | `trackLyrics` `playAnnouncement` `ttsEngines` `dashboards` `showDashboard` `hideDashboard` `partyUrl` `partyAddToQueue` `partyBoost` `partySkip` |

```ts
const kitchen = ma.playerByName("Kitchen");
const { albums = [] } = await ma.search("Dark Side of the Moon", { mediaTypes: ["album"] });
if (kitchen && albums[0]?.uri) await ma.playMedia(kitchen.player_id, albums[0].uri, "replace");
if (kitchen) await ma.skipSeconds(kitchen.player_id, 30);
```

**The whole API, typed.** Besides the convenience methods, `call()` reaches **every** Music Assistant command (310 in 2.10.4) with checked arguments and a typed result, and all data models are available as `MA.*`:

```ts
import type { MA } from "music-assistant-client";

const results = await ma.call("music/search", { search_query: "Sherlock Holmes", media_types: ["audiobook"] });
const books: MA.Audiobook[] = results.audiobooks;
await ma.call("player_queues/set_playback_speed", { queue_id: "RINCON_…", speed: 1.25 }); // typo in a name or type → compile error
```

These types are generated from the server's own API docs (`docs/ma-api/openapi-*.json` and `commands-*.json`) by `npm run gen:api` (`tools/ma-api/`). For a new Music Assistant version, save `/api-docs/openapi.json`, `/api-docs/commands.json` and `/info` from the server into `docs/ma-api/` and regenerate. CI fails if the generated files don't match the docs. Note that the server also sends a few undocumented compatibility fields (for example `Player.display_name`); the hand-written state types (`Player`, `PlayerQueue`, …) include the ones MAC uses.

---

## Contributing

Bug reports, ideas, translations, code and new panorama effects are all welcome. **[CONTRIBUTING.md](CONTRIBUTING.md)** explains how to report a bug well, set up the dev environment, test without a Stream Deck (simulator and PI preview), and open a pull request. For effects, see **[CONTRIBUTING_EFFECTS.md](CONTRIBUTING_EFFECTS.md)**.

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
