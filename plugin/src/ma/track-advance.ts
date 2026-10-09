import { currentElapsed, type PlayerQueue, type QueueItem } from "music-assistant-client";

/**
 * Shows the track that really plays, also while MA still reports the one before. Measured
 * 2026-10-09 with a Sonos group (tools/ma-latency.mjs, SO-C's tools/sonos-local-latency.mjs): the
 * speaker tells MA about a new track from MA's cloud queue only 18–40 s after it began (MA's web
 * player: under 1 s), so MA — and every key, cover, colour and lyric — showed the old track for
 * ~25 s at every natural change. After a skip MA shows the new track at once, then falls back to
 * the old one for ~12 s (the speaker's late report), sometimes while the old one really still
 * plays (~20 s).
 *
 * Two rules, per queue:
 * - **Predict:** a playing track that reached its length is over; the queue's next item is shown,
 *   its time counting from the old one's end (measured: within ±1 s of the real change).
 * - **Keep going forward:** once a newer track is shown, a report of the one before is ignored for
 *   a while if its time runs on (the late report). A real "previous" restarts it near 0 s and is
 *   shown at once. The user chose "sometimes a little early" over "often 12 s late".
 */
export class TrackAdvance {
    private readonly shown = new Map<string, Shown>();

    constructor(
        /** How long a report of the previous track is ignored after a change (s). */
        private readonly holdS = 45,
        /** A previous track reported below this time is a real "previous", not a late report (s). */
        private readonly restartS = 3,
    ) {}

    /** The queue as the keys should show it at `now` (server seconds). */
    view(queue: PlayerQueue, now: number): PlayerQueue {
        const current = queue.current_item;
        if (!current) {
            this.shown.delete(queue.queue_id);
            return queue;
        }
        const elapsed = currentElapsed(queue, now);
        let s = this.shown.get(queue.queue_id);
        // The track before the one shown, its time running on: the speaker's late report
        if (
            s &&
            queue.state === "playing" &&
            current.queue_item_id === s.previousId &&
            now < s.holdUntil &&
            elapsed > this.restartS
        ) {
            return this.predictFrom(queue, s, now) ?? held(queue, s, now);
        }
        if (!s || s.itemId !== current.queue_item_id) {
            s = { itemId: current.queue_item_id, index: queue.current_index ?? 0, item: current, next: queue.next_item, startedAt: now - elapsed, previousId: s?.itemId, holdUntil: now + this.holdS };
            this.shown.set(queue.queue_id, s);
        } else {
            // What MA says about the shown track is the best anchor for its time
            s.item = current;
            s.next = queue.next_item;
            s.startedAt = now - elapsed;
        }
        return this.predictFrom(queue, s, now) ?? queue;
    }

    /** Seconds until the shown track may change by itself (its predicted end), if it can. */
    nextChangeIn(queue: PlayerQueue, now: number): number | undefined {
        const s = this.shown.get(queue.queue_id);
        const duration = s?.item.duration;
        if (!s || queue.state !== "playing" || !duration || !s.next || s.next.queue_item_id === s.itemId) return undefined;
        const left = s.startedAt + duration - now;
        return left > 0 ? left : undefined;
    }

    /** The shown track ended (by its length) and a next one is known: show that one. */
    private predictFrom(queue: PlayerQueue, s: Shown, now: number): PlayerQueue | undefined {
        const duration = s.item.duration;
        const next = s.next;
        if (queue.state !== "playing" || !duration || !next || next.queue_item_id === s.itemId || queue.repeat_mode === "one") return undefined;
        if (now < s.startedAt + duration) return undefined;
        const predicted: Shown = { itemId: next.queue_item_id, index: s.index + 1, item: next, next: undefined, startedAt: s.startedAt + duration, previousId: s.itemId, holdUntil: now + this.holdS };
        this.shown.set(queue.queue_id, predicted);
        return held(queue, predicted, now);
    }
}

/**
 * Where Next/Previous should go when MA's own index lags the shown track (the late report after a
 * skip): MA counts from its index, so a second Next within ~12 s of the first only restarted the
 * same track (seen 2026-10-09). Undefined: MA's own next/previous is right.
 */
export function skipIndex(reported: PlayerQueue, shown: PlayerQueue, command: "next" | "previous"): number | undefined {
    const at = shown.current_index;
    if (at === null || at === undefined || at === reported.current_index) return undefined;
    const to = command === "next" ? at + 1 : at - 1;
    return to >= 0 && (!reported.items || to < reported.items) ? to : undefined;
}

type Shown = {
    itemId: string;
    index: number;
    item: QueueItem;
    /** The item after it, as MA reported it (unknown for a predicted one). */
    next: QueueItem | null | undefined;
    /** When it began (server seconds). */
    startedAt: number;
    /** The track shown before it. */
    previousId: string | undefined;
    /** Until when a report of the previous track counts as late. */
    holdUntil: number;
};

function held(queue: PlayerQueue, s: Shown, now: number): PlayerQueue {
    return { ...queue, current_item: s.item, current_index: s.index, next_item: s.next ?? null, elapsed_time: Math.max(0, now - s.startedAt), elapsed_time_last_updated: now };
}
