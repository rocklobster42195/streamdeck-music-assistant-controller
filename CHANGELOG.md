# Changelog

All notable changes to MAC (Music Assistant Controller) are documented here.

## [Unreleased]

### Added
- **Translation page** (`translate/`, `npm run translate`): pick source and target language (new languages included), see where each text is used (scanned from code, PI pages and manifest), missing/outdated status (outdated via git blame), live key preview with a too-wide warning, placeholder check, draft in the browser, and export as JSON or a GitHub proposal. Dark theme with the PI design tokens.
- **Sleep Timer** key: steps through durations (default 15/30/60/90 min, configurable) and counts down.
- **Announcement** key: TTS message on one or all players, with a voice (TTS engine) picker, optional chime and volume.
- **Source** key: select a player input (e.g. Line-in); lit while it is active; passive sources are hidden.
- **Cast Dashboard** key: show or hide an MA dashboard (now playing / party / music quiz) on a registered screen. It handles slow cold starts (60 s timeout), ignores extra presses while busy ("…"), and tolerates delayed session reports. Tested on an NVIDIA SHIELD.
- PI: `<mac-select>`, a dropdown filled by the plugin (`PiBridge.registerOptions`) and used for TTS engines, player inputs and screens.
- **Panorama dial** (SD+) with the sonos-controller effects: Particles, Matrix Rain, Boing Ball and Boing Globe. Neighbouring dials share one scene. Rotate and push go to the effect, and changes are saved. The effect can follow the cover color.
- Effect **backgrounds** for the Track, Volume and Group Volume dials (dimmed under the content).
- PI: effect picker with fields generated from the effect's schema (`<mac-effect-settings>`) and a new `<pi-color>` component.
- `streamdeck-core`: panorama engine, orchestrator and effects (ported from sonos-controller).
- Scrolling text (marquee): the Track dial scrolls long titles and artists, and the Play/Pause key can show a scrolling title (new **Title** option).
- The volume rings (Volume and Group Volume dials) glide smoothly to new values.
- `streamdeck-core` render helpers: Arial text metrics (ported from sonos-controller) with `truncateToWidth` and `wrapToWidth`, a time-based `marqueeSvg`, `AnimatedValue`, and `FrameTicker`. Text is now cut and wrapped by measured width instead of an estimate.
- **Queue dial** (SD+): scroll the queue from the current track (covers, titles, artists, now playing / up next / played), push to jump, touch to return. Items load page by page.
- **Group Volume dial** (SD+): volume and mute for the whole group (`group_volume`, `group_volume_mute`), with the group's rooms and a preset. It falls back to the single player when ungrouped.
- `music-assistant-client`: `queueItems`, `playIndex`, `setGroupVolume`, `setGroupMute`, `groupPlayers`, `ungroup`.
- **Player** key (one per room): makes its player the active player, with a blue frame and state dot. **Bring the music along** moves playback from the previous active player (music follows you).
- **Active Player** dial: rotate to choose the active player (keys follow instantly, saving is throttled), push to bring the music here from wherever it plays, touch for play/pause.
- **Browser dial** (SD+): browse all providers (via `music/browse`) or your library (favorites and per-type listings) with the dial. Rotate to scroll, push to open or play, touch to go back, hold to go to the start. It shows a breadcrumb, cover, position and a scroll indicator, returns to "now playing" after a timeout, resumes where you left off, and hides providers that can't be browsed.
- `BrowserModel` / `MaBrowseSource`: navigation logic without Stream Deck, unit tested.
- **Volume dial** (SD+): a ring with the volume inside. Rotate for volume (only the final value is sent), push to mute, touch to recall the preset, touch and hold to save it. Text can be shown or hidden, and the ring placed left, center or right.
- **Track dial** (SD+): cover, two-line title, artist, and progress in the cover's accent color (LIVE for radio). Rotate to seek, push for the next track, touch for play/pause.
- Dial foundation: `MaDialAction` base class, touch-strip renderer, `LatestSender` throttle, and dial previews in the PI.

### Changed
- Optimistic state is dropped as soon as the server confirms it, so changes made elsewhere (MA app, other controllers) show up immediately.
- **Play Item** key: plays any MA item (playlist, album, radio, podcast, track, audiobook) with its cover on the key. A blue frame and ▶ tag show while it plays, and a check mark confirms the press. Choose between play now, play next or add to queue.
- PI library browser: favorites as the start page, search across all providers, type filters, results with covers.
- Dev tools: live PI (`npm run pi:live`, the real plugin and MA behind a browser page) and `tools/screenshot.mjs` (puppeteer-core with the installed Chrome).
- **Playback Control** key: previous, next, shuffle, repeat (off → all → one), crossfade and "Don't stop the music". Toggles show their state, and skipping is dimmed on live radio.
- **Volume** key: down, up (adjustable step), mute and preset, showing the current volume.
- **Like** key: toggles the current item in the MA favorites, with a filled heart when it already is one.
- Instant key feedback for all toggles and volume changes (optimistic state shared by every key on a player).
- PI components `<pi-choice>` (tile grid) and `<pi-range>` (slider), plus conditional visibility (`data-show-when`).
- `music-assistant-client`: TypeScript client for the Music Assistant WebSocket API. It authenticates with a long-lived token, keeps player and queue state live from server events, reconnects with backoff, merges partial results, and offers typed commands (play/pause, next/previous, shuffle, repeat, crossfade, autoplay, volume, mute, like, play media, transfer queue) plus image proxy URL helpers.
- Plugin scaffold: shared MA connection (global settings for server, token and active player), and the **Play/Pause** key with cover art, optimistic state, optional progress bar and player name, plus setup/offline/token/no-player states.
- i18n: English and German. One JSON file per language covers the manifest, key texts and property inspectors.
- Music Assistant API reference captured from a live server (`docs/ma-api/`).
- New property inspector design, replacing sdpi-components:
  - a live key preview with "now playing"
  - a player picker that shows the state of every player and whom "Active player" currently follows
  - toggle switches
  - a connection card with guided two-step setup, a "Connect" button, and separate server and token status when something fails
- `streamdeck-core`: a framework-free PI kit (Stream Deck socket client, i18n, components) and a shared dark theme.
- `npm run pi:preview`: preview the settings panels in a normal browser with simulated states.
