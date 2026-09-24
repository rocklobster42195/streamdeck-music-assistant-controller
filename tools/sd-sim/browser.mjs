// End-to-end check of the Browser dial against a real MA server (from .env): navigates
// RadioBrowser → By category → By tag → <tag>, plays the first station quietly, goes back with
// touch, and tries the library start point. Restores volume and stops playback.
//   node tools/sd-sim/browser.mjs [outDir] [tag]
import path from "node:path";
import { createRequire } from "node:module";
import { readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const TAG = (process.argv[3] ?? "jazz").toLowerCase();
const P = env.MA_TEST_PLAYER;
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient } = await import("../../packages/ma-client/dist/index.js");
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await until(() => ma.isConnected, 10000);
const player = () => ma.players.get(P);
const before = { volume: player()?.volume_level };
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
// Index of an entry in a browse level as the dial shows it (".." entries are hidden there)
const indexIn = async (p, match) => {
    const items = ((await ma.send("music/browse", p ? { path: p } : {})) ?? []).filter((i) => i.name !== "..");
    return items.findIndex((i) => match(i));
};

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
try {
    const dial = sim.add("browser-dial", { timeout: 60 }, { column: 0, controller: "Encoder" });
    const img = () => sim.state.slots.get(dial).feedback["full-canvas"] ?? "";
    await sim.sleep(2500);
    await sim.snapshot(out, "60-browser-idle");

    // First turn starts browsing at "All providers"
    sim.rotate(dial, 1);
    await sim.sleep(1500);
    const rb = await indexIn(undefined, (i) => i.path === "radiobrowser://");
    check("provider root lists RadioBrowser", rb >= 0, `index ${rb}`);
    sim.rotate(dial, -10); // back to the first entry
    sim.rotate(dial, rb);
    await sim.sleep(300);
    await sim.snapshot(out, "61-browser-providers");

    sim.dialPress(dial); // RadioBrowser
    await sim.sleep(1500);
    sim.rotate(dial, await indexIn("radiobrowser://", (i) => i.path === "radiobrowser://category"));
    sim.dialPress(dial); // By category
    await sim.sleep(1500);
    sim.rotate(dial, await indexIn("radiobrowser://category", (i) => i.path === "radiobrowser://category/tag"));
    sim.dialPress(dial); // By tag
    await sim.sleep(2500);
    const tagIndex = await indexIn("radiobrowser://category/tag", (i) => i.name.toLowerCase() === TAG);
    check(`tag list contains "${TAG}"`, tagIndex >= 0, `index ${tagIndex}`);
    sim.rotate(dial, tagIndex);
    await sim.sleep(300);
    await sim.snapshot(out, "62-browser-tag");
    sim.dialPress(dial); // the tag → stations
    await sim.sleep(4000);
    await sim.snapshot(out, "63-browser-stations");
    check("station list renders with a thumbnail", img().length > 8000, `${img().length} bytes`);

    // Touch = back one level, then forward again
    const inStations = img();
    sim.touch(dial);
    await sim.sleep(500);
    check("touch goes back one level", img() !== inStations);
    sim.dialPress(dial);
    await sim.sleep(3000);

    // Push on a station plays it
    await ma.setVolume(P, 5);
    sim.dialPress(dial);
    await until(() => player()?.playback_state === "playing" && player()?.current_media?.media_type === "radio", 20000).catch(() => {});
    check("push plays the station", player()?.playback_state === "playing", player()?.current_media?.title ?? player()?.current_media?.uri);
    await sim.sleep(300);
    await sim.snapshot(out, "64-browser-played");
    await sim.sleep(2500);
    await sim.snapshot(out, "65-browser-back-idle");

    // Library start point
    sim.setSettings(dial, { timeout: 60, start: "library" });
    await sim.sleep(300);
    sim.rotate(dial, 1);
    await sim.sleep(2500);
    await sim.snapshot(out, "66-browser-library");
    sim.dialPress(dial); // Favorites
    await sim.sleep(2500);
    await sim.snapshot(out, "67-browser-favorites");
    check("library → favorites renders", img().length > 3000);
} finally {
    await ma.stopPlayback(P).catch(() => {});
    if (typeof before.volume === "number") await ma.setVolume(P, before.volume).catch(() => {});
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
