// Panorama text overlay: synced lyrics across two neighbouring Panorama dials, title & artist on a
// third one, and the text setting following along within a run. Plays a track that has lyrics
// quietly on MA_TEST_PLAYER, then restores playback state and volume.
//   node tools/sd-sim/lyrics.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { assertTestPlayerFree, readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const P = env.MA_TEST_PLAYER;
const SEARCH = process.env.SIM_LYRICS_TRACK ?? "Bad Love";
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient, currentElapsed, lyricIndexAt, parseLrc } = await import("../../packages/ma-client/dist/index.js");
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
const xml = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const [track] = await ma.send("music/tracks/library_items", { search: SEARCH, limit: 1 });
if (!track) throw new Error(`no library track matching "${SEARCH}"`);
const { lrc } = await ma.trackLyrics(track);
const lines = lrc ? parseLrc(lrc) : [];
console.log(`track: ${track.name} — ${lines.length} synced lines`);

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
try {
    await ma.setVolume(P, 5);
    await ma.playMedia(P, track.uri);
    await until(() => ma.queues.get(P)?.state === "playing", 20000);
    // Jump just before a line with text, so a change happens while we watch
    const target = lines.find((l, i) => l.text && l.time > 20 && lines[i + 1]?.text) ?? lines[0];
    if (target) await ma.seek(P, Math.max(0, Math.floor(target.time - 2)));
    await sim.sleep(1500);

    const a = sim.add("panorama-dial", { background: "particles", text: "lyrics" }, { column: 0, controller: "Encoder" });
    const b = sim.add("panorama-dial", { background: "particles" }, { column: 1, controller: "Encoder" });
    sim.add("track-dial", {}, { column: 2, controller: "Encoder" });
    const c = sim.add("panorama-dial", { background: "matrix-rain", text: "track" }, { column: 3, controller: "Encoder" });
    const img = (ctx) => svg(sim.state.slots.get(ctx).feedback["full-canvas"]);
    const expected = () => {
        const q = ma.queues.get(P);
        const i = lyricIndexAt(lines, currentElapsed(q));
        return i >= 0 ? lines[i].text : "";
    };

    await sim.sleep(2500);
    let line = expected();
    await sim.snapshot(out, "98-lyrics-1");
    check("left dial shows the sung line", !!line && img(a).includes(xml(line)) , line);
    check("right dial draws the same line (shifted by one display)", img(b).includes(xml(line)) && img(b).includes("translate(-200 0)"));
    check("title & artist on the separate Panorama dial", img(c).includes(xml(track.name)));

    // Wait for the next line with text, then give the display one tick plus the fade
    const start = Date.now();
    while ((expected() === line || !expected()) && Date.now() - start < 20000) await sim.sleep(200);
    await sim.sleep(700);
    const later = expected();
    await sim.snapshot(out, "99-lyrics-2");
    check("the line follows the music", later !== line && img(a).includes(xml(later)), later);

    // Changing the text on one dial of the run changes it on its neighbour too
    sim.setSettings(b, { ...sim.state.slots.get(b).settings, text: "track" });
    await sim.sleep(800);
    check("run neighbour follows the text setting", sim.state.slots.get(a).settings.text === "track");
    await sim.sleep(600);
    check("run switches to title & artist", img(a).includes(xml(track.name)) || img(b).includes(xml(track.name)));
    await sim.snapshot(out, "99-lyrics-track");
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
