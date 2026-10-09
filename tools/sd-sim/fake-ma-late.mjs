// A stand-in Music Assistant that reports one Sonos speaker the way the real one did (measured
// 2026-10-09, music-assistant/support#6680): a track change `lateS` seconds after it happened, a
// pause never (the queue stays "playing", its time counting on), a resume from the position it
// counted to, and after a skip the old track again for a while. It keeps its own clock of what
// "really" plays, so a scenario can compare MA-C with the truth. Invented tracks, generated covers.
//   const ma = await startLateMa(); … ma.real() … ma.commands … await ma.stop();
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { coverSvg } from "./fake-ma.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(path.join(root, "plugin/package.json"));
const { WebSocketServer } = require("ws");
const sharp = require("sharp");

export const PLAYER = "RINCON_SIM000000001400";

const PALETTES = [
    ["#ff5f6d", "#ffc371", "#2b1055"],
    ["#43cea2", "#185a9d", "#0b132b"],
    ["#f12711", "#f5af19", "#2d0b00"],
    ["#a8ff78", "#78ffd6", "#1b4332"],
    ["#8e2de2", "#4a00e0", "#e0c3fc"],
    ["#00c6ff", "#0072ff", "#001a33"],
    ["#fc466b", "#3f5efb", "#120a2e"],
    ["#f7971e", "#ffd200", "#3b2400"],
];

/**
 * @param {{ port?: number, lateS?: number, fallbackAfterS?: number, fallbackForS?: number, durations?: number[], startIndex?: number, startPos?: number }} o
 */
