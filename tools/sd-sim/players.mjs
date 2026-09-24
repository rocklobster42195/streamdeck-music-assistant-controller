// End-to-end check of the Player key and Player dial against a real MA server (from .env).
// Always: switching the active player (keys follow), rendering, "nothing to bring along".
// With MA_TRANSFER_PLAYER in .env (a second room that may play quietly): the music-follows-me
// transfer from MA_TEST_PLAYER to that room and back. Restores active player, volumes, playback.
//   node tools/sd-sim/players.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const A = env.MA_TEST_PLAYER;
const B = env.MA_TRANSFER_PLAYER;
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient } = await import("../../packages/ma-client/dist/index.js");
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await until(() => ma.isConnected, 10000);
const pl = (id) => ma.players.get(id);
const before = { a: pl(A)?.volume_level, b: B ? pl(B)?.volume_level : undefined };
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const others = [...ma.players.values()].filter((p) => p.available && p.player_id !== A && p.player_id !== B && !p.hide_in_ui);
const C = others[0]?.player_id; // a third room, only ever made "active" (never plays)

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: A } });
try {
    const keyA = sim.add("player-key", { playerId: A }, { column: 0 });
    const keyC = sim.add("player-key", { playerId: C, transfer: true }, { column: 1 });
    const follow = sim.add("play-pause-key", { showPlayerName: true }, { column: 2 });
    const dial = sim.add("player-dial", {}, { column: 0, controller: "Encoder" });
    await sim.sleep(2500);
    await sim.snapshot(out, "70-players-initial");
    check("follow key shows the active player", sim.state.slots.get(follow).title === pl(A).name, sim.state.slots.get(follow).title);

    // Key press switches the active player; nothing plays → nothing is transferred
    sim.press(keyC);
    await sim.waitFor(() => sim.state.globalSettings.activePlayerId === C, 5000, "active C").catch(() => {});
    check("room key makes its player active", sim.state.globalSettings.activePlayerId === C);
    await sim.sleep(500);
    check("keys set to 'Active player' follow", sim.state.slots.get(follow).title === pl(C).name, sim.state.slots.get(follow).title);
    check("no transfer when nothing plays", pl(C).playback_state !== "playing");
    await sim.snapshot(out, "71-players-switched");

    // Dial: two ticks move the active player on
    const list = [...ma.players.values()].filter((p) => p.enabled !== false && !p.hide_in_ui && p.available).sort((x, y) => (x.display_name ?? x.name).localeCompare(y.display_name ?? y.name));
    sim.rotate(dial, 1);
    sim.rotate(dial, 1);
    await sim.sleep(1200);
    const expected = list[(list.findIndex((p) => p.player_id === C) + 2) % list.length];
    check("dial turns select the active player", sim.state.globalSettings.activePlayerId === expected.player_id, `${expected.name}`);
    await sim.snapshot(out, "72-players-dial");

    if (B) {
        const keyB = sim.add("player-key", { playerId: B, transfer: true }, { column: 3 });
        sim.press(keyA); // A active
        await sim.sleep(800);
        await ma.setVolume(A, 5);
        await ma.setVolume(B, 5);
        await ma.playMedia(A, "library://radio/1");
        await until(() => ma.queues.get(A)?.state === "playing", 20000);
        await sim.sleep(1500);
        sim.press(keyB);
        await until(() => ma.queues.get(B)?.state === "playing", 20000).catch(() => {});
        check("music follows: B plays after pressing B", ma.queues.get(B)?.state === "playing");
        check("…and A stopped", ma.queues.get(A)?.state !== "playing", ma.queues.get(A)?.state);
        check("…and B is the active player", sim.state.globalSettings.activePlayerId === B);
        await sim.sleep(1500);
        await sim.snapshot(out, "73-players-transferred");
        // Dial push brings it back to A (make A active first)
        sim.press(keyA); // transfer back via key as well
        await until(() => ma.queues.get(A)?.state === "playing", 20000).catch(() => {});
        check("pressing A brings it back", ma.queues.get(A)?.state === "playing");
    } else {
        console.log("SKIP  transfer (set MA_TRANSFER_PLAYER in .env to a room that may play quietly)");
    }
} finally {
    for (const id of [A, B].filter(Boolean)) await ma.stopPlayback(id).catch(() => {});
    if (typeof before.a === "number") await ma.setVolume(A, before.a).catch(() => {});
    if (B && typeof before.b === "number") await ma.setVolume(B, before.b).catch(() => {});
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
