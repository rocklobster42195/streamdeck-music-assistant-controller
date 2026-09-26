// Effect choice across connected displays: changing the effect on one display of a panorama group
// switches the whole group (setting `syncEffect`, default on); with it off, or when choosing no
// effect, only that display changes. No playback needed.
//   node tools/sd-sim/effect-sync.mjs [outDir]
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
    const a = sim.add("panorama-dial", { background: "particles" }, { column: 0, controller: "Encoder" });
    const b = sim.add("panorama-dial", { background: "particles" }, { column: 1, controller: "Encoder" });
    const c = sim.add("panorama-dial", { background: "particles" }, { column: 2, controller: "Encoder" });
    const t = sim.add("track-dial", { background: "particles" }, { column: 3, controller: "Encoder" });
    const bg = (ctx) => sim.state.slots.get(ctx).settings.background;
    const all = () => [a, b, c, t].map(bg).join(",");
    await sim.sleep(2500);

    sim.setSettings(b, { background: "boing-globe" });
    await sim.sleep(1500);
    check("change on one display switches the whole group", [a, b, c, t].every((x) => bg(x) === "boing-globe"), all());
    await sim.snapshot(out, "96-effect-sync-1");

    sim.setSettings(c, { background: "matrix-rain", syncEffect: false });
    await sim.sleep(1500);
    check("with sync off only that display changes", bg(c) === "matrix-rain" && [a, b, t].every((x) => bg(x) === "boing-globe"), all());

    sim.setSettings(t, { background: "" });
    await sim.sleep(1500);
    check("choosing no effect takes only that display out", bg(t) === "" && bg(a) === "boing-globe" && bg(b) === "boing-globe", all());
    await sim.snapshot(out, "96-effect-sync-2");
} finally {
    await sim.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
