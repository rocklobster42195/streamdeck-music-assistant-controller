# Changelog

All notable changes to MAC (Music Assistant Controller) are documented here.

## [Unreleased]

### Added
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
