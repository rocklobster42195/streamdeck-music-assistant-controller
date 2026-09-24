// End-to-end check of the Play Item key against a real MA server (from .env): picks an item via the
// plugin's own library search (like the PI does), checks the key shows its cover, presses the key,
// checks MA plays it (quietly) and the key lights up, then restores volume/playback.
//   node tools/sd-sim/play-item.mjs [outDir] [query]
import path from "node:path";
import { createRequire } from "node:module";
import { assertTestPlayerFree, readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const query = process.argv[3] ?? "SWR3";
const P = env.MA_TEST_PLAYER;
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient } = await import("../../packages/ma-client/dist/index.js");
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await until(() => ma.isConnected, 10000);
assertTestPlayerFree(ma, P);
const player = () => ma.players.get(P);
const before = { volume: player()?.volume_level };
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
try {
    const key = sim.add("play-item-key", {}, { column: 0 });
    await sim.waitFor(() => sim.state.slots.get(key).title === "Wählen", 10000, "empty key");
    check("unconfigured key asks to choose", true);

    // Search like the PI does
    sim.piOpen(key);
    sim.piSend(key, { event: "library-search", requestId: 1, query, filter: "radio" });
    await sim.waitFor(() => sim.state.piMessages.some((m) => m.event === "library-results" && m.requestId === 1), 15000, "search");
    const res = sim.state.piMessages.find((m) => m.event === "library-results" && m.requestId === 1);
    const item = res.items[0];
    check("library search returns items with thumbnails", !!item?.thumbUrl, `${res.items.length} items, first: ${item?.name}`);

    sim.setSettings(key, { uri: item.uri, name: item.name, subtitle: item.subtitle ?? "", mediaType: item.mediaType, imageProxyId: item.imageProxyId ?? "", option: "replace" });
    await sim.waitFor(() => (sim.state.slots.get(key).image ?? "").length > 5000, 10000, "cover");
    check("key shows the item's cover", true);
    await sim.snapshot(out, "30-play-item-chosen");

    await ma.setVolume(P, 5);
    sim.press(key);
    await until(() => player()?.playback_state === "playing", 20000).catch(() => {});
    check("press plays the item", player()?.playback_state === "playing", player()?.current_media?.uri);
    check("press shows the check mark", sim.state.slots.get(key).oks === 1);
    await sim.sleep(2500);
    const preview = [...sim.state.piMessages].reverse().find((m) => m.event === "preview")?.preview;
    check("PI header shows the chosen item, playing", preview?.state === "playing" && !!preview?.track?.startsWith(item.name), `${preview?.track} / ${preview?.state}`);
    await sim.snapshot(out, "31-play-item-playing");
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
