// A stand-in Music Assistant server for staged screenshots (README, Marketplace): invented rooms,
// a queue with invented tracks, and generated abstract covers served through /imageproxy — so the
// pictures never depend on (or disturb) what is really playing, and carry no real album art.
// Only what MAC asks for is answered; everything else returns null.
//   const ma = await startFakeMa(); … ma.url … await ma.stop();
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(path.join(root, "plugin/package.json"));
const { WebSocketServer } = require("ws");
const sharp = require("sharp");

/** Invented albums: palette → generated cover. */
export const ALBUMS = {
    neon: { title: "Midnight Tram", artist: "Neon Harbor", album: "City Lights", colors: ["#ff5f6d", "#ffc371", "#2b1055"], duration: 214 },
    night: { title: "Night Drive", artist: "Various", album: "Night Drive", colors: ["#0f2027", "#2c5364", "#7f5af0"], duration: 0 },
    tide: { title: "Low Tide", artist: "Aurora Fields", album: "Salt & Glass", colors: ["#43cea2", "#185a9d", "#0b132b"], duration: 245 },
    ember: { title: "Ember Road", artist: "The Paper Kites Club", album: "Ember Road", colors: ["#f12711", "#f5af19", "#2d0b00"], duration: 198 },
    lime: { title: "Citrus Sky", artist: "Mono Garden", album: "Citrus Sky", colors: ["#a8ff78", "#78ffd6", "#1b4332"], duration: 187 },
    violet: { title: "Slow Orbit", artist: "Kepler Lane", album: "Slow Orbit", colors: ["#8e2de2", "#4a00e0", "#e0c3fc"], duration: 262 },
    radio: { title: "Harbor FM", artist: "Live radio", album: "", colors: ["#00c6ff", "#0072ff", "#001a33"], duration: 0 },
};

/** An abstract cover: gradient, soft circles and a wave — no text, nothing real. */
export function coverSvg([a, b, c]) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="r" cx="0.7" cy="0.3" r="0.6"><stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#r)"/>
<circle cx="150" cy="360" r="120" fill="${c}" opacity="0.55"/><circle cx="360" cy="170" r="70" fill="#ffffff" opacity="0.18"/>
<path d="M0 400 C 120 340, 220 470, 340 400 S 512 360, 512 360 L512 512 L0 512 Z" fill="${c}" opacity="0.7"/></svg>`;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function media(key, extra = {}) {
    const a = ALBUMS[key];
    return {
        uri: `spotify--demo://track/${key}`,
        media_type: "track",
        title: a.title,
        artist: a.artist,
        album: a.album,
        image_url: `/imageproxy/${key}?size=512`,
        duration: a.duration,
        palette: { accent: hex(a.colors[0]), primary: hex(a.colors[1]), on_dark: hex(a.colors[0]) },
        ...extra,
    };
}

function queueItem(key, index) {
    const a = ALBUMS[key];
    return {
        queue_item_id: `qi-${key}-${index}`,
        index,
        name: `${a.artist} - ${a.title}`,
        duration: a.duration,
        image: { type: "thumb", path: key, provider: "demo", proxy_id: key },
        media_item: { uri: `spotify--demo://track/${key}`, media_type: "track", name: a.title, artists: [{ name: a.artist }], album: { name: a.album, item_id: key, provider: "demo" } },
        streamdetails: { provider: "spotify--demo" },
    };
}

/** The staged household. `now` is the server time the elapsed values refer to. */
function household(now) {
    const room = (id, name, state, key, volume, extra = {}) => ({
        player_id: id,
        name,
        display_name: name,
        available: state !== "offline",
        enabled: true,
        powered: true,
        playback_state: state === "offline" ? "idle" : state,
        volume_level: volume,
        volume_muted: false,
        group_members: [],
        synced_to: null,
        active_source: id,
        current_media: key ? media(key, { elapsed_time: 0, elapsed_time_last_updated: now }) : null,
        source_list: [],
        ...extra,
    });
    const players = [
        room("living", "Living Room", "playing", "neon", 42),
        room("kitchen", "Kitchen", "paused", "tide", 30),
        room("office", "Office", "playing", "violet", 25),
        room("bedroom", "Bedroom", "idle", null, 18),
        room("terrace", "Terrace", "offline", null, 0),
    ];
    const queue = (id, state, key, index, elapsed, extra = {}) => ({
        queue_id: id,
        active: true,
        display_name: players.find((p) => p.player_id === id).name,
        available: true,
        items: 24,
        shuffle_enabled: false,
        repeat_mode: "off",
        crossfade_enabled: false,
        autoplay_enabled: false,
        current_index: index,
        elapsed_time: elapsed,
        elapsed_time_last_updated: now,
        state,
        current_item: key ? queueItem(key, index) : null,
        next_item: key ? queueItem("ember", index + 1) : null,
        sources: [],
        flow_mode: false,
        ...extra,
    });
    const queues = [
        queue("living", "playing", "neon", 5, 71, { shuffle_enabled: true, repeat_mode: "all", sources: [{ name: "Night Drive", media_type: "playlist", uri: "library://playlist/night", image: { proxy_id: "night" } }] }),
        queue("kitchen", "paused", "tide", 2, 132),
        queue("office", "playing", "violet", 0, 40),
        queue("bedroom", "idle", null, 0, 0, { items: 0 }),
        queue("terrace", "idle", null, 0, 0, { items: 0 }),
    ];
    return { players, queues };
}

