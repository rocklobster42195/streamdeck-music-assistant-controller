// End-to-end check of Playback Control, Like and Volume keys against a real MA server (from .env).
// Plays quietly on MA_TEST_PLAYER, presses every key, checks MA's state, snapshots the deck, and
// restores everything it touched (queue toggles, volume, favorites, playback).
//   node tools/sd-sim/keys.mjs [outDir]
import path from "node:path";
import { createRequire } from "node:module";
import { readEnv, startSim } from "./sim.mjs";

const env = readEnv();
if (!env.MA_URL || !env.MA_TOKEN || !env.MA_TEST_PLAYER) {
    console.error("Needs MA_URL, MA_TOKEN and MA_TEST_PLAYER in .env");
    process.exit(1);
}
const out = path.resolve(process.argv[2] ?? "sim-out");
const P = env.MA_TEST_PLAYER;
const MEDIA = process.env.SIM_MEDIA ?? "library://album/1";

const require = createRequire(path.resolve("plugin/package.json"));
const WebSocket = require("ws");
const { MusicAssistantClient } = await import("../../packages/ma-client/dist/index.js");
const ma = new MusicAssistantClient({ url: env.MA_URL, token: env.MA_TOKEN, webSocketFactory: (u) => new WebSocket(u) });
ma.start();
await until(() => ma.isConnected, 10000, "MA connection");

