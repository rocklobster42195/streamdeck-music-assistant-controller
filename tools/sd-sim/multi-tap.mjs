// The Play/Pause key's double and triple tap against the fake late MA (no real playback): one tap
// plays/pauses after the tap window, two skip to the next track, three back to the previous one.
// Runs on its own deckbus namespace.
//   node tools/sd-sim/multi-tap.mjs [outDir]
import { PLAYER, startLateMa } from "./fake-ma-late.mjs";
import { startSim } from "./sim.mjs";

process.env.DECKBUS_NAMESPACE = `deckbus-sim-${process.pid}`;
const ok = [];
const check = (name, pass, detail = "") => {
    ok.push(pass);
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const ma = await startLateMa();
const sim = await startSim({ language: "en", globalSettings: { maUrl: ma.url, maToken: "sim", activePlayerId: PLAYER } });
const names = () => ma.commands.map((c) => (c.command === "player_queues/play_index" ? `play_index ${c.args.index}` : c.command.replace("player_queues/", "")));
try {
    const key = sim.add("play-pause-key", { playerId: PLAYER }, { column: 0 });
    await sim.sleep(4000);
    // As in the PI: the switch is turned on while the key is already on the deck
    sim.setSettings(key, { player: `device:${PLAYER}`, multiTap: true });
    await sim.sleep(300);
    const taps = async (n, gap = 120) => {
        const before = names().length;
        for (let i = 0; i < n; i++) {
            sim.press(key);
            await sim.sleep(gap);
        }
        await sim.sleep(1200);
        return names().slice(before);
    };
    const one = await taps(1);
    check("one tap plays or pauses", one.length === 1 && /pause|play$/.test(one[0]), one.join(", "));
    const two = await taps(2);
    check("two taps skip to the next track", two.length === 1 && /next|play_index/.test(two[0]), two.join(", "));
    const three = await taps(3);
    check("three taps go to the previous track", three.length === 1 && /previous|play_index/.test(three[0]), three.join(", "));
} finally {
    await sim.stop();
    await ma.stop?.();
}
process.exit(ok.every(Boolean) ? 0 : 1);
