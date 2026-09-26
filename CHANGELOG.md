# Changelog

All notable changes to MAC (Music Assistant Controller) are documented here.

## [Unreleased]

### Changed
- Queue, Browser and Player dials can show a panorama effect as their background too (dimmed), so every dial can be part of one continuous scene.
- Panorama effects: changing the effect on one display now switches all connected displays of that scene (Track/Volume dial backgrounds included), instead of splitting that display off. Choosing no effect spreads too. Can be turned off per dial ("Apply to connected displays") to change a single display.
- Larger icons on the keys, as in Sonos Controller.
- Volume key: the mute key shows the volume as a ring (like the Volume dial); muted, the ring turns grey with a red muted speaker inside. The volume number can be turned off ("Show volume").

### Fixed
- Key colors are consistent: blue = on, grey = off (shuffle, repeat, crossfade, "Don't stop the music", sleep timer, inactive player/source/screen), dark = not available right now (e.g. skip on a radio stream).
- Play/Pause and other keys show the right state when playback was started outside Music Assistant (e.g. in the Sonos app); Play/Pause then controls the player directly.
- Play/Pause title: scrolls exactly like Sonos Controller again. The fade-out starts with the end of the title well in view instead of while the last letters are still coming in. Animation frames no longer resend the key title or flood an open settings panel.
- Volume and Group Volume dials with the ring in the cover color: the color glides to the next track's instead of flashing blue in between.
- A newly placed dial takes over the effect of the dial next to it, and a new Panorama dial also its title/lyrics line, timing and player, so it joins the scene right away.
- Play/Pause key: when the track changes, the key keeps the old cover until the new one has loaded and then crossfades to it (as in Sonos Controller). Before, it briefly showed a music-note icon. Dials keep the old cover while the new one loads, too.
- Keys no longer flash their paused look on every track change. Sonos reports "idle" for about a second after each skip; a queue that was playing a moment ago now counts as playing for another 2.5 s. Pausing from a key still shows right away.
- Playback positions (progress bars, lyrics, seeking) are extrapolated on the Music Assistant server's clock: `music-assistant-client` measures the offset on connect (`time` command, `clockOffset`, `serverNow()`). A local clock running ahead made lyrics appear early. Position-only updates (`queue_time_updated`) are stamped on the same clock, so the lyrics timing no longer jumps by the clock offset depending on which event came last.
- Player picker and dropdowns in the settings panels: a click on the text or icon opened the list and closed it again right away.

