import streamDeck from "@elgato/streamdeck";
import { parseLrc, type LyricLine, type MediaItem, type PlayerQueue } from "music-assistant-client";
import { maConnection } from "./connection";

/** Synced lyrics of one track: still loading, none available, or the timed lines. */
export type LyricsState = { status: "loading" } | { status: "none" } | { status: "ok"; lines: LyricLine[] };

const MAX_TRACKS = 50;
const RETRY_AFTER_ERROR_MS = 60_000;

/**
 * Synced (LRC) lyrics per track, fetched through MA's metadata providers. Asking for a queue's
 * current track also prefetches the next one: the first lookup of a track can take ~30 s, so it
 * is usually ready by the time the song starts. Plain (untimed) lyrics count as "none".
 */
class LyricsStore {
    private readonly tracks = new Map<string, LyricsState>();
    private readonly listeners = new Set<() => void>();

    /** Called whenever a lookup finishes. */
    onUpdate(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Lyrics for what `queue` plays now, or undefined when that isn't a track (radio, nothing). */
    forQueue(queue: PlayerQueue | undefined): LyricsState | undefined {
        const current = track(queue?.current_item?.media_item);
        const next = track(queue?.next_item?.media_item);
        if (next) this.lookup(next);
        return current ? this.lookup(current) : undefined;
    }

    private lookup(item: MediaItem): LyricsState {
        const known = this.tracks.get(item.uri);
        if (known) return known;
        const ma = maConnection.ma;
        if (!ma) return { status: "loading" }; // not cached: retried once connected
        const loading: LyricsState = { status: "loading" };
        this.remember(item.uri, loading);
        ma.trackLyrics(item)
            .then(({ lrc }) => {
                const lines = lrc ? parseLrc(lrc) : [];
                this.remember(item.uri, lines.length ? { status: "ok", lines } : { status: "none" });
            })
            .catch((e) => {
                streamDeck.logger.warn(`[lyrics] lookup failed for ${item.uri}`, e);
                this.remember(item.uri, { status: "none" });
                setTimeout(() => this.tracks.delete(item.uri), RETRY_AFTER_ERROR_MS);
            })
            .finally(() => this.listeners.forEach((l) => l()));
        return loading;
    }

    private remember(uri: string, state: LyricsState): void {
        this.tracks.delete(uri); // re-insert = most recently used
        this.tracks.set(uri, state);
        if (this.tracks.size > MAX_TRACKS) this.tracks.delete(this.tracks.keys().next().value!);
    }
}

function track(item: MediaItem | null | undefined): MediaItem | undefined {
    return item?.media_type === "track" ? item : undefined;
}

export const lyrics = new LyricsStore();
