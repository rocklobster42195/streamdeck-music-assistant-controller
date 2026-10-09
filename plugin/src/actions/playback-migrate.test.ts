import { describe, expect, it } from "vitest";

const { migratePlayback } = await import("./play-pause-migrate");

describe("Playback Control settings onto the universal key", () => {
    it("the MA player becomes a deck player; command, seek step and marker stay", () => {
        expect(migratePlayback({ playerId: "RINCON_38420B857BB201400", command: "shuffle", seekStep: "15", marker: "sofa" })).toEqual({ player: "device:RINCON_38420B857BB201400", command: "shuffle", seekStep: "15", marker: "sofa" });
        expect(migratePlayback({ playerId: "", command: "next" })).toEqual({ command: "next" });
        expect(migratePlayback({ iconCoverColor: true, command: "repeat" })).toEqual({ command: "repeat", keyColor: "cover" });
        expect(migratePlayback({ player: "active", command: "next" })).toBeUndefined();
    });
});
