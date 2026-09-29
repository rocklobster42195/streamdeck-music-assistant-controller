// Audio levels from deckbus for the Panorama: one subscription per source however many dials use
// it, turned from dBFS into a smoothed strength 0..1 (fast up, slower down) relative to how loud
// the source has been lately (AutoRange: a quiet mixer channel moves the effect too). A source that goes
// quiet on the bus (plugin closed, mixer offline) falls back to "no level" — the effect then moves
// as it does without an audio source.
import { AutoRange } from "./auto-range";
import { macBus, parseSourceId } from "./mac-bus";

type Listener = (level: number | undefined) => void;
type Source = { unsubscribe: () => void; listeners: Set<Listener>; range: AutoRange; level: number; lastAt: number; timer: ReturnType<typeof setInterval> };

const ATTACK = 0.6;
const RELEASE = 0.15;
/** Without data for this long the source counts as gone. */
const STALE_MS = 1500;

const sources = new Map<string, Source>();

/** The level of a meter message `{ l, r? }` in dBFS (the louder side), or undefined. */
export function levelOf(data: unknown): number | undefined {
    const m = data as { l?: unknown; r?: unknown } | undefined;
    const sides = [m?.l, m?.r].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return sides.length ? Math.max(...sides) : undefined;
}

/**
 * Follow the level of a source (`<peer id>|<topic>`); returns a function that stops. The listener
 * gets undefined when the source has no data (yet, or any more).
 */
export function watchLevel(sourceId: string, listener: Listener): () => void {
    const bus = macBus();
    const parsed = parseSourceId(sourceId);
    if (!bus || !parsed) {
        listener(undefined);
        return () => {};
    }
    let source = sources.get(sourceId);
    if (!source) {
        const created: Source = {
            listeners: new Set(),
            range: new AutoRange(),
            level: 0,
            lastAt: 0,
            unsubscribe: bus.subscribe(parsed.topic, (data, from) => {
                if (from.id !== parsed.peerId) return;
                const db = levelOf(data);
                if (db === undefined) return;
                const target = created.range.strength(db);
                created.level += (target - created.level) * (target > created.level ? ATTACK : RELEASE);
                created.lastAt = Date.now();
                for (const fn of created.listeners) fn(created.level);
            }),
            timer: setInterval(() => {
                if (created.lastAt && Date.now() - created.lastAt > STALE_MS) {
                    created.lastAt = 0;
                    created.level = 0;
                    for (const fn of created.listeners) fn(undefined);
                }
            }, 500),
        };
        sources.set(sourceId, (source = created));
    }
    source.listeners.add(listener);
    const active = source;
    return () => {
        active.listeners.delete(listener);
        listener(undefined);
        if (active.listeners.size || sources.get(sourceId) !== active) return;
        active.unsubscribe();
        clearInterval(active.timer);
        sources.delete(sourceId);
    };
}
