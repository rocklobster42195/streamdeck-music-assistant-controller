// Marketplace images for the Elgato Marketplace, built from the staged simulator scenes
// (run `node tools/sd-sim/showcase.mjs` first). Output goes to the local docs/marketplace/images/.
// Look: deep night blue, a glow in Music Assistant blue and the covers' warm colors, a thin
// particle network like the Panorama effect, the deck as the hero, short confident headlines.
//   node tools/generate-store-assets.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("plugin/package.json"));
const sharp = require("sharp");

const OUT = "docs/marketplace/images";
const SCENES = "sim-out/showcase";
const MA_BLUE = "#03a9f4";
const WARM = "#ff7a59";
fs.mkdirSync(OUT, { recursive: true });

const lobster = fs.readFileSync("docs/brand/lobster.svg", "utf8");
const lobsterViewBox = lobster.match(/viewBox="([^"]+)"/)[1];
const lobsterPath = lobster.match(/ d="([^"]+)"/)[1];

/** Seeded random, so every run draws the same background. */
function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296);
}

/** Night-blue background with two glows and a sparse particle network. */
function background(w, h, seed = 7) {
    const r = rng(seed);
    const pts = Array.from({ length: Math.round((w * h) / 26000) }, () => ({ x: r() * w, y: r() * h, s: 1.5 + r() * 2.5 }));
    const lines = [];
    for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
            const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            if (d < 150) lines.push(`<line x1="${pts[i].x.toFixed(0)}" y1="${pts[i].y.toFixed(0)}" x2="${pts[j].x.toFixed(0)}" y2="${pts[j].y.toFixed(0)}" stroke="${MA_BLUE}" stroke-opacity="${((1 - d / 150) * 0.22).toFixed(2)}" stroke-width="1.5"/>`);
        }
    return `
<defs>
  <radialGradient id="glowA" cx="0.78" cy="0.35" r="0.55"><stop offset="0" stop-color="${MA_BLUE}" stop-opacity="0.45"/><stop offset="1" stop-color="${MA_BLUE}" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowB" cx="0.15" cy="0.95" r="0.5"><stop offset="0" stop-color="${WARM}" stop-opacity="0.28"/><stop offset="1" stop-color="${WARM}" stop-opacity="0"/></radialGradient>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.65"/></filter>
</defs>
<rect width="${w}" height="${h}" fill="#070b16"/>
<rect width="${w}" height="${h}" fill="url(#glowA)"/><rect width="${w}" height="${h}" fill="url(#glowB)"/>
${lines.join("")}
${pts.map((p) => `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="${p.s.toFixed(1)}" fill="${MA_BLUE}" opacity="0.5"/>`).join("")}`;
}

/** The lobster mark on a Music Assistant blue circle. */
function mark(cx, cy, r) {
    const pad = r * 0.34;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${MA_BLUE}"/><svg x="${cx - r + pad}" y="${cy - r + pad}" width="${2 * (r - pad)}" height="${2 * (r - pad)}" viewBox="${lobsterViewBox}"><path fill="#0a141e" stroke="#0a141e" stroke-width="6" fill-rule="evenodd" d="${lobsterPath}"/></svg>`;
}

const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const FONT = `font-family="Segoe UI, Arial, sans-serif"`;

/** A deck render, framed like a device: rounded dark body with a soft shadow. */
async function device(scene, width) {
    const img = sharp(path.join(SCENES, `${scene}.png`));
    const meta = await img.metadata();
    const h = Math.round((meta.height / meta.width) * width);
    const png = (await img.resize(width, h).png().toBuffer()).toString("base64");
    const pad = Math.round(width * 0.035);
    return { w: width + 2 * pad, h: h + 2 * pad, svg: (x, y) => `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${width + 2 * pad}" height="${h + 2 * pad}" rx="${pad * 1.4}" fill="#121521" stroke="#2a2f45" stroke-width="2"/></g><image href="data:image/png;base64,${png}" x="${x + pad}" y="${y + pad}" width="${width}" height="${h}"/>` };
}

async function write(file, w, h, body) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${background(w, h, w + h)}${body}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, file));
    console.log("wrote", path.join(OUT, file));
}

/** Headline block: eyebrow, two-line title, subline. */
function copy(x, y, eyebrow, title, sub, size = 64) {
    const lines = title.split("\n");
    return `<text x="${x}" y="${y}" ${FONT} font-size="${Math.round(size * 0.34)}" font-weight="700" letter-spacing="3" fill="${MA_BLUE}">${esc(eyebrow.toUpperCase())}</text>
${lines.map((l, i) => `<text x="${x}" y="${y + size * 1.25 + i * size * 1.1}" ${FONT} font-size="${size}" font-weight="800" fill="#ffffff">${esc(l)}</text>`).join("")}
${sub.split("\n").map((l, i) => `<text x="${x}" y="${y + size * 1.25 + lines.length * size * 1.1 + 24 + i * size * 0.52}" ${FONT} font-size="${Math.round(size * 0.4)}" fill="#b9c2d8">${esc(l)}</text>`).join("")}`;
}