/** Browse tree: the providers, and a few playlists/albums under the demo service. */
function browse(pathArg) {
    const folder = (name, p) => ({ name, media_type: "folder", path: p, uri: p, is_playable: false });
    const item = (key, type) => ({ name: type === "playlist" ? ALBUMS[key].album || ALBUMS[key].title : ALBUMS[key].album, media_type: type, uri: `spotify--demo://${type}/${key}`, is_playable: true, artists: type === "album" ? [{ name: ALBUMS[key].artist }] : [], owner: type === "playlist" ? "Spotify" : undefined, metadata: { images: [{ type: "thumb", proxy_id: key }] } });
    if (!pathArg) return [folder("Spotify", "spotify--demo://"), folder("Your files", "filesystem--demo://"), folder("Radio", "radiobrowser://")];
    if (pathArg === "spotify--demo://") return [folder("Playlists", "spotify--demo://playlists"), folder("Albums", "spotify--demo://albums")];
    if (pathArg.endsWith("playlists")) return ["night", "lime", "ember"].map((k) => item(k, "playlist"));
    if (pathArg.endsWith("albums")) return ["neon", "tide", "violet", "ember"].map((k) => item(k, "album"));
    return [];
}

/**
 * Invented lyrics for the invented "Midnight Tram" (never real song lyrics in screenshots), timed around the
 * staged position (71 s plus the few seconds a scene takes).
 */
const DEMO_LRC = [
    "Neon rivers on the window",
    "every stop a little brighter",
    "we ride the last tram through the city",
    "holding on to midnight",
    "streetlights humming in the rain",
    "take me where the lines don't end",
    "one more station, one more song",
    "the night is ours until the morning",
]
    .map((line, i) => {
        const t = 60 + i * 5;
        return `[${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}.00] ${line}`;
    })
    .join("\n");

const NOTE_ICON = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ffffff" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"/></svg>`).toString("base64")}`;

export async function startFakeMa({ port = 8199 } = {}) {
    const covers = new Map();
    const cover = async (key) => {
        if (!covers.has(key)) covers.set(key, await sharp(Buffer.from(coverSvg((ALBUMS[key] ?? ALBUMS.night).colors))).png().toBuffer());
        return covers.get(key);
    };

    const server = http.createServer(async (req, res) => {
        const m = /^\/imageproxy\/([^?]+)/.exec(req.url ?? "");
        if (!m) return res.writeHead(404).end();
        const size = Math.max(64, Math.min(1024, Number(new URL(req.url, "http://x").searchParams.get("size")) || 512));
        const png = await sharp(await cover(m[1])).resize(size, size).png().toBuffer();
        res.writeHead(200, { "content-type": "image/png" }).end(png);
    });
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (ws) => {
        ws.send(JSON.stringify({ server_id: "demo", server_version: "2.10.4", schema_version: 65, min_supported_schema_version: 1, homeassistant_addon: true }));
        ws.on("message", (raw) => {
            const msg = JSON.parse(raw.toString());
            const now = Date.now() / 1000;
            const { players, queues } = household(now);
            const args = msg.args ?? {};
            const answers = {
                auth: { authenticated: true, user: { username: "demo" } },
                time: now,
                "players/all": players,
                "player_queues/all": queues,
                "players/get": players.find((p) => p.player_id === args.player_id) ?? null,
                "player_queues/get": queues.find((q) => q.queue_id === args.queue_id) ?? null,
                // The living room's queue: what plays at index 5 is the current track, the next one follows
                "player_queues/items": Array.from({ length: Math.min(args.limit ?? 24, 24) }, (_, j) => {
                    const i = (args.offset ?? 0) + j;
                    const order = ["tide", "lime", "violet", "ember", "night", "neon", "ember", "tide"];
                    return queueItem(order[i % order.length], i);
                }),
                "music/browse": browse(args.path),
                "music/in_progress_items": [],
                providers: [
                    { instance_id: "spotify--demo", domain: "spotify", name: "Spotify", type: "music", available: true },
                    { instance_id: "filesystem--demo", domain: "filesystem_smb", name: "Your files", type: "music", available: true },
                    { instance_id: "radiobrowser", domain: "radiobrowser", name: "Radio", type: "music", available: true },
                ],
                "providers/icon": NOTE_ICON,
                "metadata/get_track_lyrics": args.track?.uri === "spotify--demo://track/neon" ? [null, DEMO_LRC] : [null, null],
            };
            const result = msg.command in answers ? answers[msg.command] : null;
            ws.send(JSON.stringify({ message_id: msg.message_id, result }));
        });
    });
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    return {
        url: `http://127.0.0.1:${port}`,
        stop: () => new Promise((resolve) => { wss.close(); server.close(() => resolve()); }),
    };
}
