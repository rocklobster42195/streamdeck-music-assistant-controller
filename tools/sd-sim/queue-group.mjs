// End-to-end check of the Queue dial and the Group Volume dial against a real MA server (from .env).
// Queue: plays an album quietly on MA_TEST_PLAYER, scrolls, jumps to a track.
// Group: groups MA_TEST_PLAYER + MA_TRANSFER_PLAYER (both quiet), turns/mutes the group volume,
// then ungroups and restores volumes and playback.
//   node tools/sd-sim/queue-group.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const A = env.MA_TEST_PLAYER;
const B = env.MA_TRANSFER_PLAYER;
const MEDIA = process.env.SIM_MEDIA ?? "library://album/1";
const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient } = await import("../../packages/ma-client/dist/index.js");
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await until(() => ma.isConnected, 10000);
const pl = (id) => ma.players.get(id);
const q = () => ma.queues.get(A);
const before = { a: pl(A)?.volume_level, b: B ? pl(B)?.volume_level : undefined };
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: A } });
let grouped = false;
try {
    await ma.setVolume(A, 5);
    await ma.playMedia(A, MEDIA);
    await until(() => q()?.state === "playing" && (q()?.items ?? 0) > 3, 20000);
    const dial = sim.add("queue-dial", {}, { column: 0, controller: "Encoder" });
    await sim.sleep(3000);
    await sim.snapshot(out, "80-queue-current");
    const start = q().current_index ?? 0;
    console.log(`queue: ${q().items} items, current ${start}`);

    sim.rotate(dial, 1);
    await sim.sleep(1500);
    await sim.snapshot(out, "81-queue-next");
    sim.rotate(dial, 2);
    await sim.sleep(1500);
    await sim.snapshot(out, "82-queue-plus3");
    sim.dialPress(dial);
    await until(() => q()?.current_index === start + 3, 15000).catch(() => {});
    check("push jumps to the selected track", q()?.current_index === start + 3, `current ${q()?.current_index}`);
    await sim.sleep(2500);
    await sim.snapshot(out, "83-queue-jumped");
    sim.rotate(dial, -2);
    await sim.sleep(800);
    sim.touch(dial);
    await sim.sleep(500);
    check("touch returns to the current track", true);

    if (B) {
        sim.remove(dial);
        await ma.setVolume(B, 5);
        await ma.groupPlayers(A, [B]);
        grouped = true;
        await until(() => (pl(A)?.group_members?.length ?? 0) > 1, 15000).catch(() => {});
        check("group formed", (pl(A)?.group_members?.length ?? 0) > 1, `${pl(A)?.group_members?.length} members`);
        const g = sim.add("group-volume-dial", { step: 1 }, { column: 1, controller: "Encoder" });
        await sim.sleep(2500);
        await sim.snapshot(out, "84-group-initial");
        const gv0 = pl(A)?.group_volume ?? 0;
        sim.rotate(g, 1);
        sim.rotate(g, 1);
        await until(() => (pl(A)?.group_volume ?? 0) === gv0 + 2, 8000).catch(() => {});
        check("turning raises the group volume", (pl(A)?.group_volume ?? 0) === gv0 + 2, `${gv0} → ${pl(A)?.group_volume} (members ${pl(A)?.volume_level} / ${pl(B)?.volume_level})`);
        sim.dialPress(g);
        await until(() => pl(A)?.group_volume_muted === true, 8000).catch(() => {});
        check("push mutes the group", pl(A)?.group_volume_muted === true);
        await sim.sleep(500);
        await sim.snapshot(out, "85-group-muted");
        sim.dialPress(g);
        await until(() => pl(A)?.group_volume_muted === false, 8000).catch(() => {});
        check("push again unmutes", pl(A)?.group_volume_muted === false);
    }
} finally {
    await ma.stopPlayback(A).catch(() => {});
    if (grouped) await ma.ungroup(B).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    if (typeof before.a === "number") await ma.setVolume(A, before.a).catch(() => {});
    if (B && typeof before.b === "number") await ma.setVolume(B, before.b).catch(() => {});
    if (B) await ma.setMute(A, false).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    console.log("after:", JSON.stringify({ aMembers: pl(A)?.group_members, bSyncedTo: B ? pl(B)?.synced_to : undefined, a: pl(A)?.volume_level, b: B ? pl(B)?.volume_level : undefined }));
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
