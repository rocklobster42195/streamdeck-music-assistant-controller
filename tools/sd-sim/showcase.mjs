// Staged screenshots for the README and the Marketplace: the real plugin against the stand-in
// Music Assistant (fake-ma.mjs) — invented rooms and tracks, generated covers, no lyrics. Plays
// nothing anywhere. Writes deck overviews to sim-out/showcase/.
// Run it with DECKBUS_NAMESPACE=showcase, so the plugin does not meet the plugins running on this computer.
//   node tools/sd-sim/showcase.mjs [outDir]
import path from "node:path";
import { startFakeMa } from "./fake-ma.mjs";
import { startSim } from "./sim.mjs";

const out = path.resolve(process.argv[2] ?? "sim-out");
const ma = await startFakeMa();

/** One scene: a fresh deck with `build`'s actions, snapshotted after `settleMs`. */
async function scene(name, build, settleMs = 4500, after) {
    const sim = await startSim({ language: "en", globalSettings: { maUrl: ma.url, maToken: "demo", activePlayerId: "living" } });
    try {
        const ctx = build(sim);
        await sim.sleep(settleMs);
        if (after) await after(sim, ctx);
        const file = await sim.snapshot(out, name);
        console.log("wrote", file);
    } finally {
        await sim.stop();
    }
}

const key = (sim, suffix, settings, column, row) => sim.add(suffix, settings, { column, row });
const dial = (sim, suffix, settings, column) => sim.add(suffix, settings, { column, controller: "Encoder" });

/** The everyday keys, used in every scene: transport on top, volume below (as they'd sit on a real deck). */
function keys(sim) {
    key(sim, "playback-control-key", { command: "previous" }, 0, 0);
    key(sim, "play-pause-key", { showTitle: true, showProgress: true, showProvider: true }, 1, 0);
    key(sim, "playback-control-key", { command: "next" }, 2, 0);
    key(sim, "playback-control-key", { command: "shuffle" }, 3, 0);
    key(sim, "volume-key", { command: "down", showVolume: false }, 0, 1);
    key(sim, "volume-key", { command: "mute" }, 1, 1);
    key(sim, "volume-key", { command: "up", showVolume: false }, 2, 1);
    key(sim, "announce-key", { message: "The pasta is ready!", when: "timer", minutes: 9, icon: "mdiPasta" }, 3, 1);
}

try {
    await scene("01-overview", (sim) => {
        keys(sim);
        dial(sim, "track-dial", { showProvider: true, background: "particles" }, 0);
        dial(sim, "volume-dial", { ringCoverColor: true, background: "particles" }, 1);
        dial(sim, "panorama-dial", { background: "particles", text: "track" }, 2);
        dial(sim, "browser-dial", { background: "particles" }, 3);
    });

    await scene("02-panorama", (sim) => {
        keys(sim);
        for (const c of [0, 1, 2, 3]) dial(sim, "panorama-dial", { background: "particles", text: "track" }, c);
    });

    await scene("03-matrix", (sim) => {
        keys(sim);
        dial(sim, "track-dial", { background: "matrix-rain" }, 0);
        for (const c of [1, 2]) dial(sim, "panorama-dial", { background: "matrix-rain", text: "off" }, c);
        dial(sim, "group-volume-dial", { background: "matrix-rain", ringCoverColor: true }, 3);
    });

    await scene("05-lyrics", (sim) => {
        keys(sim);
        for (const c of [0, 1, 2, 3]) dial(sim, "panorama-dial", { background: "particles", text: "lyrics", lyricsOffset: 0.5 }, c);
    }, 6000);

    await scene(
        "04-browser",
        (sim) => {
            keys(sim);
            const b = dial(sim, "browser-dial", {}, 0);
            dial(sim, "queue-dial", {}, 1);
            dial(sim, "player-dial", {}, 2);
            dial(sim, "volume-dial", {}, 3);
            return b;
        },
        3000,
        async (sim, b) => {
            // Browse: providers → Spotify → Playlists
            sim.rotate(b, 1);
            await sim.sleep(1200);
            sim.rotate(b, 1);
            await sim.sleep(300);
            sim.dialPress(b);
            await sim.sleep(1200);
            sim.dialPress(b);
            await sim.sleep(1500);
        },
    );
} finally {
    await ma.stop();
}
