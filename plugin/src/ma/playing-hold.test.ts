import { describe, expect, it } from "vitest";
import { PlayingHold } from "./playing-hold";

describe("PlayingHold", () => {
    it("keeps a queue playing for holdMs after the last playing report", () => {
        let t = 0;
        const hold = new PlayingHold(2500, () => t);
        hold.notePlaying("q");
        t = 1000;
        expect(hold.remaining("q")).toBe(1500);
        t = 2600;
        expect(hold.remaining("q")).toBe(0);
    });

    it("does not bridge a pause the user just triggered, even if a late playing report arrives", () => {
        let t = 0;
        const hold = new PlayingHold(2500, () => t);
        hold.notePlaying("q");
        hold.suppress("q", 5000);
        t = 300;
        hold.notePlaying("q"); // the server hadn't stopped yet
        t = 2100;
        expect(hold.remaining("q")).toBe(0);
    });

    it("holds nothing for unknown queues", () => {
        expect(new PlayingHold().remaining("x")).toBe(0);
    });
});
