// MA-C against a Music Assistant that reports a Sonos speaker late (fake-ma-late.mjs, measured
// 2026-10-09): does the deck show the track that really plays, keep a pause, resume with an
// explicit play, and skip from the right track? A fake SO-C on deckbus reports the speaker's own
// play state, as the real one does. Runs on its own deckbus namespace, away from the real deck.
// No real playback. Takes about 80 s.
//   node tools/sd-sim/late-ma.mjs [outDir]
import path from "node:path";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { PLAYER, startLateMa } from "./fake-ma-late.mjs";
import { startSim } from "./sim.mjs";

const NS = `deckbus-sim-${process.pid}`;
process.env.DECKBUS_NAMESPACE = NS; // the plugin under test inherits it
const out = path.resolve(process.argv[2] ?? "sim-out", "late-ma");
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const t0 = Date.now();
const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}  ${s}`);

const ma = await startLateMa();

// The fake SO-C: the speaker's own play state, about a second after it changes (as measured)
const soc = new DeckBus({ id: "sim-soc", name: "SO-C", version: "1", namespace: NS, scanMs: 300 });
await soc.start();
const publishSoc = (playing) => soc.setState("players", [{ player: PLAYER, device: PLAYER, name: "Sim Room", kind: "speaker", direct: true, playing, since: t0 }]);
publishSoc(true);
ma.onReal((r) => setTimeout(() => publishSoc(r.playing), 1000));

// The probe: what MA-C publishes for the speaker, and a way to send it commands like another plugin's key
const probe = new DeckBus({ id: "sim-probe", name: "Probe", version: "1", namespace: NS, scanMs: 300 });
let peers = [];
probe.onPeers((p) => (peers = p));
await probe.start();
const mac = () => peers.find((p) => p.name === "MA-C");
const shown = () => mac()?.state.players?.find((p) => p.player === PLAYER);
const transport = (command, value) => probe.request(mac(), "transport", { player: PLAYER, command, value }, 10_000);
const lastCommands = (n) => ma.commands.slice(-n).map((c) => (c.command === "player_queues/play_index" ? `play_index ${c.args.index}` : c.command.replace("player_queues/", "")));

const sim = await startSim({ language: "en", globalSettings: { maUrl: ma.url, maToken: "sim", activePlayerId: PLAYER } });
const until = async (cond, ms, label) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (cond()) return true;
        await sim.sleep(100);
    }
    log(`timed out: ${label}`);
    return false;
};
try {
    const key = sim.add("play-pause-key", { playerId: PLAYER }, { column: 0 });
    await until(() => shown()?.title === "Sim Track 0", 15_000, "MA-C shows the first track");
    check("MA-C shows the speaker on deckbus", shown()?.title === "Sim Track 0", JSON.stringify(shown()?.title));

    // 1) A natural change: the speaker moves on, MA reports it 6 s later
    await until(() => ma.real().index === 1, 15_000, "real change");
    const changedAt = Date.now();
    await until(() => shown()?.title === "Sim Track 1", 3000, "MA-C follows the change");
    const lag = (Date.now() - changedAt) / 1000;
    check("the next track shows at the real change, not when MA reports it", lag < 1.5 && ma.reported().index === 0, `after ${lag.toFixed(1)} s, MA still on ${ma.reported().title}`);
    await sim.snapshot(out, "01-change");

    // 2) A pause right after the change, while MA still names the old track
    await sim.sleep(1500);
    sim.press(key);
    await until(() => shown()?.playing === false, 4000, "paused");
    check("the key sends an explicit pause", lastCommands(1)[0] === "pause", lastCommands(1).join(", "));
    check("paused right after a change keeps the track that really played", shown()?.playing === false && shown()?.title === "Sim Track 1", `${shown()?.title}, playing ${shown()?.playing}, MA: ${ma.reported().title} ${ma.reported().state}`);
    await sim.snapshot(out, "02-paused");

    // 3) Still paused after 45 s, although MA reports "playing" all along
    await sim.sleep(45_000);
    check("still paused after 45 s while MA says playing", shown()?.playing === false && ma.reported().state === "playing", `${shown()?.title}, playing ${shown()?.playing}`);
    await sim.snapshot(out, "03-still-paused");

    // 4) Play: an explicit play; MA resumes from the time it counted on, past the track's end
    sim.press(key);
    await until(() => shown()?.playing === true, 4000, "playing again");
    check("the key sends an explicit play (MA's own toggle would pause again)", lastCommands(1)[0] === "play", lastCommands(1).join(", "));
    await until(() => shown()?.title === ma.real().title, 3000, "shows what plays after the resume");
    check("after the resume the deck shows what really plays", shown()?.title === ma.real().title, `deck ${shown()?.title}, speaker ${ma.real().title}, MA ${ma.reported().title}`);
    await sim.snapshot(out, "04-resumed");

    // 5) Skips from another plugin's key while MA lags or falls back to the old track
    await sim.sleep(1000);
    const before = ma.real().index;
    await transport("next");
    await sim.sleep(4000);
    await transport("next");
    await sim.sleep(4000);
    await transport("next");
    await sim.sleep(1500);
    check("three Nexts move three tracks on, even while MA shows the old one", ma.real().index === before + 3, `${before} → ${ma.real().index}; sent ${lastCommands(3).join(", ")}`);
    await until(() => shown()?.title === ma.real().title, 3000, "shows the skipped-to track");
    check("the deck shows the track skipped to", shown()?.title === ma.real().title, `deck ${shown()?.title}, speaker ${ma.real().title}, MA ${ma.reported().title}`);
    await sim.snapshot(out, "05-skipped");
} finally {
    await sim.stop();
    await ma.stop();
    probe.stop();
    soc.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
