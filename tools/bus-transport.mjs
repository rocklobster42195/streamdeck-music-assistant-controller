// Sends deckbus "transport" requests to a plugin's player, as another plugin's key would, and
// prints the answers. Changes playback.
//   node tools/bus-transport.mjs <peer name, e.g. MA-C> <player id> <command[=value]> [<wait s> <command> ...]
import { DeckBus } from '@rocklobster42195/streamdeck-kit/bus';
const [peerName, player, ...steps] = process.argv.slice(2);
const bus = new DeckBus({ id: 'bus-transport-probe', name: 'Probe', version: '1', scanMs: 500 });
let peers = [];
bus.onPeers((p) => (peers = p));
await bus.start();
const t0 = Date.now();
const rel = () => ((Date.now() - t0) / 1000).toFixed(2).padStart(6);
while (!peers.some((p) => p.name === peerName)) await new Promise((r) => setTimeout(r, 200));
const peer = peers.find((p) => p.name === peerName);
for (const step of steps) {
    if (/^\d+(\.\d+)?$/.test(step)) { await new Promise((r) => setTimeout(r, Number(step) * 1000)); continue; }
    const [command, raw] = step.split('=');
    const value = raw === undefined ? undefined : isNaN(Number(raw)) ? raw === 'true' ? true : raw === 'false' ? false : raw : Number(raw);
    console.log(`${rel()}  >>> ${command}${value !== undefined ? ' ' + value : ''}`);
    try { await bus.request(peer, 'transport', { player, command, value }, 10000); console.log(`${rel()}  <<< ok`); }
    catch (e) { console.log(`${rel()}  <<< ${e.message}`); }
}
bus.stop();
process.exit(0);
