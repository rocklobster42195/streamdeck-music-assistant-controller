// End-to-end check of Sleep Timer, Announcement, Source and Cast Dashboard keys against a real MA
// server (from .env). Only touches MA_TEST_PLAYER (announcement at low volume); for other rooms and
// screens it only reads what the PI would offer — it never switches another room's input and never
// casts to a screen unless SIM_CAST_SCREEN is set.
//   node tools/sd-sim/extras.mjs [outDir]
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
const player = () => ma.players.get(P);
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const minutesLeft = () => {
    const t = player()?.sleep_timer_expires_at;
    return t ? Math.round((t - Date.now() / 1000) / 60) : 0;
};

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
let reqId = 100;
const options = async (ctx, source, params = {}) => {
    const requestId = ++reqId;
    sim.piOpen(ctx);
    sim.piSend(ctx, { event: "options", requestId, source, params });
    await sim.waitFor(() => sim.state.piMessages.some((m) => m.event === "options-result" && m.requestId === requestId), 10000, source);
    return sim.state.piMessages.find((m) => m.event === "options-result" && m.requestId === requestId);
};
try {
    // --- Sleep timer (silent)
    const sleep = sim.add("sleep-timer-key", { steps: "15,30" }, { column: 0 });
    await sim.sleep(2000);
    sim.press(sleep);
    await until(() => minutesLeft() >= 14, 5000).catch(() => {});
    check("sleep: first press sets 15 min", minutesLeft() === 15, `${minutesLeft()} min`);
    sim.press(sleep);
    await until(() => minutesLeft() >= 29, 5000).catch(() => {});
    check("sleep: second press steps to 30 min", minutesLeft() === 30, `${minutesLeft()} min`);
    await sim.sleep(500);
    await sim.snapshot(out, "a0-extras");
    sim.press(sleep);
    await until(() => !player()?.sleep_timer_expires_at, 5000).catch(() => {});
    check("sleep: past the last step it switches off", !player()?.sleep_timer_expires_at);

    // --- Announcement (quiet, bathroom only)
    const engines = await options(sleep, "tts-engines");
    check("announce: PI lists TTS engines", engines.items.length > 0, engines.items.map((i) => i.label).join(" / "));
    const announce = sim.add("announce-key", { message: "Test", volume: 5, target: "player", preAnnounce: false, ttsEngine: engines.items.find((i) => /translate/i.test(i.value))?.value ?? engines.items[0]?.value }, { column: 1 });
    await sim.sleep(1000);
    sim.press(announce);
    await sim.waitFor(() => sim.state.slots.get(announce).oks > 0 || sim.state.slots.get(announce).alerts > 0, 20000, "announce result").catch(() => {});
    check("announce: MA accepted the announcement", sim.state.slots.get(announce).oks === 1, `oks ${sim.state.slots.get(announce).oks}, alerts ${sim.state.slots.get(announce).alerts}`);

    // --- Source (list only for other rooms)
    const study = [...ma.players.values()].find((p) => (p.source_list ?? []).some((s) => s.id === "line_in"));
    const src = sim.add("source-key", {}, { column: 2 });
    await sim.sleep(500);
    if (study) {
        const list = await options(src, "player-sources", { playerId: study.player_id });
        check("source: PI offers Line-in for the room that has it", list.items.some((i) => i.value === "line_in"), `${study.name}: ${list.items.map((i) => i.label).join(", ")}`);
    }
    const own = await options(src, "player-sources", { playerId: P });
    check("source: passive sources are hidden", !own.items.some((i) => /airplay|radio/i.test(i.value)), own.items.map((i) => i.label).join(", "));
    sim.setSettings(src, { source: P, sourceName: "Music Assistant Queue" });
    await sim.sleep(800);
    sim.press(src);
    await sim.waitFor(() => sim.state.slots.get(src).oks > 0 || sim.state.slots.get(src).alerts > 0, 10000, "source result").catch(() => {});
    check("source: selecting the player's own queue works", sim.state.slots.get(src).oks === 1);

    // --- Dashboard (list only unless SIM_CAST_SCREEN is set)
    const dash = sim.add("dashboard-key", {}, { column: 3 });
    const screens = await options(dash, "dashboards");
    check("dashboard: PI lists screens", screens.items.length > 0, screens.items.map((i) => i.label).join(", "));
    if (process.env.SIM_CAST_SCREEN) {
        sim.setSettings(dash, { dashboardId: process.env.SIM_CAST_SCREEN, dashboardName: "Screen", dashboard: "now_playing" });
        await sim.sleep(800);
        sim.press(dash);
        await sim.sleep(4000);
        sim.press(dash);
        await sim.sleep(1500);
        check("dashboard: cast shown and hidden", sim.state.slots.get(dash).oks === 2);
    }
    await sim.sleep(500);
    await sim.snapshot(out, "a1-extras");
} finally {
    await ma.clearSleepTimer(P).catch(() => {});
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