const q = () => ma.queues.get(P);
const player = () => ma.players.get(P);
const before = { volume: player()?.volume_level, muted: player()?.volume_muted, shuffle: q()?.shuffle_enabled, repeat: q()?.repeat_mode, crossfade: q()?.crossfade_enabled, autoplay: q()?.autoplay_enabled };
console.log("before:", JSON.stringify(before));
const results = [];
const check = (name, ok, detail = "") => {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

let likedUri;
const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: P } });
try {
    await ma.setVolume(P, 5);
    await ma.playMedia(P, MEDIA);
    await until(() => q()?.state === "playing" && player()?.current_media?.title, 20000, "playback");

    // --- Deck 1: transport + toggles + like
    const k = {
        playPause: sim.add("play-pause-key", {}, { column: 0, row: 0 }),
        previous: sim.add("playback-control-key", { command: "previous" }, { column: 1, row: 0 }),
        next: sim.add("playback-control-key", { command: "next" }, { column: 2, row: 0 }),
        like: sim.add("like-key", {}, { column: 3, row: 0 }),
        shuffle: sim.add("playback-control-key", { command: "shuffle" }, { column: 0, row: 1 }),
        repeat: sim.add("playback-control-key", { command: "repeat" }, { column: 1, row: 1 }),
        crossfade: sim.add("playback-control-key", { command: "crossfade" }, { column: 2, row: 1 }),
        dontStop: sim.add("playback-control-key", { command: "dont_stop" }, { column: 3, row: 1 }),
    };
    await sim.sleep(2500);
    await sim.snapshot(out, "10-transport-initial");

    // Archive.org concert tracks all carry the album name as title, so compare URIs.
    const uri0 = player()?.current_media?.uri;
    sim.press(k.next);
    await until(() => player()?.current_media?.uri && player().current_media.uri !== uri0, 15000, "next track").catch(() => {});
    check("next skips the track", player()?.current_media?.uri !== uri0, `${uri0?.slice(-12)} → ${player()?.current_media?.uri?.slice(-12)}`);

    sim.press(k.shuffle);
    await sim.sleep(250);
    await sim.snapshot(out, "11-shuffle-optimistic");
    await until(() => q()?.shuffle_enabled === !before.shuffle, 5000, "shuffle").catch(() => {});
    check("shuffle toggles", q()?.shuffle_enabled === !before.shuffle);

    sim.press(k.repeat);
    await until(() => q()?.repeat_mode === "all", 5000, "repeat all").catch(() => {});
    sim.press(k.repeat);
    await until(() => q()?.repeat_mode === "one", 5000, "repeat one").catch(() => {});
    check("repeat cycles off → all → one", q()?.repeat_mode === "one", q()?.repeat_mode);

    sim.press(k.crossfade);
    await until(() => q()?.crossfade_enabled === !before.crossfade, 5000, "crossfade").catch(() => {});
    check("crossfade toggles", q()?.crossfade_enabled === !before.crossfade);

    sim.press(k.dontStop);
    await until(() => q()?.autoplay_enabled === !before.autoplay, 5000, "autoplay").catch(() => {});
    check("don't stop the music toggles", q()?.autoplay_enabled === !before.autoplay);

    // Like: wait for the key to know the favorite status, then toggle
    likedUri = player()?.current_media?.uri;
    await sim.sleep(1500);
    const wasFav = (await ma.itemByUri(likedUri)).favorite;
    sim.press(k.like);
    await sim.sleep(2500);
    const nowFav = (await ma.itemByUri(likedUri)).favorite;
    check("like toggles favorite", nowFav === !wasFav, `${likedUri}: ${wasFav} → ${nowFav}`);
    await sim.sleep(500);
    await sim.snapshot(out, "12-transport-toggled");
    if (nowFav === wasFav) likedUri = undefined; // nothing to undo

    // --- Deck 2: volume
    for (const ctx of Object.values(k)) sim.remove(ctx);
    const v = {
        down: sim.add("volume-key", { command: "down", step: 2 }, { column: 0, row: 0 }),
        up: sim.add("volume-key", { command: "up", step: 2 }, { column: 1, row: 0 }),
        mute: sim.add("volume-key", { command: "mute" }, { column: 2, row: 0 }),
        preset: sim.add("volume-key", { command: "preset", preset: 8 }, { column: 3, row: 0 }),
    };
    await sim.sleep(1000);
    await sim.snapshot(out, "20-volume-initial");
    sim.press(v.up);
    sim.press(v.up);
    await sim.sleep(250);
    const optimisticBadge = sim.state.slots.get(v.up).image;
    await sim.snapshot(out, "21-volume-up-optimistic");
    await until(() => player()?.volume_level === 9, 5000, "volume 9").catch(() => {});
    check("two quick 'up' presses land on 5+2+2", player()?.volume_level === 9, `volume ${player()?.volume_level}`);
    sim.press(v.down);
    await until(() => player()?.volume_level === 7, 5000, "volume 7").catch(() => {});
    check("'down' lowers by the step", player()?.volume_level === 7, `volume ${player()?.volume_level}`);
    sim.press(v.preset);
    await until(() => player()?.volume_level === 8, 5000, "preset").catch(() => {});
    check("preset sets the volume", player()?.volume_level === 8, `volume ${player()?.volume_level}`);
    sim.press(v.mute);
    await until(() => player()?.volume_muted === true, 5000, "mute").catch(() => {});
    check("mute mutes", player()?.volume_muted === true);
    await sim.sleep(500);
    await sim.snapshot(out, "22-volume-muted");
    sim.press(v.mute);
    await until(() => player()?.volume_muted === false, 5000, "unmute").catch(() => {});
    check("mute again unmutes", player()?.volume_muted === false);
    void optimisticBadge;
} finally {
    // Restore everything we touched
    try {
        await ma.stopPlayback(P);
        if (typeof before.shuffle === "boolean") await ma.setShuffle(P, before.shuffle);
        if (before.repeat) await ma.setRepeat(P, before.repeat);
        if (typeof before.crossfade === "boolean") await ma.setCrossfade(P, before.crossfade);
        if (typeof before.autoplay === "boolean") await ma.setAutoplay(P, before.autoplay);
        if (typeof before.muted === "boolean") await ma.setMute(P, before.muted);
        if (typeof before.volume === "number") await ma.setVolume(P, before.volume);
        if (likedUri) {
            const item = await ma.itemByUri(likedUri);
            if (item.favorite && item.provider === "library") await ma.removeFavorite(item.media_type, item.item_id);
        }
        await sim.sleep(1000);
        const after = { volume: player()?.volume_level, muted: player()?.volume_muted, shuffle: q()?.shuffle_enabled, repeat: q()?.repeat_mode, crossfade: q()?.crossfade_enabled, autoplay: q()?.autoplay_enabled };
        console.log("after: ", JSON.stringify(after));
    } catch (e) {
        console.error("restore failed", e);
    }
    ma.stop();
    await sim.stop();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed · snapshots in ${out}`);
process.exit(failed ? 1 : 0);

async function until(fn, ms, label) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > ms) throw new Error(`timeout: ${label}`);
        await new Promise((r) => setTimeout(r, 100));
    }
}
