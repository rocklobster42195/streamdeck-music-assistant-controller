// Connects to the Music Assistant WebSocket API, authenticates, runs a few read-only
// commands and records incoming events for a while. Output goes to docs/ma-api/fixtures/.
// Usage: node tools/ma-probe.mjs [seconds-to-record-events]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const recordSeconds = Number(process.argv[2] ?? 15);
const outDir = new URL('../docs/ma-api/fixtures/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const ws = new WebSocket(env.MA_URL.replace(/^http/, 'ws') + '/ws');
let nextId = 1;
const pending = new Map();
const events = [];

function send(command, args = {}) {
    const message_id = String(nextId++);
    // Note: the auth token also goes into `args` (the /api-docs example shows it top-level, which fails)
    ws.send(JSON.stringify({ message_id, command, args }));
    return new Promise((resolve) => pending.set(message_id, resolve));
}

ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.message_id && pending.has(msg.message_id)) {
        pending.get(msg.message_id)(msg);
        pending.delete(msg.message_id);
    } else if (msg.event) {
        events.push(msg);
        console.log('event', msg.event, msg.object_id ?? '');
    } else {
        console.log('other', JSON.stringify(msg).slice(0, 200));
    }
});

ws.addEventListener('open', async () => {
    const auth = await send('auth', { token: env.MA_TOKEN });
    console.log('auth ->', JSON.stringify(auth).slice(0, 300));
    writeFileSync(new URL('auth.json', outDir), JSON.stringify({ ...auth, result: '<redacted>' }, null, 2));

    for (const [name, cmd, args] of [
        ['players-all', 'players/all', {}],
        ['queues-all', 'player_queues/all', {}],
        ['providers', 'providers', {}],
        ['recently-played', 'music/recently_played_items', { limit: 5 }],
    ]) {
        const res = await send(cmd, args);
        writeFileSync(new URL(`${name}.json`, outDir), JSON.stringify(res, null, 2));
        const r = res.result;
        console.log(cmd, '->', res.error_code ? `ERROR ${res.error_code}: ${res.details}` : Array.isArray(r) ? `${r.length} items` : typeof r);
    }

    console.log(`recording events for ${recordSeconds}s ...`);
    setTimeout(() => {
        writeFileSync(new URL('events.json', outDir), JSON.stringify(events, null, 2));
        console.log(`${events.length} events saved`);
        ws.close();
    }, recordSeconds * 1000);
});

ws.addEventListener('error', (e) => console.error('ws error', e.message ?? e));
