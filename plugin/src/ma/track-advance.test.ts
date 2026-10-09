import { describe, expect, it } from "vitest";
import type { PlayerQueue, QueueItem } from "music-assistant-client";
import { TrackAdvance } from "./track-advance";

const item = (id: string, duration = 100): QueueItem => ({ queue_item_id: id, name: id, duration });
const A = item("A", 100);
const B = item("B", 200);
const C = item("C", 300);

/** A queue as MA reports it: `current` at `elapsed` seconds, reported at time `at`. */
const q = (current: QueueItem, elapsed: number, at: number, extra: Partial<PlayerQueue> = {}): PlayerQueue =>
    ({
        queue_id: "q",
        state: "playing",
        current_index: current === A ? 0 : current === B ? 1 : 2,
        current_item: current,
        next_item: current === A ? B : current === B ? C : null,
        elapsed_time: elapsed,
        elapsed_time_last_updated: at,
        ...extra,
    }) as PlayerQueue;

describe("TrackAdvance", () => {
    it("passes MA's report through while the track runs", () => {
        const t = new TrackAdvance();
        expect(t.view(q(A, 10, 1000), 1005).current_item).toBe(A);
    });

    it("shows the next track once the current one reached its length (MA's report comes ~25 s late)", () => {
        const t = new TrackAdvance();
        t.view(q(A, 90, 1000), 1000);
        // A ends at 1010; at 1015 MA still says A
        const v = t.view(q(A, 90, 1000), 1015);
        expect(v.current_item).toBe(B);
        expect(v.current_index).toBe(1);
        expect(v.next_item).toBeNull();
        expect(v.elapsed_time).toBeCloseTo(5);
        expect(t.view(q(A, 90, 1000), 1035).current_item).toBe(B);
    });

    it("takes MA's confirmation as the new anchor", () => {
        const t = new TrackAdvance();
        t.view(q(A, 90, 1000), 1000);
        t.view(q(A, 90, 1000), 1015);
        const v = t.view(q(B, 26, 1036), 1036);
        expect(v.current_item).toBe(B);
        expect(v.elapsed_time).toBe(26);
    });

    it("tells when to look again: at the predicted end", () => {
        const t = new TrackAdvance();
        t.view(q(A, 90, 1000), 1000);
        expect(t.nextChangeIn(q(A, 90, 1000), 1004)).toBeCloseTo(6);
        expect(t.nextChangeIn(q(A, 90, 1000, { state: "paused" }), 1004)).toBeUndefined();
    });

    it("keeps the new track after a skip when MA falls back to the old one, its time running on", () => {
        const t = new TrackAdvance();
        t.view(q(A, 40, 1000), 1000);
        // skip: MA shows B at once
        expect(t.view(q(B, 0, 1001), 1001).current_item).toBe(B);
        // ~2 s later MA reports A again at 43 s (the speaker's late report)
        const v = t.view(q(A, 43, 1003), 1003);
        expect(v.current_item).toBe(B);
        expect(v.elapsed_time).toBeCloseTo(2);
        // still held 30 s on
        expect(t.view(q(A, 43, 1003), 1031).current_item).toBe(B);
    });

    it("lets the old track back after the hold, and a real 'previous' at once", () => {
        const t = new TrackAdvance(45);
        t.view(q(A, 40, 1000), 1000);
        t.view(q(B, 0, 1001), 1001);
        expect(t.view(q(A, 90, 1050), 1050).current_item).toBe(A);

        const u = new TrackAdvance();
        u.view(q(A, 40, 1000), 1000);
        u.view(q(B, 0, 1001), 1001);
        // previous: A restarts near 0
        expect(u.view(q(A, 0.5, 1010), 1010).current_item).toBe(A);
    });

    it("doesn't predict while paused, with repeat one, or at the end of the queue", () => {
        const t = new TrackAdvance();
        expect(t.view(q(A, 90, 1000, { state: "paused" }), 1050).current_item).toBe(A);
        expect(new TrackAdvance().view(q(A, 90, 1000, { repeat_mode: "one" }), 1050).current_item).toBe(A);
        expect(new TrackAdvance().view(q(C, 290, 1000), 1050).current_item).toBe(C);
    });

    it("forgets a queue without a current item", () => {
        const t = new TrackAdvance();
        t.view(q(A, 90, 1000), 1000);
        const empty = { ...q(A, 0, 1000), current_item: null } as unknown as PlayerQueue;
        expect(t.view(empty, 1015).current_item).toBeNull();
        expect(t.nextChangeIn(q(A, 90, 1000), 1001)).toBeUndefined();
    });
});
