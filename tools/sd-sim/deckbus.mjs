// Panorama "Audio source" over deckbus: a fake level source joins the bus next to the plugin, the
// PI lists its stream, the dial subscribes only while it uses it and is visible. Fake MA, no playback.
//   node tools/sd-sim/deckbus.mjs [outDir]
import path from "node:path";
import { DeckBus, neighbours } from "@rocklobster42195/streamdeck-kit/bus";
import { startFakeMa } from "./fake-ma.mjs";
import { startSim } from "./sim.mjs";

const out = path.resolve(process.argv[2] ?? "sim-out", "deckbus");
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// The level source: a kick at 120 BPM with a slow swell, sent only while someone subscribes
const source = new DeckBus({ id: "sim-level-source", name: "Fake source", version: "1", caps: ["meters"], scanMs: 500 });
await source.start();
source.setState("streams", [{ topic: "meters/test", label: "Fake music", stereo: true }]);
let subscribers = 0;
let timer;
const t0 = Date.now();
const db = (t) => 20 * Math.log10(Math.max(1e-4, (0.04 + 0.6 * Math.exp(-((t / 500) % 1) * 9)) * (0.15 + 0.85 * (0.5 - 0.5 * Math.cos(t / 1300))))) - 6;
source.onSubscribers("meters/test", (n) => {
    subscribers = n;
    clearInterval(timer);
    if (n) timer = setInterval(() => source.publish("meters/test", { l: db(Date.now() - t0), r: db(Date.now() - t0 + 20) }), 50);
});

// Plugins already on the bus (e.g. MA-C in the real Stream Deck, same id and name) aren't the one under test
await new Promise((r) => setTimeout(r, 1200));
const before = new Set(source.peers().map((p) => p.slot));
const simMac = () => source.peers().find((p) => p.name === "MA-C" && !before.has(p.slot));

const ma = await startFakeMa();
const sim = await startSim({ language: "en", globalSettings: { maUrl: ma.url, maToken: "demo", activePlayerId: "living" } });
try {
    const dials = [0, 1, 2, 3].map((column) => sim.add("panorama-dial", { background: "boing-ball" }, { column, controller: "Encoder" }));
    await sim.waitFor(() => !!simMac(), 15000, "MA-C on the bus");
    check("MA-C joins the bus with its status", !!simMac()?.state.status?.online, JSON.stringify(simMac()?.state.status));

    // "actions": where MA-C's dials sit, with their effect; the source sees them as its neighbours
    await sim.waitFor(() => (simMac()?.state.actions?.length ?? 0) === 4, 5000, "actions state");
    const shared = simMac().state.actions;
    check("MA-C shares its visible dials with their effect", shared.every((a, i) => a.column === i && a.controller === "Encoder" && a.effect === "boing-ball" && a.action.endsWith(".panorama-dial")), JSON.stringify(shared[0]));
    const next = neighbours([simMac()], { device: shared[0].device, column: 4, row: 0, controller: "Encoder" });
    check("a dial in column 4 has MA-C's Panorama on its left", next.length === 1 && next[0].side === "left" && next[0].action.column === 3);

    sim.piOpen(dials[0]);
    sim.piSend(dials[0], { event: "options", requestId: 41, source: "audio-sources" });
    await sim.waitFor(() => sim.state.piMessages.some((m) => m.event === "options-result" && m.requestId === 41), 5000, "audio sources");
    const items = sim.state.piMessages.find((m) => m.event === "options-result" && m.requestId === 41).items;
    check("the PI lists None, then the offered stream", items[0]?.value === "" && items.some((i) => i.value === "sim-level-source|meters/test" && i.sub === "Fake source"), items.map((i) => `${i.label}/${i.sub ?? ""}`).join(", "));
    check("nothing is subscribed before a source is chosen", subscribers === 0);

    sim.setSettings(dials[1], { background: "boing-ball", audioSource: "sim-level-source|meters/test", audioSourceName: "Fake music" });
    await sim.waitFor(() => subscribers === 1, 5000, "subscription");
    check("choosing the source subscribes", subscribers === 1);
    for (let i = 0; i < 8; i++) {
        await sim.sleep(400);
        await sim.snapshot(out, `level-${i}`);
    }

    sim.remove(dials[1]);
    await sim.sleep(800);
    check("a hidden dial unsubscribes", subscribers === 0, `${subscribers} subscriber(s)`);
} finally {
    await sim.stop();
    await ma.stop?.();
    source.stop();
    clearInterval(timer);
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
