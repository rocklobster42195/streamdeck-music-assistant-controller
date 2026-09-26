// Lyrics timing on the Panorama dial: turning adjusts the timing (scale at the top, saved on every
// dial of the run), tapping re-syncs with the server ("Synced"), pressing switches to the effect's
// values (badge at the top). The dials point at a player that
// doesn't exist, so no real lyrics end up in the snapshots.
//   node tools/sd-sim/lyrics-timing.mjs [outDir]
import path from "node:path";
import { readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: env.MA_TEST_PLAYER } });
try {
    const a = sim.add("panorama-dial", { background: "particles", text: "lyrics", lyricsOffset: 0.5, playerId: "sim-no-player" }, { column: 0, controller: "Encoder" });
    const b = sim.add("panorama-dial", { background: "particles", text: "lyrics", lyricsOffset: 0.5, playerId: "sim-no-player" }, { column: 1, controller: "Encoder" });
    const offset = (ctx) => sim.state.slots.get(ctx).settings.lyricsOffset;
    await sim.sleep(2500);

    sim.rotate(b, 3);
    await sim.sleep(300);
    await sim.snapshot(out, "97-lyrics-timing");
    await sim.sleep(1000);
    check("turning sets the timing on the whole run", offset(a) === 0.8 && offset(b) === 0.8, `${offset(a)}, ${offset(b)}`);

    sim.rotate(a, -15);
    await sim.sleep(1000);
    check("turning back below zero", offset(a) === -0.7 && offset(b) === -0.7, `${offset(a)}, ${offset(b)}`);

    await sim.sleep(2500); // scale gone
    sim.touch(a);
    await sim.sleep(800);
    await sim.snapshot(out, "97-lyrics-sync");

    // A press switches to the effect's values (particles: count, then speed), shown as a badge
    await sim.sleep(1600);
    sim.dialPress(a);
    await sim.sleep(300);
    await sim.snapshot(out, "97-lyrics-function");
    const before = sim.state.slots.get(a).settings.savedDensity;
    sim.rotate(a, 2);
    await sim.sleep(1200);
    const after = sim.state.slots.get(a).settings.savedDensity;
    check("after a press, turning changes the particle count, not the timing", after !== before && offset(a) === -0.7, `density ${before} → ${after}, timing ${offset(a)}`);

    // No effect (spreads to the neighbour): text only, still one run across both displays
    sim.setSettings(a, { ...sim.state.slots.get(a).settings, background: "" });
    await sim.sleep(1500);
    check("no effect spreads to the neighbour", sim.state.slots.get(b).settings.background === "", JSON.stringify(sim.state.slots.get(b).settings.background));
    sim.rotate(a, 1);
    await sim.sleep(300);
    await sim.snapshot(out, "97-lyrics-no-effect");
} finally {
    await sim.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
