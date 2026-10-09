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
