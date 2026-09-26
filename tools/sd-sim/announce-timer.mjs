// Announcement key with a timer: a press starts the countdown (ring and time on the key), a second
// press cancels it — so no announcement is ever spoken here. Also checks the icon search the PI
// uses (all Material Design Icons) and a picked icon on the key. No playback.
//   node tools/sd-sim/announce-timer.mjs [outDir]
import path from "node:path";
import { readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: env.MA_TEST_PLAYER } });
try {
    const k = sim.add("announce-key", { message: "Test", when: "timer", minutes: 9, icon: "mdiPasta" }, { column: 0, row: 0 });
    await sim.sleep(2000);
    await sim.snapshot(out, "99-announce-idle");
    sim.press(k);
    await sim.sleep(1500);
    const end = sim.state.slots.get(k).settings.timerEnd;
    check("a press starts the countdown (end saved)", typeof end === "number" && end - Date.now() > 8 * 60_000, String(end));
    await sim.snapshot(out, "99-announce-running");
    sim.press(k); // cancel — nothing is spoken
    await sim.sleep(800);
    check("a second press cancels it", sim.state.slots.get(k).settings.timerEnd === undefined);

    sim.piOpen(k);
    sim.piSend(k, { event: "options", requestId: 7, source: "mdi-icons", params: { q: "pasta" } });
    await sim.sleep(800);
    const reply = sim.state.piMessages.find((m) => m?.event === "options-result" && m.requestId === 7);
    check("the icon search finds pasta", !!reply?.items?.some((i) => i.value === "mdiPasta" && i.icon), reply?.items?.slice(0, 4).map((i) => i.value).join(", "));
} finally {
    await sim.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
