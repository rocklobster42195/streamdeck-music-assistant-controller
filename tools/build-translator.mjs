// Builds translate/data.json for the translation one-pager (translate/index.html):
// all locale files, where each key is used (code + property inspector pages + manifest), and which
// translations are outdated (the English text changed after the translation, via git blame).
//   node tools/build-translator.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(".");
const SD = "plugin/de.boriskemper.music-assistant-controller.sdPlugin";
const SOURCE_DIRS = ["plugin/src", "packages/streamdeck-core/src"];
/** Languages Stream Deck supports (a locale file per language). */
const SUPPORTED = ["en", "de", "es", "fr", "ja", "ko", "zh_CN", "zh_TW"];

// ---- locale files ----------------------------------------------------------------------------------

const languages = {};
for (const file of fs.readdirSync(SD)) {
    const m = /^([a-z]{2}(?:_[A-Z]{2})?)\.json$/.exec(file);
    if (m) languages[m[1]] = JSON.parse(fs.readFileSync(path.join(SD, file), "utf8"));
}

/** Flatten Localization into { "pi.player": "…", "Play/Pause": "…" } (flat manifest keys stay as they are). */
function flatten(obj, prefix = "") {
    const out = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "string") out[key] = v;
        else Object.assign(out, flatten(v, key));
    }
    return out;
}

// ---- where keys are used ------------------------------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(path.join(SD, "manifest.json"), "utf8"));
const actionBySuffix = new Map(manifest.Actions.map((a) => [a.UUID.split(".").pop(), a]));
const actionByPi = new Map(manifest.Actions.map((a) => [a.PropertyInspectorPath, a]));

const usage = new Map(); // key → Set of places
const dynamicPrefixes = new Map(); // prefix → Set of places
const use = (key, place) => {
    if (!usage.has(key)) usage.set(key, new Set());
    usage.get(key).add(place);
};

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function placeOfSource(file) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const src = fs.readFileSync(file, "utf8");
    const uuid = /UUID:\s*"[^"]+\.([a-z0-9-]+)"/.exec(src)?.[1];
    const a = uuid && actionBySuffix.get(uuid);
    if (a) return { label: a.Name, where: a.Controllers.includes("Encoder") ? "dial" : "key", file: rel };
    if (rel.includes("/pi-ui/") || rel.includes("streamdeck-core/src/pi")) return { label: "*", where: "settings", file: rel };
    return { label: "*", where: "plugin", file: rel };
}

for (const file of SOURCE_DIRS.flatMap((d) => walk(d)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const src = fs.readFileSync(file, "utf8");
    const place = JSON.stringify(placeOfSource(file));
    for (const m of src.matchAll(/["'`]((?:key|pi|effect)\.[a-zA-Z0-9_.-]*?)(\$\{|["'`])/g)) {
        if (m[2] === "${") {
            if (!dynamicPrefixes.has(m[1])) dynamicPrefixes.set(m[1], new Set());
            dynamicPrefixes.get(m[1]).add(place);
        } else use(m[1], place);
    }
}

for (const file of fs.readdirSync(path.join(SD, "ui")).filter((f) => f.endsWith(".html"))) {
    const src = fs.readFileSync(path.join(SD, "ui", file), "utf8");
    const a = actionByPi.get(`ui/${file}`);
    const place = JSON.stringify({ label: a?.Name ?? file, where: "settings", file: `${SD}/ui/${file}` });
    for (const m of src.matchAll(/"((?:pi|key)\.[a-z0-9_]+)"/g)) use(m[1], place);
}

// Manifest strings (action names, tooltips, dial triggers)
for (const a of manifest.Actions) {
    const place = (what) => JSON.stringify({ label: a.Name, where: what, file: `${SD}/manifest.json` });
    use(a.Name, place("name"));
    if (a.Tooltip) use(a.Tooltip, place("tooltip"));
    for (const v of Object.values(a.Encoder?.TriggerDescription ?? {})) use(v, place("trigger"));
}

// ---- outdated translations (git blame) --------------------------------------------------------------------

/** key → commit time (seconds) of the line holding it, for one locale file. */
function lineTimes(lang) {
    const rel = `${SD}/${lang}.json`;
    let out;
    try {
        out = execFileSync("git", ["blame", "--line-porcelain", rel], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch {
        return new Map(); // not committed yet
    }
    const times = new Map();
    const stack = [];
    let time = 0;
    for (const line of out.split("\n")) {
        if (line.startsWith("committer-time ")) time = Number(line.slice(15));
        if (!line.startsWith("\t")) continue;
        const text = line.slice(1);
        const depth = text.match(/^\t*/)[0].length;
        const open = /^\t*"([^"]+)":\s*\{\s*$/.exec(text);
        const pair = /^\t*"((?:[^"\\]|\\.)+)":\s*"/.exec(text);
        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        if (open) stack.push({ name: open[1], depth });
        else if (pair) {
            // Inside Localization (depth ≥ 2): prefix with the group names below it
            const groups = stack.filter((s) => s.name !== "Localization").map((s) => s.name);
            if (stack.some((s) => s.name === "Localization")) times.set([...groups, JSON.parse(`"${pair[1]}"`)].join("."), time);
        }
    }
    return times;
}

const enTimes = lineTimes("en");
const outdated = {};
for (const lang of Object.keys(languages).filter((l) => l !== "en")) {
    const times = lineTimes(lang);
    outdated[lang] = [...times.entries()].filter(([k, t]) => (enTimes.get(k) ?? 0) > t).map(([k]) => k);
}

// ---- write -------------------------------------------------------------------------------------------------

const keys = Object.keys(flatten(languages.en?.Localization)).map((key) => {
    const places = new Set(usage.get(key) ?? []);
    // A dynamic key like `pi.state_${state}` fills in one word — don't let it claim "pi.state_playing_on"
    for (const [prefix, set] of dynamicPrefixes) {
        const rest = key.startsWith(prefix) ? key.slice(prefix.length) : undefined;
        if (rest !== undefined && (prefix.endsWith(".") || !rest.includes("_"))) for (const p of set) places.add(p);
    }
    const group = key.startsWith("key.") ? "key" : key.startsWith("pi.") ? "pi" : key.startsWith("effect.") ? "effect" : "manifest";
    return { key, group, usedIn: [...places].map((p) => JSON.parse(p)) };
});

const data = {
    localeDir: SD,
    supported: SUPPORTED,
    languages: Object.fromEntries(Object.entries(languages).map(([l, j]) => [l, { header: { Name: j.Name, Description: j.Description, Category: j.Category }, strings: flatten(j.Localization) }])),
    keys,
    outdated,
};
fs.mkdirSync("translate", { recursive: true });
fs.writeFileSync("translate/data.json", JSON.stringify(data, null, 1));
const unused = keys.filter((k) => !k.usedIn.length).map((k) => k.key);
console.log(`translate/data.json: ${keys.length} keys, ${Object.keys(languages).length} languages, outdated: ${JSON.stringify(Object.fromEntries(Object.entries(outdated).map(([l, k]) => [l, k.length])))}`);
if (unused.length) console.log(`not found in code (${unused.length}): ${unused.join(", ")}`);
