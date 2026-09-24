# Changelog

All notable changes to MAC (Music Assistant Controller) are documented here.

## [Unreleased]

### Added
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
