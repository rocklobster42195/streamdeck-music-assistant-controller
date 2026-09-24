import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaApiError, MusicAssistantClient, currentElapsed, snapImageSize, type WebSocketLike } from '../src/index.js';

// Minimal fixtures shaped like real server 2.10.4 payloads (see docs/ma-api/).
const SERVER_INFO = {
    server_id: 'abc', server_version: '2.10.4', schema_version: 65, min_supported_schema_version: 28,
    base_url: 'http://ma.local:8095', homeassistant_addon: true, onboard_done: true,
};
const PLAYER = {
    player_id: 'RINCON_BATH', provider: 'sonos', type: 'player', name: 'Bathroom', available: true,
    playback_state: 'idle', volume_level: 10, volume_muted: false, group_members: [],
};
const QUEUE = {
    queue_id: 'RINCON_BATH', active: true, display_name: 'Bathroom', available: true, items: 0,
    shuffle_enabled: false, repeat_mode: 'off', crossfade_enabled: false, autoplay_enabled: false,
    elapsed_time: 0, state: 'idle',
};

/** Scriptable fake server socket. `respond` decides what the "server" answers per command. */
class FakeSocket implements WebSocketLike {
    readyState = 0;
    sent: any[] = [];
    private listeners: Record<string, ((ev: any) => void)[]> = {};
    constructor(public respond: (msg: any, sock: FakeSocket) => void) {}
    addEventListener(type: string, l: (ev: any) => void) { (this.listeners[type] ??= []).push(l); }
    emit(type: string, ev: any = {}) { for (const l of this.listeners[type] ?? []) l(ev); }
    serverSend(obj: unknown) { this.emit('message', { data: JSON.stringify(obj) }); }
    open() { this.readyState = 1; this.emit('open'); this.serverSend(SERVER_INFO); }
    send(data: string) {
        const msg = JSON.parse(data);
        this.sent.push(msg);
        queueMicrotask(() => this.respond(msg, this));
    }
    close() { this.readyState = 3; this.emit('close'); }
}

