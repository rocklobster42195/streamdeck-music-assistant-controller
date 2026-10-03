// The list dials (kit ListController) against the real MA server, read-only: the Browser dial in
// the library (root, Albums, scrolling, back) and the Queue dial on the test player. Never plays.
//   node tools/sd-sim/list.mjs [outDir]
import path from "node:path";
import { readEnv, startSim } from "./sim.mjs";

const env = readEnv();
const out = path.resolve(process.argv[2] ?? "sim-out");
const sim = await startSim({ globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: env.MA_TEST_PLAYER } });
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
try {
    const browser = sim.add("browser-dial", { timeout: 120, start: "library" }, { column: 0, controller: "Encoder" });
    const queue = sim.add("queue-dial", {}, { column: 1, controller: "Encoder" });
    const img = (ctx) => sim.state.slots.get(ctx).feedback["full-canvas"] ?? "";
    const svg = (ctx) => Buffer.from(img(ctx).split(",")[1] ?? "", "base64").toString();
    await sim.sleep(2500);
    await sim.snapshot(out, "10-idle");

    sim.rotate(browser, 1); // first turn: start browsing
    await sim.sleep(1500);
    await sim.snapshot(out, "11-library");
    check("library root shows Favorites", svg(browser).includes("Favoriten"));
    check("breadcrumb overlay after opening", svg(browser).includes("Bibliothek"));

    sim.rotate(browser, 1);
    await sim.sleep(500);
    sim.rotate(browser, 1);
    await sim.sleep(500);
    sim.rotate(browser, 1); // → Albums (in progress, favorites, playlists, albums)
    await sim.sleep(2200);
    await sim.snapshot(out, "12-library-albums");
    check("breadcrumb overlay gone after 2 s", !svg(browser).includes("Bibliothek ›"));
    sim.dialPress(browser);
    await sim.sleep(4000);
    await sim.snapshot(out, "13-albums");
    check("albums show covers", img(browser).length > 8000, `${img(browser).length} bytes`);

    sim.rotate(browser, 5); // fast spin: two rows per tick
    await sim.sleep(1200);
    await sim.snapshot(out, "14-albums-spun");
    await sim.sleep(1500);
    await sim.snapshot(out, "15-albums-marquee");

    sim.touch(browser); // back: lands on Albums again
    await sim.sleep(800);
    await sim.snapshot(out, "16-back");

    sim.rotate(queue, 1);
    await sim.sleep(1500);
    await sim.snapshot(out, "20-queue");
} finally {
    await sim.stop();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