### Added
- Browser dial: **Services** setting, a switch per music service. Only the chosen ones show up in the provider list and in the library folders (favorites, playlists, albums …), e.g. only Spotify instead of every file playlist.
- Panorama dial: **No effect** option, for title or lyrics on black. Neighbouring dials without an effect still share one line of text.
- Panorama dial with lyrics: turning adjusts the lyrics timing in 0.1 s steps (a scale with the zero point shows it at the top), tapping the display re-syncs the lyrics with Music Assistant. Pushing switches between the lyrics timing and the effect's own values (particle count, speed, density); a small badge shows which one turning changes.
- Play/Pause key: in flow mode with crossfade, the next cover starts fading in over the last 8 s of a track, as Music Assistant only reports the new track after its audio crossfade. With Smart Crossfade the real fade can start earlier, so the cover may still come a little late.
- Crossfade key: its settings show whether Music Assistant's flow mode is on for the player and can switch it. Crossfade only works in flow mode; the settings also explain the same-album rule and possible problems with Spotify.
- Volume and Group Volume dials: **Ring in cover color** option.
- Panorama dial: a **Player** setting (default: active player). The text, the lyrics, the cover color and the settings panel header follow that player; neighbouring Panorama dials share it.
- Key titles now use Sonos Controller's fade effect (`TitleFader` in `streamdeck-core`): the band fades in, then the text while it starts scrolling; it scrolls in even 80 ms steps and fades out in reverse, then pauses. The Play/Pause key shows "Title [Artist]" as in Sonos Controller, in a slightly brighter color.
- `music-assistant-client` is ready for npm: own README, CHANGELOG and LICENSE, package metadata, a clean ESM build without stale files, `isServerNewer`, and a separate release path (`npm run client:release:*`, `tools/release-client.mjs`, workflow **Publish client** on `ma-client-v*` tags). Checked by installing the packed tarball into a fresh project and compiling the README examples there.
- `music-assistant-client`: about 30 new convenience methods: search, browse, library listings, album/playlist/podcast tracks, recommendations, listening history (`inProgressItems`, `markPlayed`, `markUnplayed`), queue editing (`clearQueue`, `removeQueueItem`, `moveQueueItem`, `saveQueueAsPlaylist`), `skipSeconds`, `setPlaybackSpeed`, `playerByName`, power, playlists and party mode. All commands now go through the typed `call()`, so their arguments are checked against the API docs. The client is split into `commands/playback.ts`, `library.ts` and `extras.ts`.
- `music-assistant-client`: the **complete API, typed**. All 127 data models (`MA.Track`, `MA.Player`, …) and all 310 commands with their arguments and results are generated from Music Assistant's own API docs (`npm run gen:api`, `tools/ma-api/`). The new `call(command, args)` checks both at compile time. CI now also typechecks the client and verifies that the generated files are current.
- **Continue Listening** key: resumes the latest audiobook or podcast episode where you left off (MA keeps the position); a second press pauses. It shows the cover, a scrolling title and the progress, and can be limited to audiobooks or podcasts.
- Browser dial: a **Continue listening** folder at the top.
- The Play/Pause key's scrolling title is now a shared helper (`render/key-title.ts`). The "now playing" tag on cover keys moves to the top corner when a title band is shown.
- **Panorama dial text**: show the **title** (fading on song changes, as in Sonos Controller) or **synced lyrics** over the effect. Lyrics come from Music Assistant's metadata providers (LRCLIB) and stretch across neighbouring Panorama dials. The next song's lyrics load ahead of time, there is a timing offset for speaker latency, and it falls back to title and artist when there are no lyrics.
- `music-assistant-client`: `trackLyrics()`, `parseLrc()` and `lyricIndexAt()`. `streamdeck-core`: `PanoramaEngine.members()`.
- **Release pipeline** with beta channel: `npm run ship:beta|patch|minor|major` bumps the version, tags, and creates the GitHub release (betas as pre-releases). The Release workflow attaches the versioned `.streamDeckPlugin`, and a CI workflow checks every push and pull request. Release packages leave out the Node debug port.
- **Contributor guide**: `CONTRIBUTING.md` (bug reports, dev setup, testing without hardware, conventions, pull requests) and `CONTRIBUTING_EFFECTS.md` (writing a panorama effect for `streamdeck-core`), plus GitHub issue forms (bug, feature, translation) and a pull request template.
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
- Settings panels: a compact header (action name, player status, what plays) instead of the large key/dial image — the Stream Deck app already shows keys and dial displays live.
- Dials with an effect background (Track, Volume, Group Volume, and the lyrics on the Panorama dial) darken only behind the number and each line of text, not the whole strip.
- Lyrics timing range widened to −10 … +5 s, default +0.5 s (the line appears just before it is sung).
- Lyrics keep a 16 px margin on each side and step down 22 → 20 → 18 px (two lines) before using three lines. `streamdeck-core` now has exact Arial **Bold** metrics (`measureArialWidth(text, size, bold)`, also in `truncateToWidth`/`wrapToWidth`/`balanceLines`/`TitleFader`) instead of a width estimate that let long bold lines overflow.
- Lyrics look: plain white text without the outline, long lines split into even halves at full size (breaks after punctuation preferred; `balanceLines` in `streamdeck-core`) instead of a smaller font, and a larger, brighter next line.
- Cover colors (effects, progress bars, rings) skip MA's palette accent when it is too dark to see on black (grey-scale covers have a near-black accent) and use the palette's primary or on-dark color instead.
- Scrolling text on the dials moves in whole ticks (2 px every 80 ms) instead of following the clock, which stuttered on hardware when frames arrived late. The shared frame ticker runs at 80 ms.
- Simulator scenarios refuse to run when the test player is grouped or playing (`assertTestPlayerFree`, `SIM_FORCE=1` overrides).
- `music-assistant-client`: `RepeatMode`, `PlaybackState`, `DashboardType` and `MediaType` now come from the generated models (strict unions instead of open strings). Results of the convenience methods use the generated models (e.g. `queueItems()` returns `MA.QueueItem[]`). The generator turns Python `**kwargs` into "extra arguments allowed" instead of a required `kwargs` parameter.
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
