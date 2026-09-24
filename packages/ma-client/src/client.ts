import { MusicAssistantConnection } from './connection.js';
import { snapImageSize } from './images.js';
import type { DashboardEndpoint, DashboardSession, DashboardType, MediaItem, QueueItem, RepeatMode } from './types.js';

/**
 * Client for the Music Assistant WebSocket API: the connection (see connection.ts) plus typed
 * convenience commands.
 *
 * UI-agnostic: no Stream Deck imports, so it can be reused elsewhere (e.g. JSA) and published to npm.
 */
export class MusicAssistantClient extends MusicAssistantConnection {
    // ---- convenience commands -------------------------------------------------------------

    playPause(queueId: string) { return this.send<null>('player_queues/play_pause', { queue_id: queueId }); }
    play(queueId: string) { return this.send<null>('player_queues/play', { queue_id: queueId }); }
    pause(queueId: string) { return this.send<null>('player_queues/pause', { queue_id: queueId }); }
    stopPlayback(queueId: string) { return this.send<null>('player_queues/stop', { queue_id: queueId }); }
    next(queueId: string) { return this.send<null>('player_queues/next', { queue_id: queueId }); }
    previous(queueId: string) { return this.send<null>('player_queues/previous', { queue_id: queueId }); }
    seek(queueId: string, position: number) { return this.send<null>('player_queues/seek', { queue_id: queueId, position }); }
    setShuffle(queueId: string, enabled: boolean) { return this.send<null>('player_queues/shuffle', { queue_id: queueId, shuffle_enabled: enabled }); }
    setRepeat(queueId: string, mode: RepeatMode) { return this.send<null>('player_queues/repeat', { queue_id: queueId, repeat_mode: mode }); }
    setCrossfade(queueId: string, enabled: boolean) { return this.send<null>('player_queues/crossfade', { queue_id: queueId, crossfade_enabled: enabled }); }
    /** "Don't stop the music". */
    setAutoplay(queueId: string, enabled: boolean) { return this.send<null>('player_queues/autoplay', { queue_id: queueId, autoplay_enabled: enabled }); }
    transferQueue(sourceQueueId: string, targetQueueId: string, autoPlay?: boolean) {
        return this.send<null>('player_queues/transfer', {
            source_queue_id: sourceQueueId,
            target_queue_id: targetQueueId,
            ...(autoPlay === undefined ? {} : { auto_play: autoPlay }),
        });
    }
    /** Play one or more media items / URIs. `option`: play | replace | next | replace_next | add. */
    playMedia(queueId: string, media: string | string[], option?: string) {
        return this.send<null>('player_queues/play_media', { queue_id: queueId, media, ...(option ? { option } : {}) });
    }

    setVolume(playerId: string, level: number) {
        return this.send<null>('players/cmd/volume_set', { player_id: playerId, volume_level: Math.round(Math.min(100, Math.max(0, level))) });
    }
    volumeUp(playerId: string) { return this.send<null>('players/cmd/volume_up', { player_id: playerId }); }
    volumeDown(playerId: string) { return this.send<null>('players/cmd/volume_down', { player_id: playerId }); }
    setMute(playerId: string, muted: boolean) { return this.send<null>('players/cmd/volume_mute', { player_id: playerId, muted }); }
    /** "Like": add the currently playing item to the MA favorites. */
    addCurrentlyPlayingToFavorites(playerId: string) {
        return this.send<null>('players/add_currently_playing_to_favorites', { player_id: playerId });
    }

    /** Queue items, paged. */
    queueItems(queueId: string, limit = 50, offset = 0) {
        return this.send<QueueItem[]>('player_queues/items', { queue_id: queueId, limit, offset });
    }
    /** Jump to (and play) the item at `index` — or with that queue_item_id — in the queue. */
    playIndex(queueId: string, index: number | string) {
        return this.send<null>('player_queues/play_index', { queue_id: queueId, index });
    }
    setGroupVolume(playerId: string, level: number) {
        return this.send<null>('players/cmd/group_volume', { player_id: playerId, volume_level: Math.round(Math.min(100, Math.max(0, level))) });
    }
    /** Group `playerIds` with `targetPlayerId` as leader. */
    groupPlayers(targetPlayerId: string, playerIds: string[]) {
        return this.send<null>('players/cmd/set_members', { target_player: targetPlayerId, player_ids_to_add: playerIds });
    }
    ungroup(playerId: string) {
        return this.send<null>('players/cmd/ungroup', { player_id: playerId });
    }
    setGroupMute(playerId: string, muted: boolean) {
        return this.send<null>('players/cmd/group_volume_mute', { player_id: playerId, muted });
    }

