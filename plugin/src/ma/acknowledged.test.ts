import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledged } from "./acknowledged";

const log = () => ({ info: vi.fn(), warn: vi.fn() });
afterEach(() => vi.useRealTimers());

describe("acknowledged", () => {
    it("returns when the call answers in time", async () => {
        const l = log();
        await acknowledged(Promise.resolve("ok"), "next", l);
        expect(l.info).not.toHaveBeenCalled();
    });

    it("lets a quick refusal through", async () => {
        const l = log();
        await expect(acknowledged(Promise.reject(new Error("not connected")), "next", l)).rejects.toThrow("not connected");
    });

    it("a slow answer is no error: it returns after the wait and finishes in the background", async () => {
        vi.useFakeTimers();
        const l = log();
        let answer!: () => void;
        const call = new Promise<void>((r) => (answer = r));
        const waited = acknowledged(call, "play_index", l, 2500);
        await vi.advanceTimersByTimeAsync(2500);
        await expect(waited).resolves.toBeUndefined();
        answer();
        await vi.advanceTimersByTimeAsync(0);
        expect(l.info).toHaveBeenCalledWith(expect.stringContaining("play_index answered after"));
    });

    it("a slow refusal is logged, not thrown", async () => {
        vi.useFakeTimers();
        const l = log();
        let fail!: (e: Error) => void;
        const call = new Promise<void>((_, r) => (fail = r));
        const waited = acknowledged(call, "next", l, 1000);
        await vi.advanceTimersByTimeAsync(1000);
        await waited;
        fail(new Error("boom"));
        await vi.advanceTimersByTimeAsync(0);
        expect(l.warn).toHaveBeenCalled();
    });
});
