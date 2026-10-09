// How late does what's playing arrive, and where? Records, with timestamps, Music Assistant's own
// events (queue_updated, player_updated) and what MA-C and SO-C publish on deckbus (players), and
// prints per track change when each source first knew the new title, compared with when MA itself
// says the track began (now − elapsed). Read-only, unless --next: then it skips to the next track
// every <n> seconds (to have changes with a known start).
//   node tools/ma-latency.mjs [seconds=300] [--queue <queue_id>] [--next <n>]
// Writes every event to sim-out/ma-latency-<time>.jsonl. Needs .env (MA_URL, MA_TOKEN).
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { DeckBus } from '@rocklobster42195/streamdeck-kit/bus';

const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const seconds = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 300);
const every = arg('next') ? Number(arg('next')) : 0;
const t0 = Date.now();
const rel = (t = Date.now()) => ((t - t0) / 1000).toFixed(2).padStart(7);
mkdirSync(new URL('../sim-out/', import.meta.url), { recursive: true });
const logFile = new URL(`../sim-out/ma-latency-${new Date(t0).toISOString().replace(/[:.]/g, '-')}.jsonl`, import.meta.url);
writeFileSync(logFile, '');
const log = (o) => appendFileSync(logFile, JSON.stringify({ t: Date.now(), ...o }) + '\n');

/** Per title: when each source first showed it, and MA's own start estimates. */
const changes = new Map();
const firstSeen = (title, source, extra = {}) => {
    if (!title) return;
    let c = changes.get(title);
    if (!c) changes.set(title, (c = { title, seen: {}, maStart: undefined, skippedAt: undefined }));
    if (c.seen[source] === undefined) {
        c.seen[source] = Date.now();
        console.log(`${rel()}  ${source.padEnd(28)} ${title}${extra.note ? `  (${extra.note})` : ''}`);
    }
    if (extra.maStart !== undefined && c.maStart === undefined) c.maStart = extra.maStart;
};

// --- Music Assistant ---
const ws = new WebSocket(env.MA_URL.replace(/^http/, 'ws') + '/ws');
let nextId = 1;
const pending = new Map();
const send = (command, args = {}) =>
    new Promise((resolve) => {
        const message_id = String(nextId++);
        pending.set(message_id, resolve);
        ws.send(JSON.stringify({ message_id, command, args }));
    });
let queueId = arg('queue');
let members = new Set();
ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.message_id && pending.has(msg.message_id)) {
        pending.get(msg.message_id)(msg);
        pending.delete(msg.message_id);
        return;
    }
    if (msg.server_version) console.log(`MA ${msg.server_version} (schema ${msg.schema_version})`);
    if (!msg.event) return;
    const d = msg.data ?? {};
    if (msg.event === 'queue_updated' && d.queue_id === queueId) {
        // The queue names an item "Artist - Title"; its media item has the title alone, as the players do
        const title = d.current_item?.media_item?.name ?? d.current_item?.name;
        log({ src: 'ma:queue_updated', idx: d.current_index, title, elapsed: d.elapsed_time, elapsedAt: d.elapsed_time_last_updated, state: d.state, flow: d.flow_mode, image: d.current_item?.image?.path ?? d.current_item?.media_item?.image?.path });
        const start = d.elapsed_time !== undefined ? Date.now() - d.elapsed_time * 1000 : undefined;
        firstSeen(title, 'ma: queue', { maStart: start, note: `elapsed ${Number(d.elapsed_time ?? 0).toFixed(1)} s` });
    } else if (msg.event === 'queue_time_updated' && msg.object_id === queueId) {
        log({ src: 'ma:queue_time', elapsed: d });
    } else if (msg.event === 'player_updated' && (d.player_id === queueId || members.has(d.player_id))) {
        const m = d.current_media ?? {};
        log({ src: 'ma:player_updated', player: d.player_id, name: d.display_name ?? d.name, title: m.title, uri: m.uri, queue: m.queue_id ?? m.source_id, elapsed: d.elapsed_time, elapsedAt: d.elapsed_time_last_updated, state: d.playback_state ?? d.state, image: m.image_url });
        firstSeen(m.title, `ma: player ${(d.display_name ?? d.player_id).slice(0, 18)}`);
    }
});
await new Promise((r) => ws.addEventListener('open', r));
const auth = await send('auth', { token: env.MA_TOKEN });
if (auth.error_code) throw new Error(`auth failed: ${auth.details ?? auth.error_code}`);
const queues = (await send('player_queues/all')).result ?? [];
const q = queueId ? queues.find((x) => x.queue_id === queueId) : queues.find((x) => x.state === 'playing');
if (!q) throw new Error('no playing queue (start something, or pass --queue)');
queueId = q.queue_id;
const players = (await send('players/all')).result ?? [];
const leader = players.find((p) => p.player_id === queueId);
members = new Set([queueId, ...(leader?.group_members ?? leader?.group_childs ?? [])]);
const info = { queue: queueId, name: q.display_name, flow_mode: q.flow_mode, crossfade: q.crossfade_enabled ?? q.crossfade, item: q.current_item?.name, elapsed: q.elapsed_time, members: [...members].map((id) => players.find((p) => p.player_id === id)?.display_name ?? id), provider: leader?.provider };
log({ src: 'snapshot', ...info, queueKeys: Object.keys(q) });
console.log('queue', JSON.stringify(info));
firstSeen(q.current_item?.media_item?.name ?? q.current_item?.name, 'ma: queue', { maStart: q.elapsed_time !== undefined ? Date.now() - q.elapsed_time * 1000 : undefined });

// --- deckbus: what MA-C and SO-C publish ---
const bus = new DeckBus({ id: 'ma-latency-probe', name: 'Probe', version: '1', scanMs: 500 });
const lastBus = new Map();
bus.onPeers((peers) => {
    for (const peer of peers) {
        const list = peer.state.players;
        if (!Array.isArray(list)) continue;
        for (const p of list) {
            const key = `${peer.name}/${p.player}`;
            const view = JSON.stringify([p.title, p.cover, p.color, p.playing, p.media]);
            if (lastBus.get(key) === view) continue;
            lastBus.set(key, view);
            log({ src: `bus:${peer.name}`, player: p.player, name: p.name, title: p.title, artist: p.artist, cover: p.cover, color: p.color, playing: p.playing, media: p.media, position: p.position, at: p.at });
            if (p.playing) firstSeen(p.title, `bus ${peer.name} ${String(p.name).slice(0, 14)}`);
        }
    }
});
await bus.start();

// --- optional: skip on a schedule ---
let skips = 0;
const skipTimer = every
    ? setInterval(async () => {
          skips++;
          log({ src: 'probe:next', queue: queueId });
          console.log(`${rel()}  >>> next (${skips})`);
          await send('player_queues/next', { queue_id: queueId });
      }, every * 1000)
    : undefined;

setTimeout(() => finish(), seconds * 1000);
process.on('SIGINT', () => finish());

function finish() {
    clearInterval(skipTimer);
    bus.stop();
    ws.close();
    console.log('\n=== per track: seconds after MA says it began (now − elapsed) ===');
    for (const c of changes.values()) {
        const base = c.maStart ?? Math.min(...Object.values(c.seen));
        const parts = Object.entries(c.seen)
            .sort((a, b) => a[1] - b[1])
            .map(([s, t]) => `${s}: ${((t - base) / 1000).toFixed(1)} s`);
        console.log(`- ${c.title}\n    ${parts.join('\n    ')}`);
    }
    console.log(`\nlog: ${logFile.pathname}`);
    process.exit(0);
}
