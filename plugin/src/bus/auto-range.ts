// Turns levels in dBFS into a strength 0..1 relative to how loud the source has been lately, so
// the Panorama reacts the same to a hot mixer channel (-12 dBFS peaks) and a quiet one (-45).
// The top follows new peaks at once and sinks slowly; the strength spans the RANGE below it.

/** dB below the recent top that map to 0..1. */
const RANGE = 30;
/** How fast the top sinks when it gets quieter (dB per second). */
const FALL_DB_PER_S = 2;
/** Below this there is nothing to react to (noise, silence). */
const SILENCE_DB = -75;

export class AutoRange {
    private top: number | undefined;
    private lastAt = 0;

    /** Strength 0..1 for a level in dBFS at time `now` (ms). */
    strength(db: number, now = Date.now()): number {
        if (!Number.isFinite(db) || db <= SILENCE_DB) {
            this.sink(now);
            return 0;
        }
        this.sink(now);
        if (this.top === undefined || db > this.top) this.top = db;
        return Math.min(1, Math.max(0, (db - (this.top - RANGE)) / RANGE));
    }

    private sink(now: number): void {
        if (this.top !== undefined && this.lastAt) this.top = Math.max(SILENCE_DB + RANGE / 2, this.top - (FALL_DB_PER_S * (now - this.lastAt)) / 1000);
        this.lastAt = now;
    }
}