// Thumbnail 1920×960: mark, name, the deck
{
    const d = await device("01-overview", 940);
    await write("store-thumbnail-1920x960.png", 1920, 960, `
${mark(190, 200, 70)}
${copy(120, 360, "Music Assistant Controller", "Your music.\nOn every key.", "Spotify, your files, radio and podcasts —\non any speaker Music Assistant knows.", 76)}
${d.svg(1920 - d.w - 90, (960 - d.h) / 2)}`);
}

// Showcases 1920×960
const showcases = [
    ["store-showcase-0-lyrics.png", "05-lyrics", "Synced lyrics", "Sing along.\nOn your deck.", "The line being sung, across all Panorama\ndials, in time with the music.\nTurn to fine-tune, tap to re-sync."],
    ["store-showcase-1-panorama.png", "02-panorama", "Panorama", "One scene.\nFour dials.", "Effects span neighbouring dials, tinted by the cover,\nwith the title or synced lyrics on top."],
    ["store-showcase-2-browser.png", "04-browser", "Browse & queue", "Find it.\nPlay it.", "Scroll every service or your library on the dial,\njump through the queue, switch rooms with a turn."],
    ["store-showcase-3-effects.png", "03-matrix", "Made to look good", "Covers, colors,\nmotion.", "Crossfading covers, rings in the cover's color,\neffects behind any dial."],
    ["store-showcase-4-keys.png", "01-overview", "Everyday keys", "Every room.\nOne deck.", "Skip, play, shuffle, volume and mute —\nand a timer that tells you the pasta is ready."],
];
for (const [file, scene, eyebrow, title, sub] of showcases) {
    const d = await device(scene, 940);
    await write(file, 1920, 960, `${copy(110, 290, eyebrow, title, sub, 72)}${d.svg(1920 - d.w - 70, (960 - d.h) / 2)}`);
}

// Settings showcase: three settings panels side by side (run `node tools/pi-shots.mjs` first)
if (fs.existsSync("sim-out/pi-shots/panorama.png")) {
    const names = ["setup", "play-pause", "panorama"];
    const H = 800;
    const panels = [];
    // One scale for all three, so they keep their real proportions
    const metas = await Promise.all(names.map((n) => sharp(`sim-out/pi-shots/${n}.png`).metadata()));
    const scale = Math.min(1, H / Math.max(...metas.map((m) => m.height)), 400 / Math.max(...metas.map((m) => m.width)));
    for (const n of names) {
        const img = sharp(`sim-out/pi-shots/${n}.png`);
        const m = await img.metadata();
        const w = Math.round(m.width * scale);
        const h = Math.round(m.height * scale);
        panels.push({ w, h, b64: (await img.resize(w, h).png().toBuffer()).toString("base64") });
    }
    let x = 1920 - 70 - panels.reduce((sum, p) => sum + p.w + 28, -28);
    const top = (960 - Math.max(...panels.map((p) => p.h))) / 2;
    const imgs = panels.map((p) => {
        const y = top;
        const svg = `<g filter="url(#shadow)"><rect x="${x - 6}" y="${y - 6}" width="${p.w + 12}" height="${p.h + 12}" rx="16" fill="#1c1c1e" stroke="#2a2f45" stroke-width="2"/></g><image href="data:image/png;base64,${p.b64}" x="${x}" y="${y}" width="${p.w}" height="${p.h}"/>`;
        x += p.w + 28;
        return svg;
    });
    await write("store-showcase-5-settings.png", 1920, 960, `${copy(110, 290, "Easy settings", "Set up\nin a minute.", "Server and token once, then every key\nworks. Live status, room picker, effects\nand lyrics timing — all in plain words.", 72)}${imgs.join("")}`);
}

// Banner 1280×640
{
    const d = await device("02-panorama", 640);
    await write("store-banner.png", 1280, 640, `${mark(120, 130, 46)}${copy(80, 250, "Music Assistant Controller", "Your music.\nOn every key.", "For Stream Deck and Stream Deck +", 54)}${d.svg(1280 - d.w - 50, (640 - d.h) / 2)}`);
}

// Icon 288×288: the plugin icon at store size
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288">${mark(144, 144, 144)}</svg>`)).png().toFile(path.join(OUT, "store-icon-288.png"));
console.log("wrote", path.join(OUT, "store-icon-288.png"));
