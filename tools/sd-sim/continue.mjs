// Continue Listening key + the Browser dial's "Continue listening" folder. Starts a LibriVox
// audiobook (Internet Archive) quietly on MA_TEST_PLAYER, leaves it at ~2:00, and checks that the
// key shows it, resumes it there and pauses on a second press. Afterwards the book is marked
// unplayed again, so the user's "continue listening" list is left as it was.
//   node tools/sd-sim/continue.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { assertTestPlayerFree, readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const P = env.MA_TEST_PLAYER;
const URI = process.env.SIM_AUDIOBOOK ?? "internet_archive://audiobook/adventures_sherlockholmes_1007_librivox";
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient, currentElapsed } = await import("music-assistant-client");
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
const svg = (dataUri) => (dataUri ? Buffer.from(dataUri.split(",")[1], "base64").toString("utf8") : "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const book = await ma.itemByUri(URI);
const wasInProgress = ((await ma.send("music/in_progress_items", { limit: 50 })) ?? []).some((i) => i.uri === URI);

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
try {
    // Leave the book half-heard at ~2:00
    await ma.setVolume(P, 5);
    await ma.playMedia(P, URI);
    await until(() => ma.queues.get(P)?.state === "playing", 30000);
    await ma.seek(P, 120);
    await sleep(3000);
    await ma.stopPlayback(P);
    await until(() => ma.queues.get(P)?.state !== "playing", 10000);
    // Something else on the player, so the key has to load the book again
    await ma.playMedia(P, "library://radio/1");
    await until(() => ma.queues.get(P)?.current_item?.media_item?.media_type === "radio", 20000);
    await ma.stopPlayback(P);
    await sleep(1500);

    const key = sim.add("continue-key", {}, { column: 0, row: 0 });
    const slot = () => sim.state.slots.get(key);
    await sim.sleep(4000);
    await sim.snapshot(out, "70-continue-idle");
    check("key shows the started audiobook", svg(slot().image).includes(book.name.replaceAll("&", "&amp;")), book.name);
    check("key shows the cover", svg(slot().image).includes("<image"));

    sim.press(key);
    await until(() => ma.queues.get(P)?.state === "playing" && ma.queues.get(P)?.current_item?.media_item?.uri === URI, 30000).catch(() => {});
    await sleep(2500);
    const at = currentElapsed(ma.queues.get(P));
    check("press resumes the book where it was left", at > 100 && at < 200, `${at.toFixed(0)} s`);
    await sim.sleep(1000);
    await sim.snapshot(out, "71-continue-playing");
    check("key is highlighted while it plays", svg(slot().image).includes('stroke="#6cc4ff"'));

    sim.press(key);
    await until(() => ma.queues.get(P)?.state !== "playing", 10000).catch(() => {});
    check("second press pauses", ma.queues.get(P)?.state !== "playing", ma.queues.get(P)?.state);

    // Browser dial: the first entry of the provider root is "Continue listening"
    const dial = sim.add("browser-dial", {}, { column: 0, controller: "Encoder" });
    const strip = () => svg(sim.state.slots.get(dial).feedback["full-canvas"]);
    await sim.sleep(2000);
    sim.rotate(dial, 1);
    await sim.sleep(1500);
    sim.rotate(dial, -10);
    await sim.sleep(500);
    check("browser root starts with the Continue listening folder", strip().includes("Weiterhören"));
    sim.dialPress(dial);
    await sim.sleep(2500);
    await sim.snapshot(out, "72-continue-browser");
    check("the folder lists the audiobook", strip().includes(book.name.split(" ").at(-1)) && strip().includes("<image"));
} finally {
    await ma.stopPlayback(P).catch(() => {});
    if (typeof before === "number") await ma.setVolume(P, before).catch(() => {});
    if (!wasInProgress) await ma.send("music/mark_unplayed", { media_item: book }).catch((e) => console.log("cleanup failed:", e.message));
    await sleep(1000);
    const left = ((await ma.send("music/in_progress_items", { limit: 50 })) ?? []).some((i) => i.uri === URI);
    console.log(`cleanup: book ${left ? "still" : "no longer"} in progress`);
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
