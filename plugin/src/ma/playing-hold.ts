/**
 * Bridges short "not playing" gaps the server reports while music keeps going. Measured on Sonos
 * (2026-09-26): every skip makes MA report the queue `idle` for ~1–1.5 s about 2.5 s after the
 * skip (Sonos restarts the stream), so keys flashed their paused look (dimmed, play icon) on
 * every track change. A queue that was playing a moment ago keeps counting as playing for
 * `holdMs`; a pause or stop the user just triggered is shown right away (see {@link suppress}).
 */
export class PlayingHold {
    private readonly lastPlaying = new Map<string, number>();
    private readonly suppressedUntil = new Map<string, number>();

    constructor(
        private readonly holdMs = 2500,
        private readonly now: () => number = Date.now,
    ) {}

    /** The server reported this queue as playing. */
    notePlaying(queueId: string): void {
        this.lastPlaying.set(queueId, this.now());
    }

    /** The user paused/stopped: don't bridge anything for this queue for a while. */
    suppress(queueId: string, ms = 5000): void {
        this.lastPlaying.delete(queueId);
        this.suppressedUntil.set(queueId, this.now() + ms);
    }

    /** Milliseconds this queue should still be shown as playing although it isn't (0 = not held). */
    remaining(queueId: string): number {
        const now = this.now();
        if ((this.suppressedUntil.get(queueId) ?? 0) > now) return 0;
        const last = this.lastPlaying.get(queueId);
        return last === undefined ? 0 : Math.max(0, last + this.holdMs - now);
    }
}
