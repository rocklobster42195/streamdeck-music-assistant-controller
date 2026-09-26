// Screenshots of the settings panels for the Marketplace: starts the PI preview (invented
// household, see pi-preview.mjs), captures three panels with headless Chrome and trims them.
// Output: sim-out/pi-shots/{setup,play-pause,panorama}.png
//   node tools/pi-shots.mjs
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("plugin/package.json"));
const sharp = require("sharp");
const OUT = "sim-out/pi-shots";
const BASE = "http://localhost:5199";
fs.mkdirSync(OUT, { recursive: true });

const preview = spawn(process.execPath, ["tools/pi-preview.mjs"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 3000));
try {
    const shots = [
        ["setup", `${BASE}/play-pause-key.html?scenario=setup&lang=en`, []],
        ["play-pause", `${BASE}/play-pause-key.html?scenario=connected&lang=en&click=${encodeURIComponent("mac-player-picker .pi-select-button")}`, []],
        ["panorama", `${BASE}/panorama-dial.html?scenario=connected&lang=en`, ["--click", '[data-value="lyrics"]']],
    ];
    for (const [name, url, extra] of shots) {
        const raw = path.join(OUT, `${name}-raw.png`);
        execFileSync(process.execPath, ["tools/screenshot.mjs", url, raw, ...extra, "--height", "1500"], { stdio: "ignore" });
        // Cut the empty panel background below the content
        await sharp(raw).trim({ background: "#1c1c1e", threshold: 6 }).toFile(path.join(OUT, `${name}.png`));
        fs.rmSync(raw);
        console.log("wrote", path.join(OUT, `${name}.png`));
    }
} finally {
    preview.kill();
}