export async function startLateMa({ port = 8198, lateS = 6, fallbackAfterS = 2, fallbackForS = 8, durations = [12, 20, 20, 20, 20, 20, 20, 20], startIndex = 0, startPos = 2 } = {}) {
    const tracks = durations.map((duration, i) => ({ title: `Sim Track ${i}`, artist: "Sim Artist", album: `Sim Album ${i}`, duration, colors: PALETTES[i % PALETTES.length] }));
    const nowS = () => Date.now() / 1000;
    const commands = [];
    const clients = new Set();
    const listeners = new Set();

    // What really plays (the speaker)
    const real = { index: startIndex, playing: true, startedAt: nowS() - startPos, pos: startPos };
    const realPos = () => (real.playing ? nowS() - real.startedAt : real.pos);
    // What MA reports
    const rep = { index: startIndex, state: "playing", elapsed: startPos, at: nowS() };
    const repPos = () => (rep.state === "playing" ? rep.elapsed + (nowS() - rep.at) : rep.elapsed);

    const item = (i) =>
        i >= 0 && i < tracks.length
            ? {
                  queue_item_id: `sim-${i}`,
                  index: i,
                  name: `${tracks[i].artist} - ${tracks[i].title}`,
                  duration: tracks[i].duration,
                  image: { type: "thumb", path: `sim-${i}`, provider: "demo", proxy_id: `sim-${i}` },
                  media_item: { uri: `spotify--demo://track/sim-${i}`, media_type: "track", name: tracks[i].title, artists: [{ name: tracks[i].artist }], album: { name: tracks[i].album } },
                  streamdetails: { provider: "spotify--demo" },
              }
            : null;
    const queue = () => ({
        queue_id: PLAYER,
        active: true,
        display_name: "Sim Room",
        available: true,
        items: tracks.length,
        shuffle_enabled: false,
        repeat_mode: "off",
        crossfade_enabled: false,
        autoplay_enabled: false,
        current_index: rep.index,
        current_item: item(rep.index),
        next_item: item(rep.index + 1),
        elapsed_time: rep.elapsed,
        elapsed_time_last_updated: rep.at,
        state: rep.state,
        flow_mode: false,
    });
    const player = () => {
        const t = tracks[rep.index];
        return {
            player_id: PLAYER,
            provider: "sonos",
            name: "Sim Room",
            display_name: "Sim Room",
            available: true,
            enabled: true,
            powered: true,
            playback_state: rep.state,
            volume_level: 10,
            volume_muted: false,
            group_members: [],
            synced_to: null,
            active_source: PLAYER,
            supported_features: ["pause", "next_previous", "seek", "volume_set", "volume_mute", "play_media"],
            current_media: {
                uri: `spotify--demo://track/sim-${rep.index}`,
                media_type: "track",
                title: t.title,
                artist: t.artist,
                album: t.album,
                image_url: `/imageproxy/sim-${rep.index}?size=512`,
                duration: t.duration,
                queue_item_id: `sim-${rep.index}`,
                source_id: PLAYER,
                elapsed_time: rep.elapsed,
                elapsed_time_last_updated: rep.at,
            },
        };
    };
    const emit = () => {
        for (const ws of clients) {
            ws.send(JSON.stringify({ event: "queue_updated", object_id: PLAYER, data: queue() }));
            ws.send(JSON.stringify({ event: "player_updated", object_id: PLAYER, data: player() }));
        }
    };
    const setRep = (index, elapsed, state = rep.state) => {
        Object.assign(rep, { index, elapsed, state, at: nowS() });
        emit();
    };
    const realChanged = () => {
        for (const l of listeners) l({ ...real });
    };

    // The speaker plays on by itself; MA hears about a new track only lateS later
    let lateTimer;
    const reportLate = () => {
        clearTimeout(lateTimer);
        lateTimer = setTimeout(() => {
            if (real.index !== rep.index) setRep(real.index, realPos());
        }, lateS * 1000);
    };
    const tick = setInterval(() => {
        if (!real.playing) return;
        const d = tracks[real.index]?.duration;
        if (d && realPos() >= d && real.index + 1 < tracks.length) {
            real.startedAt += d;
            real.index++;
            realChanged();
            reportLate();
        }
    }, 100);

    const startReal = (index, pos) => {
        Object.assign(real, { index, playing: true, startedAt: nowS() - pos, pos });
        realChanged();
    };
    let fallbackTimers = [];
    const handle = (command, args) => {
        switch (command) {
            case "player_queues/pause":
                return pause();
            case "player_queues/play":
                return play();
            case "player_queues/play_pause":
                // MA toggles by its own report, which never says paused
                return rep.state === "playing" ? pause() : play();
            case "player_queues/next":
            case "player_queues/previous": {
                // From MA's index; then the speaker's late report shows the old track again for a while
                const from = rep.index;
                const to = command.endsWith("next") ? from + 1 : Math.max(0, from - 1);
                if (to >= tracks.length) return;
                const oldPos = repPos();
                fallbackTimers.forEach(clearTimeout);
                startReal(to, 0);
                setRep(to, 0, "playing");
                fallbackTimers = [
                    setTimeout(() => setRep(from, oldPos + fallbackAfterS), fallbackAfterS * 1000),
                    setTimeout(() => setRep(real.index, realPos()), (fallbackAfterS + fallbackForS) * 1000),
                ];
                return;
            }
            case "player_queues/play_index": {
                const to = Number(args.index);
                fallbackTimers.forEach(clearTimeout);
                startReal(to, 0);
                setRep(to, 0, "playing");
                return;
            }
        }
    };
    function pause() {
        // The speaker stops; MA doesn't notice (it keeps reporting "playing", its time counting on)
        if (!real.playing) return;
        Object.assign(real, { playing: false, pos: realPos() });
        realChanged();
    }
    function play() {
        // MA resumes from the position it counted to; past the track's end its stream ends at once
        // and the next track starts from the beginning
        const counted = repPos();
        const over = counted >= tracks[rep.index].duration && rep.index + 1 < tracks.length;
        startReal(over ? rep.index + 1 : rep.index, over ? 0 : counted);
        setRep(rep.index, counted, "playing");
        if (real.index !== rep.index) reportLate();
    }

    const covers = new Map();
    const server = http.createServer(async (req, res) => {
        const m = /^\/imageproxy\/sim-(\d+)/.exec(req.url ?? "");
        if (!m) return res.writeHead(404).end();
        const i = Number(m[1]);
        if (!covers.has(i)) covers.set(i, await sharp(Buffer.from(coverSvg(PALETTES[i % PALETTES.length]))).resize(256, 256).png().toBuffer());
        res.writeHead(200, { "content-type": "image/png" }).end(covers.get(i));
    });
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (ws) => {
        clients.add(ws);
        ws.on("close", () => clients.delete(ws));
        ws.send(JSON.stringify({ server_id: "sim-late", server_version: "2.10.5", schema_version: 65, min_supported_schema_version: 1, homeassistant_addon: true }));
        ws.on("message", (raw) => {
            const msg = JSON.parse(raw.toString());
            const args = msg.args ?? {};
            if (msg.command.startsWith("player_queues/") && !msg.command.endsWith("/all") && !msg.command.endsWith("/get") && !msg.command.endsWith("/items")) {
                commands.push({ t: Date.now(), command: msg.command, args });
                handle(msg.command, args);
            }
            const answers = {
                auth: { authenticated: true, user: { username: "sim" } },
                time: nowS(),
                "players/all": [player()],
                "player_queues/all": [queue()],
                "players/get": args.player_id === PLAYER ? player() : null,
                "player_queues/get": args.queue_id === PLAYER ? queue() : null,
                "player_queues/items": tracks.map((_, i) => item(i)).slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 50)),
                "music/in_progress_items": [],
                providers: [{ instance_id: "spotify--demo", domain: "spotify", name: "Spotify", type: "music", available: true }],
                "metadata/get_track_lyrics": [null, null],
            };
            ws.send(JSON.stringify({ message_id: msg.message_id, result: msg.command in answers ? answers[msg.command] : null }));
        });
    });
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    return {
        url: `http://127.0.0.1:${port}`,
        tracks,
        commands,
        /** What really plays now. */
        real: () => ({ index: real.index, title: tracks[real.index].title, playing: real.playing, pos: realPos() }),
        /** What MA reports now. */
        reported: () => ({ index: rep.index, title: tracks[rep.index].title, state: rep.state, elapsed: repPos() }),
        /** Called whenever what really plays changes (track, playing). */
        onReal: (fn) => listeners.add(fn),
        stop: () =>
            new Promise((resolve) => {
                clearInterval(tick);
                clearTimeout(lateTimer);
                fallbackTimers.forEach(clearTimeout);
                for (const ws of clients) ws.terminate();
                wss.close();
                server.close(() => resolve());
            }),
    };
}
