import type { AuthUser, EventMap, EventName, MaEvent, MediaItem, Player, PlayerQueue, QueueItem, RepeatMode, ServerInfo } from './types.js';

/** Schema version this client was written against (MA server 2.10.4). */
export const CLIENT_SCHEMA_VERSION = 65;

/** Minimal WebSocket surface we need — satisfied by the browser/Node 22+ global and by the `ws` package. */
export interface WebSocketLike {
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: 'open' | 'close' | 'error' | 'message', listener: (ev: any) => void): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface ClientLogger {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

export interface ClientOptions {
    /** Base URL of the MA server, e.g. `http://192.168.1.10:8095`. */
    url: string;
    /** Long-lived access token (MA → Settings → Profile). */
    token: string;
    /** Defaults to the global `WebSocket`. Pass one (e.g. from `ws`) on runtimes without it. */
    webSocketFactory?: WebSocketFactory;
    requestTimeoutMs?: number;
    reconnectInitialDelayMs?: number;
    reconnectMaxDelayMs?: number;
    logger?: ClientLogger;
}

export type ConnectionState = 'stopped' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting' | 'auth_failed';

export class MaApiError extends Error {
    constructor(readonly code: number, readonly details: string, readonly command: string) {
        super(`${command} failed (${code}): ${details}`);
        this.name = 'MaApiError';
    }
}

/** MA error code for a missing/invalid token. */
const ERROR_AUTH_REQUIRED = 20;

interface PendingRequest {
    command: string;
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    partial?: unknown[];
}

type Listener<T> = (payload: T) => void;

/**
 * Client for the Music Assistant WebSocket API.
 *
 * - Authenticates with a long-lived token, then keeps `players` and `queues` in sync via events.
 * - Reconnects automatically with exponential backoff (except after an auth failure).
 * - UI-agnostic: no Stream Deck imports, so it can be reused elsewhere (e.g. JSA) and published to npm.
 */
export class MusicAssistantClient {
    readonly players = new Map<string, Player>();
    readonly queues = new Map<string, PlayerQueue>();
    serverInfo: ServerInfo | undefined;
    user: AuthUser | undefined;

    private _state: ConnectionState = 'stopped';
    private ws: WebSocketLike | undefined;
    private nextMessageId = 1;
    private readonly pending = new Map<string, PendingRequest>();
    private readonly eventListeners = new Map<string, Set<Listener<any>>>();
    private readonly stateListeners = new Set<Listener<ConnectionState>>();
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    private reconnectDelay: number;
    private readonly opts: Required<Omit<ClientOptions, 'logger' | 'webSocketFactory'>> & Pick<ClientOptions, 'logger'>;
    private readonly wsFactory: WebSocketFactory;

    constructor(options: ClientOptions) {
        this.opts = {
            requestTimeoutMs: 10_000,
            reconnectInitialDelayMs: 1_000,
            reconnectMaxDelayMs: 30_000,
            ...options,
        };
        this.reconnectDelay = this.opts.reconnectInitialDelayMs;
        this.wsFactory = options.webSocketFactory ?? ((url) => {
            const Ctor = (globalThis as any).WebSocket;
            if (!Ctor) throw new Error('No global WebSocket available — pass options.webSocketFactory');
            return new Ctor(url) as WebSocketLike;
        });
    }

    get state(): ConnectionState {
        return this._state;
    }

    /** Base URL of the server this client talks to. */
    get url(): string {
        return this.opts.url;
    }

    get isConnected(): boolean {
        return this._state === 'connected';
    }

    /** True when the server says it can no longer talk to a client of our schema version. */
    get isSchemaIncompatible(): boolean {
        return !!this.serverInfo && this.serverInfo.min_supported_schema_version > CLIENT_SCHEMA_VERSION;
    }

    start(): void {
        if (this._state !== 'stopped' && this._state !== 'auth_failed') return;
        this.reconnectDelay = this.opts.reconnectInitialDelayMs;
        this.openSocket();
    }

    stop(): void {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.setState('stopped');
        const ws = this.ws;
        this.ws = undefined;
        ws?.close();
        this.rejectAllPending(new Error('Client stopped'));
    }

    // ---- events ---------------------------------------------------------------------------

    /** Subscribe to a server event. Returns an unsubscribe function. */
    on<E extends EventName>(event: E, listener: (data: EventMap[E], objectId: string | null | undefined) => void): () => void;
    on(event: '*', listener: (ev: MaEvent) => void): () => void;
    on(event: string, listener: (...args: any[]) => void): () => void {
        let set = this.eventListeners.get(event);
        if (!set) this.eventListeners.set(event, (set = new Set()));
        set.add(listener);
        return () => set!.delete(listener);
    }

    onStateChange(listener: Listener<ConnectionState>): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    // ---- raw commands ---------------------------------------------------------------------

    /** Send any API command. Resolves with `result`, rejects with {@link MaApiError}. */
    send<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
        const ws = this.ws;
        if (!ws || ws.readyState !== 1) return Promise.reject(new Error(`Not connected (${command})`));
        const message_id = String(this.nextMessageId++);
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(message_id);
                reject(new Error(`Timeout waiting for ${command}`));
            }, this.opts.requestTimeoutMs);
            this.pending.set(message_id, { command, resolve, reject, timer });
            ws.send(JSON.stringify({ message_id, command, args }));
        });
    }

    // ---- convenience commands -------------------------------------------------------------

    playPause(queueId: string) { return this.send<null>('player_queues/play_pause', { queue_id: queueId }); }
    play(queueId: string) { return this.send<null>('player_queues/play', { queue_id: queueId }); }
    pause(queueId: string) { return this.send<null>('player_queues/pause', { queue_id: queueId }); }
    stopPlayback(queueId: string) { return this.send<null>('player_queues/stop', { queue_id: queueId }); }
    next(queueId: string) { return this.send<null>('player_queues/next', { queue_id: queueId }); }
    previous(queueId: string) { return this.send<null>('player_queues/previous', { queue_id: queueId }); }
    seek(queueId: string, position: number) { return this.send<null>('player_queues/seek', { queue_id: queueId, position }); }
    setShuffle(queueId: string, enabled: boolean) { return this.send<null>('player_queues/shuffle', { queue_id: queueId, shuffle_enabled: enabled }); }
    setRepeat(queueId: string, mode: RepeatMode) { return this.send<null>('player_queues/repeat', { queue_id: queueId, repeat_mode: mode }); }
    setCrossfade(queueId: string, enabled: boolean) { return this.send<null>('player_queues/crossfade', { queue_id: queueId, crossfade_enabled: enabled }); }
    /** "Don't stop the music". */
    setAutoplay(queueId: string, enabled: boolean) { return this.send<null>('player_queues/autoplay', { queue_id: queueId, autoplay_enabled: enabled }); }
    transferQueue(sourceQueueId: string, targetQueueId: string, autoPlay?: boolean) {
        return this.send<null>('player_queues/transfer', {
            source_queue_id: sourceQueueId,
            target_queue_id: targetQueueId,
            ...(autoPlay === undefined ? {} : { auto_play: autoPlay }),
        });
    }
    /** Play one or more media items / URIs. `option`: play | replace | next | replace_next | add. */
    playMedia(queueId: string, media: string | string[], option?: string) {
        return this.send<null>('player_queues/play_media', { queue_id: queueId, media, ...(option ? { option } : {}) });
    }

    setVolume(playerId: string, level: number) {
        return this.send<null>('players/cmd/volume_set', { player_id: playerId, volume_level: Math.round(Math.min(100, Math.max(0, level))) });
    }
    volumeUp(playerId: string) { return this.send<null>('players/cmd/volume_up', { player_id: playerId }); }
    volumeDown(playerId: string) { return this.send<null>('players/cmd/volume_down', { player_id: playerId }); }
    setMute(playerId: string, muted: boolean) { return this.send<null>('players/cmd/volume_mute', { player_id: playerId, muted }); }
    /** "Like": add the currently playing item to the MA favorites. */
    addCurrentlyPlayingToFavorites(playerId: string) {
        return this.send<null>('players/add_currently_playing_to_favorites', { player_id: playerId });
    }

    /** Queue items, paged. */
    queueItems(queueId: string, limit = 50, offset = 0) {
        return this.send<QueueItem[]>('player_queues/items', { queue_id: queueId, limit, offset });
    }
    /** Jump to (and play) the item at `index` — or with that queue_item_id — in the queue. */
    playIndex(queueId: string, index: number | string) {
        return this.send<null>('player_queues/play_index', { queue_id: queueId, index });
    }
    setGroupVolume(playerId: string, level: number) {
        return this.send<null>('players/cmd/group_volume', { player_id: playerId, volume_level: Math.round(Math.min(100, Math.max(0, level))) });
    }
    /** Group `playerIds` with `targetPlayerId` as leader. */
    groupPlayers(targetPlayerId: string, playerIds: string[]) {
        return this.send<null>('players/cmd/set_members', { target_player: targetPlayerId, player_ids_to_add: playerIds });
    }
    ungroup(playerId: string) {
        return this.send<null>('players/cmd/ungroup', { player_id: playerId });
    }
    setGroupMute(playerId: string, muted: boolean) {
        return this.send<null>('players/cmd/group_volume_mute', { player_id: playerId, muted });
    }

    /** Fetch a media item by URI; provider URIs resolve to the library item when it exists. */
    itemByUri(uri: string) {
        return this.send<MediaItem>('music/item_by_uri', { uri });
    }
    addFavorite(uri: string) {
        return this.send<null>('music/favorites/add_item', { item: uri });
    }
    removeFavorite(mediaType: string, libraryItemId: string | number) {
        return this.send<null>('music/favorites/remove_item', { media_type: mediaType, library_item_id: libraryItemId });
    }

    // ---- helpers ----------------------------------------------------------------------------

    /**
     * URL that fetches an image through the MA image proxy (`/imageproxy/<proxy_id>?size=`).
     * `proxyId` is `MediaItemImage.proxy_id`; `size` is snapped up to a size the server accepts.
     */
    imageProxyUrl(proxyId: string, size = 0): string {
        return `${this.opts.url.replace(/\/$/, '')}/imageproxy/${proxyId}?size=${snapImageSize(size)}`;
    }

    /**
     * Normalize an image URL as found in `current_media.image_url`: MA proxy URLs get the requested
     * size, relative URLs are made absolute, and external URLs are returned unchanged.
     */
    resolveImageUrl(imageUrl: string, size = 0): string {
        const base = this.opts.url.replace(/\/$/, '');
        const url = new URL(imageUrl, base + '/');
        if (url.pathname.startsWith('/imageproxy/')) url.searchParams.set('size', String(snapImageSize(size)));
        return url.toString();
    }

    // ---- internals ----------------------------------------------------------------------------

    private setState(state: ConnectionState): void {
        if (this._state === state) return;
        this._state = state;
        for (const l of this.stateListeners) this.safeCall(l, state);
    }

    private openSocket(): void {
        this.setState(this._state === 'reconnecting' ? 'reconnecting' : 'connecting');
        const wsUrl = this.opts.url.replace(/\/$/, '').replace(/^http/, 'ws') + '/ws';
        let ws: WebSocketLike;
        try {
            ws = this.wsFactory(wsUrl);
        } catch (e) {
            this.opts.logger?.error('[ma-client] cannot create WebSocket', e);
            this.scheduleReconnect();
            return;
        }
        this.ws = ws;

        ws.addEventListener('open', () => {
            if (this.ws !== ws) return;
            void this.handshake();
        });
        ws.addEventListener('message', (ev) => {
            if (this.ws !== ws) return;
            this.handleMessage(typeof ev.data === 'string' ? ev.data : String(ev.data));
        });
        ws.addEventListener('error', (ev) => {
            if (this.ws !== ws) return;
            this.opts.logger?.warn('[ma-client] socket error', ev?.message ?? ev);
        });
        ws.addEventListener('close', () => {
            if (this.ws !== ws) return;
            this.ws = undefined;
            this.rejectAllPending(new Error('Connection closed'));
            if (this._state === 'stopped' || this._state === 'auth_failed') return;
            this.scheduleReconnect();
        });
    }

    private async handshake(): Promise<void> {
        this.setState('authenticating');
        try {
            // The token goes into `args` — the /api-docs example shows it top-level, which the server rejects.
            const auth = await this.send<{ authenticated: boolean; user?: AuthUser }>('auth', { token: this.opts.token });
            if (!auth?.authenticated) throw new MaApiError(ERROR_AUTH_REQUIRED, 'not authenticated', 'auth');
            this.user = auth.user;
            if (this.isSchemaIncompatible) {
                this.opts.logger?.warn(`[ma-client] server requires schema >= ${this.serverInfo?.min_supported_schema_version}, client has ${CLIENT_SCHEMA_VERSION}`);
            }
            const [players, queues] = await Promise.all([
                this.send<Player[]>('players/all'),
                this.send<PlayerQueue[]>('player_queues/all'),
            ]);
            this.players.clear();
            for (const p of players) this.players.set(p.player_id, p);
            this.queues.clear();
            for (const q of queues) this.queues.set(q.queue_id, q);
            this.reconnectDelay = this.opts.reconnectInitialDelayMs;
            this.setState('connected');
        } catch (e) {
            // Any rejection of the auth command means the token is bad (20 = required, 23 = invalid/expired).
            if (e instanceof MaApiError && e.command === 'auth') {
                this.opts.logger?.error('[ma-client] authentication failed — check the token');
                this.setState('auth_failed');
                this.ws?.close();
                return;
            }
            this.opts.logger?.warn('[ma-client] handshake failed', e);
            this.ws?.close();
        }
    }

    private scheduleReconnect(): void {
        clearTimeout(this.reconnectTimer);
        this.setState('reconnecting');
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.opts.reconnectMaxDelayMs);
        this.opts.logger?.info(`[ma-client] reconnecting in ${delay} ms`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            if (this._state === 'reconnecting') this.openSocket();
        }, delay);
    }

    private handleMessage(raw: string): void {
        let msg: any;
        try {
            msg = JSON.parse(raw);
        } catch {
            this.opts.logger?.warn('[ma-client] invalid JSON from server');
            return;
        }

        if (msg.message_id !== undefined && msg.message_id !== null) {
            const req = this.pending.get(String(msg.message_id));
            if (!req) return;
            if (msg.error_code) {
                this.finishRequest(String(msg.message_id));
                req.reject(new MaApiError(msg.error_code, msg.details ?? '', req.command));
            } else if (msg.partial) {
                // Large list results arrive in chunks flagged `partial: true`.
                req.partial = (req.partial ?? []).concat(msg.result ?? []);
            } else {
                this.finishRequest(String(msg.message_id));
                req.resolve(req.partial ? req.partial.concat(msg.result ?? []) : msg.result);
            }
            return;
        }

        if (msg.event) {
            this.applyEvent(msg as MaEvent);
            return;
        }

        // First message after connecting: server info, pushed without a message_id.
        if (msg.server_id && msg.schema_version !== undefined) {
            this.serverInfo = msg as ServerInfo;
        }
    }

    private finishRequest(id: string): void {
        const req = this.pending.get(id);
        if (req) clearTimeout(req.timer);
        this.pending.delete(id);
    }

    private applyEvent(ev: MaEvent): void {
        switch (ev.event) {
            case 'player_added':
            case 'player_updated': {
                const p = ev.data as Player;
                if (p?.player_id) this.players.set(p.player_id, p);
                break;
            }
            case 'player_removed':
                if (ev.object_id) this.players.delete(ev.object_id);
                break;
            case 'queue_added':
            case 'queue_updated':
            case 'queue_items_updated': {
                const q = ev.data as PlayerQueue;
                if (q?.queue_id) this.queues.set(q.queue_id, q);
                break;
            }
            case 'queue_time_updated': {
                const q = ev.object_id ? this.queues.get(ev.object_id) : undefined;
                if (q && typeof ev.data === 'number') {
                    q.elapsed_time = ev.data;
                    q.elapsed_time_last_updated = Date.now() / 1000;
                }
                break;
            }
        }
        for (const l of this.eventListeners.get(ev.event) ?? []) this.safeCall(l, ev.data, ev.object_id);
        for (const l of this.eventListeners.get('*') ?? []) this.safeCall(l, ev);
    }

    private rejectAllPending(error: Error): void {
        for (const [id, req] of this.pending) {
            clearTimeout(req.timer);
            req.reject(error);
            this.pending.delete(id);
        }
    }

    private safeCall(fn: (...args: any[]) => void, ...args: unknown[]): void {
        try {
            fn(...args);
        } catch (e) {
            this.opts.logger?.error('[ma-client] listener threw', e);
        }
    }
}

/** Sizes accepted by `/imageproxy` (0 = original). */
export const IMAGE_PROXY_SIZES = [0, 80, 160, 256, 512, 1024] as const;

/** Smallest accepted proxy size >= `size` (Stream Deck keys at 144 px → 160). */
export function snapImageSize(size: number): number {
    if (size <= 0) return 0;
    return IMAGE_PROXY_SIZES.find((s) => s >= size) ?? 0;
}

/** Current position of a queue in seconds, extrapolated while playing. */
export function currentElapsed(queue: Pick<PlayerQueue, 'elapsed_time' | 'elapsed_time_last_updated' | 'state'>, nowSeconds = Date.now() / 1000): number {
    const base = queue.elapsed_time ?? 0;
    if (queue.state !== 'playing' || !queue.elapsed_time_last_updated) return base;
    return base + Math.max(0, nowSeconds - queue.elapsed_time_last_updated);
}
