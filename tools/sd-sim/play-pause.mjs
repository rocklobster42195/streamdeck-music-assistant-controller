// End-to-end check of the Play/Pause key against a real Music Assistant server (from .env).
// Plays quietly on MA_TEST_PLAYER, toggles play/pause via the key, and snapshots the deck.
//   node tools/sd-sim/play-pause.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { assertTestPlayerFree, readEnv, startSim } from "./sim.mjs";

const env = readEnv();
if (!env.MA_URL || !env.MA_TOKEN || !env.MA_TEST_PLAYER) {
    console.error("Needs MA_URL, MA_TOKEN and MA_TEST_PLAYER in .env");
    process.exit(1);
}
const out = path.resolve(process.argv[2] ?? "sim-out");

// Only test on a free player (not grouped, not playing)
{
    const WebSocket = createRequire(path.resolve("plugin/package.json"))("ws");
    const { MusicAssistantClient } = await import("music-assistant-client");
    const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
    ma.start();
    for (let i = 0; i < 100 && !ma.isConnected; i++) await new Promise((r) => setTimeout(r, 100));
    assertTestPlayerFree(ma, env.MA_TEST_PLAYER);
    ma.stop();
}
const TEST_STREAM = "https://ice1.somafm.com/groovesalad-128-mp3";

// 1) Unconfigured plugin → "Setup" state
let sim = await startSim({ globalSettings: {} });
const setupKey = sim.add("play-pause-key", {}, { column: 0 });
await sim.waitFor(() => sim.state.slots.get(setupKey).title === "Einrichten", 5000, "setup title");
console.log("setup title:", JSON.stringify(sim.state.slots.get(setupKey).title));
await sim.snapshot(out, "01-setup");
await sim.stop();

// 2) Wrong token → "Token?" state
sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: "not-a-token" } });
const authKey = sim.add("play-pause-key", {}, { column: 0 });
await sim.waitFor(() => sim.state.slots.get(authKey).title === "Token?", 10000, "auth failed title");
console.log("auth title:", JSON.stringify(sim.state.slots.get(authKey).title));
await sim.snapshot(out, "02-auth");
await sim.stop();

// 3) Real connection, active player = test player
sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: env.MA_TEST_PLAYER } });
const follow = sim.add("play-pause-key", { showProgress: true }, { column: 0 });
const fixed = sim.add("play-pause-key", { playerId: env.MA_TEST_PLAYER, showPlayerName: true }, { column: 1 });
// The fixed key shows the player's name once the connection is up.
await sim.waitFor(() => sim.state.slots.get(fixed).title === "Badezimmer", 15000, "connected");
console.log("idle titles:", sim.state.slots.get(follow).title, "|", sim.state.slots.get(fixed).title);
await sim.snapshot(out, "03-idle");

// Start quiet playback directly through MA (volume 5), so the key has something to show.
const { MusicAssistantClient } = await import("music-assistant-client");
const { default: WebSocket } = await import("../../plugin/node_modules/ws/index.js").catch(() => import("ws"));
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await new Promise((r) => { const t = setInterval(() => ma.isConnected && (clearInterval(t), r()), 100); });
const volumeBefore = ma.players.get(env.MA_TEST_PLAYER)?.volume_level;
await ma.setVolume(env.MA_TEST_PLAYER, 5);
await ma.playMedia(env.MA_TEST_PLAYER, TEST_STREAM);

const isPlayingImage = (ctx) => () => {
    const img = sim.state.slots.get(ctx).image ?? "";
    return img.length > 20000; // cover art embedded → large image
};
await sim.waitFor(isPlayingImage(follow), 20000, "cover on key");
await sim.sleep(1500);
await sim.snapshot(out, "04-playing");
console.log("playing: cover shown");

// Press the key → pause (optimistic), then confirmed by events
sim.press(follow);
await sim.sleep(300);
const dimmed = (ctx) => (sim.state.slots.get(ctx).image ?? "").length;
console.log("both keys updated optimistically:", dimmed(follow) === dimmed(fixed) || "check snapshot");
await sim.snapshot(out, "05-pressed-optimistic");
await sim.sleep(3000);
console.log("queue state after press:", ma.queues.get(env.MA_TEST_PLAYER)?.state);
await sim.snapshot(out, "06-paused");

// PI: open it and ask for data
sim.piOpen(follow);
sim.piSend(follow, { event: "pi-ready" });
await sim.waitFor(() => sim.state.piMessages.some((m) => m.event === "preview"), 5000, "pi preview");
const kinds = sim.state.piMessages.map((m) => m.event);
console.log("PI messages:", kinds.join(", "));
const status = sim.state.piMessages.find((m) => m.event === "status")?.status;
console.log("PI status:", JSON.stringify(status));

// Clean up: stop playback, restore volume
await ma.stopPlayback(env.MA_TEST_PLAYER);
if (typeof volumeBefore === "number") await ma.setVolume(env.MA_TEST_PLAYER, volumeBefore);
ma.stop();
await sim.stop();
console.log("snapshots in", out);
process.exit(0);
