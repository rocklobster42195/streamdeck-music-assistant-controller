// Visual check of the animations (marquee on the Play/Pause key and the Track dial, gliding volume
// ring): plays an album quietly on MA_TEST_PLAYER and captures a filmstrip of frames over time.
//   node tools/sd-sim/motion.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { assertTestPlayerFree, readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const P = env.MA_TEST_PLAYER;
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient } = await import("music-assistant-client");
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await until(() => ma.isConnected, 10000);
assertTestPlayerFree(ma, P);
const before = ma.players.get(P)?.volume_level;

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
try {
    await ma.setVolume(P, 5);
    await ma.playMedia(P, process.env.SIM_MEDIA ?? "library://album/1");
    await until(() => ma.queues.get(P)?.state === "playing", 20000);
    sim.add("play-pause-key", { showTitle: true, showProgress: true }, { column: 0 });
    sim.add("track-dial", {}, { column: 0, controller: "Encoder" });
    const vol = sim.add("volume-dial", { step: 10 }, { column: 1, controller: "Encoder" });
    await sim.sleep(3000);

    // Filmstrip: 5 frames, 1.2 s apart (the marquee pauses 1.5 s, then scrolls)
    const frames = [];
    for (let i = 0; i < 5; i++) {
        frames.push(await sim.snapshot(out, `90-motion-${i}`));
        await sim.sleep(1200);
    }
    // Gliding ring: big step, capture right after the turn and after the glide
    sim.rotate(vol, 2);
    await sim.sleep(60);
    frames.push(await sim.snapshot(out, "90-motion-glide-a"));
    await sim.sleep(400);
    frames.push(await sim.snapshot(out, "90-motion-glide-b"));

    console.log("frames:", frames.map((f) => path.basename(f)).join(", "));
} finally {
    await ma.stopPlayback(P).catch(() => {});
    if (typeof before === "number") await ma.setVolume(P, before).catch(() => {});
    ma.stop();
    await sim.stop();
}
process.exit(0);

async function until(fn, ms) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > ms) throw new Error("timeout");
        await new Promise((r) => setTimeout(r, 100));
    }
}
