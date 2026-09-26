import { describe, expect, it } from "vitest";
import type { PlayerQueue, QueueItem } from "music-assistant-client";
import { PREDICTED_FADE_S, upcomingCrossfade } from "./crossfade-predict";

const item = (id: string, album: string, duration = 200): QueueItem => ({ queue_item_id: id, name: id, duration, media_item: { album: { item_id: album, provider: "p", name: album } } as never });
const queue = (over: Partial<PlayerQueue> = {}): PlayerQueue =>
    ({ queue_id: "q", state: "playing", crossfade_enabled: true, flow_mode: true, current_item: item("a", "A"), next_item: item("b", "B"), ...over }) as PlayerQueue;

describe("upcomingCrossfade", () => {
    it("fades the next cover in over the last seconds of the track", () => {
        expect(upcomingCrossfade(queue(), 150)).toBeUndefined();
        expect(upcomingCrossfade(queue(), 200 - PREDICTED_FADE_S)?.mix).toBeCloseTo(0);
        expect(upcomingCrossfade(queue(), 200 - PREDICTED_FADE_S / 2)?.mix).toBeCloseTo(0.5);
        expect(upcomingCrossfade(queue(), 203)?.mix).toBe(1); // MA's report comes late
    });

    it("predicts nothing without flow mode or crossfade, or within one album", () => {
        expect(upcomingCrossfade(queue({ flow_mode: false }), 196)).toBeUndefined();
        expect(upcomingCrossfade(queue({ crossfade_enabled: false }), 196)).toBeUndefined();
        expect(upcomingCrossfade(queue({ next_item: item("b", "A") }), 196)).toBeUndefined();
        expect(upcomingCrossfade(queue({ state: "paused" }), 196)).toBeUndefined();
    });
});