function happyServer(msg: any, sock: FakeSocket) {
    const reply = (result: unknown) => sock.serverSend({ message_id: msg.message_id, result });
    switch (msg.command) {
        case 'auth': return msg.args?.token === 'good'
            ? reply({ authenticated: true, user: { user_id: 'u1', username: 'boris', role: 'admin' } })
            : sock.serverSend({ message_id: msg.message_id, error_code: 20, details: 'Authentication failed' });
        case 'players/all': return reply([PLAYER]);
        case 'player_queues/all': return reply([QUEUE]);
        case 'broken': return sock.serverSend({ message_id: msg.message_id, error_code: 12, details: 'Invalid or unsupported command.' });
        case 'chunked':
            sock.serverSend({ message_id: msg.message_id, result: [1, 2], partial: true });
            return reply([3]);
        default: return reply(null);
    }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('MusicAssistantClient', () => {
    let sockets: FakeSocket[];
    const makeClient = (token = 'good', respond = happyServer) =>
        new MusicAssistantClient({
            url: 'http://ma.local:8095',
            token,
            reconnectInitialDelayMs: 100,
            webSocketFactory: (url) => {
                expect(url).toBe('ws://ma.local:8095/ws');
                const s = new FakeSocket(respond);
                sockets.push(s);
                return s;
            },
        });

    beforeEach(() => { sockets = []; });
    afterEach(() => { vi.useRealTimers(); });

    it('authenticates with the token inside args and loads players and queues', async () => {
        const client = makeClient();
        client.start();
        sockets[0].open();
        await flush(); await flush();

        expect(sockets[0].sent[0]).toMatchObject({ command: 'auth', args: { token: 'good' } });
        expect(client.state).toBe('connected');
        expect(client.serverInfo?.server_version).toBe('2.10.4');
        expect(client.user?.username).toBe('boris');
        expect(client.players.get('RINCON_BATH')?.name).toBe('Bathroom');
        expect(client.queues.get('RINCON_BATH')?.state).toBe('idle');
        expect(client.isSchemaIncompatible).toBe(false);
    });

    it('stops at auth_failed and does not reconnect on a bad token', async () => {
        vi.useFakeTimers();
        const client = makeClient('bad');
        client.start();
        sockets[0].open();
        await vi.runAllTimersAsync();
        expect(client.state).toBe('auth_failed');
        expect(sockets).toHaveLength(1);
    });

    it('keeps the cache in sync from events and notifies listeners', async () => {
        const client = makeClient();
        client.start();
        sockets[0].open();
        await flush(); await flush();

        const seen: string[] = [];
        client.on('player_updated', (p) => seen.push(`${p.name}:${p.playback_state}`));
        sockets[0].serverSend({ event: 'player_updated', object_id: 'RINCON_BATH', data: { ...PLAYER, playback_state: 'playing', volume_level: 5 } });
        sockets[0].serverSend({ event: 'queue_updated', object_id: 'RINCON_BATH', data: { ...QUEUE, state: 'playing', crossfade_enabled: true } });
        sockets[0].serverSend({ event: 'queue_time_updated', object_id: 'RINCON_BATH', data: 42 });

        expect(seen).toEqual(['Bathroom:playing']);
        expect(client.players.get('RINCON_BATH')?.volume_level).toBe(5);
        expect(client.queues.get('RINCON_BATH')?.crossfade_enabled).toBe(true);
        expect(client.queues.get('RINCON_BATH')?.elapsed_time).toBe(42);
    });

    it('rejects with MaApiError and merges partial results', async () => {
        const client = makeClient();
        client.start();
        sockets[0].open();
        await flush(); await flush();

        await expect(client.send('broken')).rejects.toBeInstanceOf(MaApiError);
        await expect(client.send('chunked')).resolves.toEqual([1, 2, 3]);
    });

    it('sends the documented argument names for toggles', async () => {
        const client = makeClient();
        client.start();
        sockets[0].open();
        await flush(); await flush();

        await client.setAutoplay('Q', true);
        await client.setCrossfade('Q', false);
        await client.setMute('P', true);
        const tail = sockets[0].sent.slice(-3);
        expect(tail[0]).toMatchObject({ command: 'player_queues/autoplay', args: { queue_id: 'Q', autoplay_enabled: true } });
        expect(tail[1]).toMatchObject({ command: 'player_queues/crossfade', args: { queue_id: 'Q', crossfade_enabled: false } });
        expect(tail[2]).toMatchObject({ command: 'players/cmd/volume_mute', args: { player_id: 'P', muted: true } });
    });

    it('reconnects with backoff after the connection drops', async () => {
        vi.useFakeTimers();
        const client = makeClient();
        client.start();
        sockets[0].open();
        await vi.advanceTimersByTimeAsync(0);
        expect(client.state).toBe('connected');

        sockets[0].close();
        expect(client.state).toBe('reconnecting');
        await vi.advanceTimersByTimeAsync(100);
        expect(sockets).toHaveLength(2);
        sockets[1].open();
        await vi.advanceTimersByTimeAsync(0);
        expect(client.state).toBe('connected');
    });

    it('builds image URLs with sizes the proxy accepts', () => {
        const client = makeClient();
        expect(client.imageProxyUrl('ab'.repeat(32), 144)).toBe(`http://ma.local:8095/imageproxy/${'ab'.repeat(32)}?size=160`);
        expect(client.resolveImageUrl('http://ma.local:8095/imageproxy/xyz?size=0&fmt=png', 144)).toBe('http://ma.local:8095/imageproxy/xyz?size=160&fmt=png');
        expect(client.resolveImageUrl('https://somafm.com/logo.jpg', 144)).toBe('https://somafm.com/logo.jpg');
    });
});

describe('helpers', () => {
    it('snaps to accepted proxy sizes', () => {
        expect(snapImageSize(0)).toBe(0);
        expect(snapImageSize(72)).toBe(80);
        expect(snapImageSize(144)).toBe(160);
        expect(snapImageSize(5000)).toBe(0);
    });

    it('extrapolates elapsed time only while playing', () => {
        expect(currentElapsed({ elapsed_time: 10, elapsed_time_last_updated: 100, state: 'playing' }, 105)).toBe(15);
        expect(currentElapsed({ elapsed_time: 10, elapsed_time_last_updated: 100, state: 'paused' }, 105)).toBe(10);
    });
});
