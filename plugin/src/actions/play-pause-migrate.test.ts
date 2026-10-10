import { describe, expect, it } from "vitest";
import { migratePlayPause } from "./play-pause-migrate";

describe("Play/Pause settings onto the universal key", () => {
    it("keeps where things were: the service logo top left, the marker top right", () => {
        expect(migratePlayPause({ playerId: "RINCON_38420B857BB201400", showProvider: true, showPlayerName: true, showTitle: true, marker: "sofa" })).toEqual({
            player: "device:RINCON_38420B857BB201400",
            topLeft: "source",
            topRight: "marker",
            showName: true,
            showTitle: true,
            showCover: true,
            marker: "sofa",
        });
    });

    it("an MA player that isn't a Sonos speaker stays MA-C's; no player follows the deck's active one", () => {
        expect(migratePlayPause({ playerId: "up5c4d4aaf" })?.player).toBe("MA-C/up5c4d4aaf");
        const s = migratePlayPause({});
        expect(s?.player).toBeUndefined();
        expect(s?.topLeft).toBe("none");
    });

    it("takes the old cover-colour switch over, and runs only once", () => {
        expect(migratePlayPause({ iconCoverColor: true })?.keyColor).toBe("cover");
        expect(migratePlayPause({ topLeft: "marker", topRight: "source" })).toBeUndefined();
    });
});

describe("Volume dial settings onto the universal dial", () => {
    it("the player becomes a deck choice, the cover ring a key colour, the marker the icon", async () => {
        const { migrateVolumeDial } = await import("./play-pause-migrate");
        expect(migrateVolumeDial({ playerId: "up1234", ringCoverColor: true, marker: "mdiSofa", step: 3, align: "right" })).toEqual({
            player: "MA-C/up1234",
            keyColor: "cover",
            icon: "mdiSofa",
            step: 3,
            align: "right",
        });
        expect(migrateVolumeDial({ playerId: "RINCON_ABC" })?.player).toBe("device:RINCON_ABC");
        expect(migrateVolumeDial({ player: "device:RINCON_ABC", gauge: "pie" })).toBeUndefined();
        expect(migrateVolumeDial({})).toBeUndefined();
    });
});

describe("Track dial settings onto the universal dial", () => {
    it("the player becomes a deck choice and the cover stays on the left", async () => {
        const { migrateTrackDial } = await import("./play-pause-migrate");
        expect(migrateTrackDial({ playerId: "up1234", seekStep: 15, showProvider: true })).toEqual({ player: "MA-C/up1234", look: "info", coverSide: "left", seekStep: 15, showProvider: true });
        expect(migrateTrackDial({ player: "device:RINCON_A", coverSide: "right" })).toBeUndefined();
        expect(migrateTrackDial({})).toBeUndefined();
    });
});
