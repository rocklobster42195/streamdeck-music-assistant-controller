// End-to-end check of the Volume and Track dials against a real MA server (from .env).
// Plays quietly on MA_TEST_PLAYER, turns/pushes/touches the dials, checks MA, snapshots the strip,
// restores volume, mute state and playback.
//   node tools/sd-sim/dials.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const P = env.MA_TEST_PLAYER;
const MEDIA = process.env.SIM_MEDIA ?? "library://album/1";
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient, currentElapsed } = await import("../../packages/ma-client/dist/index.js");
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await until(() => ma.isConnected, 10000);
const player = () => ma.players.get(P);
const q = () => ma.queues.get(P);
const before = { volume: player()?.volume_level, muted: player()?.volume_muted };
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
try {
    await ma.setVolume(P, 5);
    await ma.playMedia(P, MEDIA);
    await until(() => q()?.state === "playing" && player()?.current_media?.duration, 20000);

    const track = sim.add("track-dial", { seekStep: 10 }, { column: 0, controller: "Encoder" });
    const vol = sim.add("volume-dial", { step: 1, preset: 6 }, { column: 1, controller: "Encoder" });
    await sim.sleep(3000);
    await sim.snapshot(out, "40-dials-playing");

    // Volume: three quick ticks → 8, sent as one final value
    sim.rotate(vol, 1);
    sim.rotate(vol, 1);
    sim.rotate(vol, 1);
    await sim.sleep(150);
    await sim.snapshot(out, "41-dials-volume-optimistic");
    await until(() => player()?.volume_level === 8, 5000).catch(() => {});
    check("three quick ticks land on 8", player()?.volume_level === 8, `volume ${player()?.volume_level}`);
    sim.rotate(vol, -2);
    await until(() => player()?.volume_level === 6, 5000).catch(() => {});
    check("turning back lowers the volume", player()?.volume_level === 6, `volume ${player()?.volume_level}`);

    sim.dialPress(vol);
    await until(() => player()?.volume_muted === true, 5000).catch(() => {});
    check("push mutes", player()?.volume_muted === true);
    await sim.sleep(500);
    await sim.snapshot(out, "42-dials-muted");
    sim.touch(vol);
    await until(() => player()?.volume_muted === false && player()?.volume_level === 6, 5000).catch(() => {});
    check("touch recalls the preset and unmutes", player()?.volume_muted === false && player()?.volume_level === 6, `volume ${player()?.volume_level}`);
    await ma.setVolume(P, 7);
    await until(() => player()?.volume_level === 7, 5000).catch(() => {});
    sim.touch(vol, true);
    await sim.sleep(500);
    check("hold saves the current volume as preset", sim.state.slots.get(vol).settings.preset === 7, `preset ${sim.state.slots.get(vol).settings.preset}`);
    await sim.snapshot(out, "43-dials-preset-saved");

    // Track: seek +30 s, next, pause
    const e0 = currentElapsed(q());
    sim.rotate(track, 3);
    await sim.sleep(2500);
    const e1 = currentElapsed(q());
    check("rotating seeks forward about 30 s", e1 - e0 > 25 && e1 - e0 < 40, `${e0.toFixed(0)} → ${e1.toFixed(0)} s`);
    const uri0 = player()?.current_media?.uri;
    sim.dialPress(track);
    await until(() => player()?.current_media?.uri !== uri0, 15000).catch(() => {});
    check("push skips to the next track", player()?.current_media?.uri !== uri0);
    // Wait until the new track actually plays — touching mid-transition would toggle back to play
    await until(() => q()?.state === "playing", 10000).catch(() => {});
    await sim.sleep(1000);
    sim.touch(track);
    await until(() => q()?.state !== "playing", 5000).catch(() => {});
    check("touch pauses", q()?.state !== "playing", q()?.state);
    await sim.sleep(800);
    await sim.snapshot(out, "44-dials-paused");
} finally {
    await ma.stopPlayback(P).catch(() => {});
    if (typeof before.muted === "boolean") await ma.setMute(P, before.muted).catch(() => {});
    if (typeof before.volume === "number") await ma.setVolume(P, before.volume).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    console.log("after:", JSON.stringify({ volume: player()?.volume_level, muted: player()?.volume_muted }));
    ma.stop();
    await sim.stop();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} passed · snapshots in ${out}`);
process.exit(failed ? 1 : 0);

async function until(fn, ms) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > ms) throw new Error("timeout");
        await new Promise((r) => setTimeout(r, 100));
    }
}