    /** Stop playback after `seconds`. Returns the expiry time (epoch seconds). */
    setSleepTimer(playerId: string, seconds: number) {
        return this.send<number>('players/sleep_timer/set', { player_id: playerId, seconds: Math.round(seconds) });
    }
    clearSleepTimer(playerId: string) {
        return this.send<null>('players/sleep_timer/clear', { player_id: playerId });
    }
    /** Speak `message` (TTS) or play `url` as an announcement on a player. */
    playAnnouncement(playerId: string, opts: { message?: string; url?: string; ttsEngine?: string; language?: string; volume?: number; preAnnounce?: boolean }) {
        return this.send<null>('players/cmd/play_announcement', {
            player_id: playerId,
            ...(opts.message ? { message: opts.message } : {}),
            ...(opts.url ? { url: opts.url } : {}),
            ...(opts.ttsEngine ? { tts_engine: opts.ttsEngine } : {}),
            ...(opts.language ? { language: opts.language } : {}),
            ...(typeof opts.volume === 'number' ? { volume_level: Math.round(opts.volume) } : {}),
            ...(typeof opts.preAnnounce === 'boolean' ? { pre_announce: opts.preAnnounce } : {}),
        });
    }
    ttsEngines() {
        return this.send<{ uid: string; name: string }[]>('players/tts_engines');
    }
    selectSource(playerId: string, source: string) {
        return this.send<null>('players/cmd/select_source', { player_id: playerId, source });
    }
    /** Registered dashboard endpoints (e.g. a Chromecast TV). */
    dashboards() {
        return this.send<DashboardEndpoint[]>('dashboard/dashboards');
    }
    dashboardSessions() {
        return this.send<DashboardSession[]>('dashboard/sessions');
    }
    /** Casting starts an app on the target (e.g. a Chromecast) — that can take well over 10 s. */
    showDashboard(dashboardId: string, dashboard: DashboardType, playerId?: string) {
        return this.send<null>('dashboard/show', { dashboard_id: dashboardId, dashboard, ...(playerId ? { player_id: playerId } : {}) }, { timeoutMs: 60_000 });
    }
    hideDashboard(dashboardId: string) {
        return this.send<null>('dashboard/hide', { dashboard_id: dashboardId }, { timeoutMs: 30_000 });
    }

    /** Fetch a media item by URI; provider URIs resolve to the library item when it exists. */
    itemByUri(uri: string) {
        return this.send<MediaItem>('music/item_by_uri', { uri });
    }
    addFavorite(uri: string) {
        return this.send<null>('music/favorites/add_item', { item: uri });
    }
    removeFavorite(mediaType: string, libraryItemId: string | number) {
        return this.send<null>('music/favorites/remove_item', { media_type: mediaType, library_item_id: libraryItemId });
    }

    // ---- helpers ----------------------------------------------------------------------------

    /**
     * URL that fetches an image through the MA image proxy (`/imageproxy/<proxy_id>?size=`).
     * `proxyId` is `MediaItemImage.proxy_id`; `size` is snapped up to a size the server accepts.
     */
    imageProxyUrl(proxyId: string, size = 0): string {
        return `${this.url.replace(/\/$/, '')}/imageproxy/${proxyId}?size=${snapImageSize(size)}`;
    }

    /**
     * Normalize an image URL as found in `current_media.image_url`: MA proxy URLs get the requested
     * size, relative URLs are made absolute, and external URLs are returned unchanged.
     */
    resolveImageUrl(imageUrl: string, size = 0): string {
        const base = this.url.replace(/\/$/, '');
        const url = new URL(imageUrl, base + '/');
        if (url.pathname.startsWith('/imageproxy/')) url.searchParams.set('size', String(snapImageSize(size)));
        return url.toString();
    }
}
