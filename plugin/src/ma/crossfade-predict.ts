import type { PlayerQueue, QueueItem } from "music-assistant-client";

/**
 * Assumed length of MA's audio crossfade. With "Smart Fades" MA picks it per transition from its
 * audio analysis and doesn't report it, so keys can only approximate.
 */
export const PREDICTED_FADE_S = 8;

/**
 * In flow mode MA reports the next track only once its audio crossfade is over (measured on Sonos
 * 2026-09-26: "playing for 8 s" at the first report), so a cover that waits for that report comes
 * late. MA does publish the next item up front, so keys can start fading its cover in over the
 * last seconds of the current track instead. Returns the next item and how far (0..1) the fade
 * should be, or undefined when no crossfade is coming (no flow mode, crossfade off, same album —
 * MA doesn't crossfade those by default — or not near the end yet).
 */
export function upcomingCrossfade(queue: PlayerQueue, elapsed: number): { next: QueueItem; mix: number } | undefined {
    if (queue.state !== "playing" || !queue.crossfade_enabled || queue.flow_mode !== true) return undefined;
    const current = queue.current_item;
    const next = queue.next_item;
    const duration = current?.duration;
    if (!current || !next || !duration || next.queue_item_id === current.queue_item_id || sameAlbum(current, next)) return undefined;
    const remaining = duration - elapsed;
    // Past the end MA is still reporting the old track (the late report) — keep showing the next one.
    if (remaining > PREDICTED_FADE_S || remaining < -2 * PREDICTED_FADE_S) return undefined;
    return { next, mix: Math.min(1, Math.max(0, 1 - remaining / PREDICTED_FADE_S)) };
}

function sameAlbum(a: QueueItem, b: QueueItem): boolean {
    const albumOf = (i: QueueItem) => (i.media_item as { album?: { item_id?: string; provider?: string; name?: string } | null } | null | undefined)?.album;
    const x = albumOf(a);
    const y = albumOf(b);
    if (!x || !y) return false;
    if (x.item_id && y.item_id) return x.item_id === y.item_id && x.provider === y.provider;
    return !!x.name && x.name === y.name;
}
