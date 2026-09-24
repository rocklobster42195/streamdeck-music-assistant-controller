// Generates the static SVG icons of the plugin from Material Design Icons (@mdi/js).
// Usage: node tools/generate-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("plugin/package.json"));
const mdi = require("@mdi/js");
const root = "plugin/de.boriskemper.music-assistant-controller.sdPlugin/imgs";

// Action list icon: monochrome white on transparent (Stream Deck tints it). Key: default key image.
const actions = {
    "play-pause-key": mdi.mdiPlayPause,
};

const listIcon = (d) => `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="#ffffff" d="${d}"/></svg>`;
const keyImage = (d) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#101010"/><path transform="translate(32 32) scale(3.333)" fill="#e0e0e0" d="${d}"/></svg>`;

function write(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log("wrote", file);
}

for (const [name, d] of Object.entries(actions)) {
    write(`${root}/actions/${name}/icon.svg`, listIcon(d));
    write(`${root}/actions/${name}/key.svg`, keyImage(d));
}

// Category + plugin icon: placeholder until a proper MAC logo exists (must not be the MA logo).
write(`${root}/plugin/category-icon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path fill="#ffffff" d="${mdi.mdiMusicCircle}"/></svg>`);

// The plugin icon must be PNG (256 px + @2x 512 px).
const sharp = require("sharp");
const pluginIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 288 288"><rect width="288" height="288" rx="48" fill="#1b2a3a"/><path transform="translate(48 48) scale(8)" fill="#7fd1ff" d="${mdi.mdiMusicCircle}"/></svg>`;
for (const [file, size] of [["marketplace.png", 256], ["marketplace@2x.png", 512]]) {
    await sharp(Buffer.from(pluginIcon)).resize(size, size).png().toFile(`${root}/plugin/${file}`);
    console.log("wrote", `${root}/plugin/${file}`);
}
