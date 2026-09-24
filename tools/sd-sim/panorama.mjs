// Visual/functional check of the panorama effects: two neighbouring Panorama dials sharing one
// scene, plus Track and Volume dials with effect backgrounds. Plays quietly on MA_TEST_PLAYER so
// the cover color tints the effects. Captures two frames of the whole strip.
//   node tools/sd-sim/panorama.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { assertTestPlayerFree, readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const P = env.MA_TEST_PLAYER;
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient } = await import("../../packages/ma-client/dist/index.js");
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await until(() => ma.isConnected, 10000);
assertTestPlayerFree(ma, P);
const before = ma.players.get(P)?.volume_level;
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
try {
    await ma.setVolume(P, 5);
    await ma.playMedia(P, "library://radio/1");
    await until(() => ma.queues.get(P)?.state === "playing", 20000);

    const a = sim.add("panorama-dial", { background: "particles" }, { column: 0, controller: "Encoder" });
    const b = sim.add("panorama-dial", { background: "particles" }, { column: 1, controller: "Encoder" });
    const t = sim.add("track-dial", { background: "boing-globe" }, { column: 2, controller: "Encoder" });
    const v = sim.add("volume-dial", { background: "matrix-rain", coverColor: false }, { column: 3, controller: "Encoder" });
    const img = (ctx) => sim.state.slots.get(ctx).feedback["full-canvas"] ?? "";
    await sim.sleep(3000);
    const a1 = img(a);
    await sim.snapshot(out, "95-panorama-1");
    await sim.sleep(700);
    await sim.snapshot(out, "96-panorama-2");
    check("effect animates (frames differ)", img(a) !== a1);
    check("both panorama dials render", img(a).length > 500 && img(b).length > 500);
    check("track dial draws its background", img(t).length > 3000);
    check("volume dial draws its background", img(v).length > 1500);

    // Changing a panorama dial's effect switches the scene
    const beforeSwitch = img(a);
    sim.setSettings(a, { background: "boing-ball" });
    sim.setSettings(b, { background: "boing-ball" });
    await sim.sleep(1500);
    await sim.snapshot(out, "97-panorama-boing");
    check("switching the effect changes the scene", img(a) !== beforeSwitch);
} finally {
    await ma.stopPlayback(P).catch(() => {});
    if (typeof before === "number") await ma.setVolume(P, before).catch(() => {});
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
