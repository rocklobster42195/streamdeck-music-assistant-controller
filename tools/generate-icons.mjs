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
    "playback-control-key": mdi.mdiSkipNext,
    "volume-key": mdi.mdiVolumeHigh,
    "like-key": mdi.mdiHeart,
    "play-item-key": mdi.mdiStar,
    "continue-key": mdi.mdiBookOpenPageVariant,
    "track-dial": mdi.mdiMusicCircleOutline,
    "volume-dial": mdi.mdiKnob,
    "browser-dial": mdi.mdiFolderMusic,
    "player-key": mdi.mdiSpeaker,
    "player-dial": mdi.mdiSpeakerMultiple,
    "queue-dial": mdi.mdiPlaylistPlay,
    "group-volume-dial": mdi.mdiSpeakerWireless,
    "panorama-dial": mdi.mdiCreation,
    "sleep-timer-key": mdi.mdiSleep,
    "announce-key": mdi.mdiBullhorn,
    "source-key": mdi.mdiAudioInputRca,
    "dashboard-key": mdi.mdiCast,
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

// Category + plugin icon: the Rocklobster lobster shared with Sonos Controller (not the MA logo).
// docs/brand/lobster.svg is a potrace vectorization of sonos-controller's store/lobster_icon.png.
const sharp = require("sharp");
const LOGO_BLUE = "#009FDF"; // Düsseldorf Blau from the house palette (komuh/docs/cd-farben.md)
const lobsterSvg = fs.readFileSync("docs/brand/lobster.svg", "utf8");
const viewBox = lobsterSvg.match(/viewBox="([^"]+)"/)[1];
const lobsterPath = lobsterSvg.match(/ d="([^"]+)"/)[1];
/** The lobster in `color`; `stroke` (viewBox units) thickens the wireframe for small sizes. */
const lobster = (color, stroke = 0) =>
    `<path fill="${color}" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="round" fill-rule="evenodd" d="${lobsterPath}"/>`;

// Category icon (action list): white, filling the icon, lines only slightly thickened (heavier looked clumsy next to Sonos Controller).
fs.rmSync(`${root}/plugin/category-icon.png`, { force: true });
fs.rmSync(`${root}/plugin/category-icon@2x.png`, { force: true });
write(`${root}/plugin/category-icon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="${viewBox}">${lobster("#f2f2f2", 6)}</svg>`);

// Plugin / Marketplace icon (PNG, 256 px + @2x 512 px): dark lobster on a house-palette blue circle.
const pluginIcon = (size) => {
    const pad = size * 0.17;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${LOGO_BLUE}"/><svg x="${pad}" y="${pad}" width="${size - 2 * pad}" height="${size - 2 * pad}" viewBox="${viewBox}">${lobster("#0a141e", 6)}</svg></svg>`;
};
for (const [file, size] of [["marketplace.png", 256], ["marketplace@2x.png", 512]]) {
    await sharp(Buffer.from(pluginIcon(size))).png().toFile(`${root}/plugin/${file}`);
    console.log("wrote", `${root}/plugin/${file}`);
}
