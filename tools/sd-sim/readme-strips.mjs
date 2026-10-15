// README strips: one row of four dials per feature, rendered at twice the size (the keys are left
// out, so the picture shows the feature and not the same keys again). Against the stand-in Music
// Assistant (fake-ma.mjs): invented music, nothing is played anywhere.
//   node tools/sd-sim/readme-strips.mjs [scene]     scenes: panorama, matrix, lyrics, browser
// Writes docs/screenshots/strip-<scene>.png.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startFakeMa } from "./fake-ma.mjs";
import { startSim } from "./sim.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sharp = createRequire(path.join(root, "package.json"))("sharp");
const OUT = path.join(root, "docs", "screenshots");
const SCALE = 2;
const GAP = 4;

/** The pixmap of a dial slot as a PNG at 200 × 100 times SCALE (SVGs are drawn at that size). */
async function strip(slot) {
    const fb = slot.feedback ?? {};
    const key = Object.keys(fb).find((k) => typeof fb[k] === "string" && fb[k].startsWith("data:image"));
    const nested = Object.values(fb).find((v) => v && typeof v === "object" && typeof v.value === "string" && v.value.startsWith("data:image"));
    const uri = key ? fb[key] : nested?.value;
    const m = uri && /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uri);
    const [w, h] = [200 * SCALE, 100 * SCALE];
    if (!m) return sharp({ create: { width: w, height: h, channels: 4, background: "#111" } }).png().toBuffer();
    const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
    return sharp(buf, { density: 72 * SCALE }).resize(w, h).png().toBuffer();
}

const ma = await startFakeMa();
const dial = (sim, suffix, settings, column) => sim.add(suffix, settings, { column, controller: "Encoder" });

const scenes = {
    panorama: { settle: 4500, build: (sim) => [0, 1, 2, 3].map((c) => dial(sim, "panorama-dial", { background: "particles", text: "track" }, c)) },
    matrix: {
        settle: 4500,
        build: (sim) => [
            dial(sim, "track-dial", { background: "matrix-rain" }, 0),
            ...[1, 2].map((c) => dial(sim, "panorama-dial", { background: "matrix-rain", text: "off" }, c)),
            dial(sim, "group-volume-dial", { background: "matrix-rain", ringCoverColor: true }, 3),
        ],
    },
    lyrics: { settle: 6000, build: (sim) => [0, 1, 2, 3].map((c) => dial(sim, "panorama-dial", { background: "particles", text: "lyrics", lyricsOffset: 0.5 }, c)) },
    browser: {
        settle: 3000,
        build: (sim) => [dial(sim, "browser-dial", {}, 0), dial(sim, "queue-dial", {}, 1), dial(sim, "player-dial", {}, 2), dial(sim, "volume-dial", {}, 3)],
        after: async (sim, ctxs) => {
            const b = ctxs[0];
            sim.rotate(b, 1);
            await sim.sleep(1200);
            sim.rotate(b, 1);
            await sim.sleep(300);
            sim.dialPress(b);
            await sim.sleep(1200);
            sim.dialPress(b);
            await sim.sleep(1500);
        },
    },
};

try {
    const only = process.argv[2];
    for (const [name, def] of Object.entries(scenes)) {
        if (only && only !== name) continue;
        const sim = await startSim({ language: "en", globalSettings: { maUrl: ma.url, maToken: "demo", activePlayerId: "living" } });
        try {
            const ctxs = def.build(sim);
            await sim.sleep(def.settle);
            if (def.after) await def.after(sim, ctxs);
            const parts = await Promise.all(ctxs.map((c) => strip(sim.state.slots.get(c))));
            const w = 200 * SCALE, h = 100 * SCALE, gap = GAP * SCALE;
            const total = parts.length * w + (parts.length - 1) * gap;
            const file = path.join(OUT, `strip-${name}.png`);
            fs.mkdirSync(OUT, { recursive: true });
            await sharp({ create: { width: total, height: h, channels: 4, background: "#000000" } })
                .composite(parts.map((input, i) => ({ input, left: i * (w + gap), top: 0 })))
                .png()
                .toFile(file);
            console.log("wrote", path.relative(root, file));
        } finally {
            await sim.stop();
        }
    }
} finally {
    await ma.stop();
}
process.exit(0);
