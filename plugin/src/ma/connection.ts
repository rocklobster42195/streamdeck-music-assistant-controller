import streamDeck from "@elgato/streamdeck";
import { MusicAssistantClient, type ConnectionState, type MaEvent, type PlaybackState, type Player, type PlayerQueue, type WebSocketLike, currentElapsed } from "music-assistant-client";
import WebSocket from "ws";
import { OptimisticStore } from "./optimistic";

/** Plugin-wide settings, shared by all actions (Stream Deck global settings). */
export type GlobalSettings = {
    maUrl?: string;
    maToken?: string;
    /** Target of every action whose player setting is "Active player". */
    activePlayerId?: string;
};

/** Value of an action's `playerId` setting that means "follow the active player". */
export const ACTIVE_PLAYER = "";

type Listener = () => void;

/**
 * Owns the single MA connection of the plugin. Recreates the client whenever URL or token change
 * and fans out a coarse "something changed" signal that actions use to re-render.
 */
class MaConnection {
    private client: MusicAssistantClient | undefined;
    private settings: GlobalSettings = {};
    private readonly listeners = new Set<Listener>();
    private readonly eventListeners = new Set<(ev: MaEvent) => void>();
    private unsubscribers: (() => void)[] = [];
    private settingsLoaded = false;
    /** Local overrides shown right after a key press/dial turn until the server confirms. */
    private readonly optimisticQueues = new OptimisticStore<PlayerQueue>();
    private readonly optimisticPlayers = new OptimisticStore<Player>();

    /** False until the global settings arrived — render a neutral "loading" state until then. */
    get loaded(): boolean {
        return this.settingsLoaded;
    }

    get ma(): MusicAssistantClient | undefined {
        return this.client;
    }

    get state(): ConnectionState {
        return this.client?.state ?? "stopped";
    }

    get globalSettings(): GlobalSettings {
        return this.settings;
    }

    async init(): Promise<void> {
        streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => this.applySettings(ev.settings));
        this.applySettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
    }

    /** Show `playerId` as active right away without persisting it yet (see {@link setActivePlayer}). */
    previewActivePlayer(playerId: string): void {
        this.settings = { ...this.settings, activePlayerId: playerId };
        this.emit();
    }

    async setActivePlayer(playerId: string): Promise<void> {
        const next = { ...this.settings, activePlayerId: playerId };
        await streamDeck.settings.setGlobalSettings(next);
        this.applySettings(next);
    }

    /** Drop the current connection and connect again right away (e.g. "Connect" in the PI). */
    reconnectNow(): void {
        this.reconnect();
        this.emit();
    }

    /** Subscribe to any state change (connection, players, queues, settings). */
    onChange(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Raw server events (all of them), across reconnects. */
    onServerEvent(listener: (ev: MaEvent) => void): () => void {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }

    /** Resolve an action's player setting to a concrete player id. */
    resolvePlayerId(playerSetting: string | undefined): string | undefined {
        return playerSetting || this.settings.activePlayerId || undefined;
    }

    /** Current position of a queue in seconds, extrapolated on the server's clock. */
    elapsed(queue: PlayerQueue): number {
        return currentElapsed(queue, this.client?.serverNow() ?? Date.now() / 1000);
    }

    /** A player as the keys should show it (with optimistic overrides applied). */
    player(playerId: string | undefined): Player | undefined {
        const p = playerId ? this.client?.players.get(playerId) : undefined;
        return p && this.optimisticPlayers.apply(p.player_id, p);
    }

    /**
     * Queue that currently drives what a player plays: a synced member follows its leader,
     * and a player can be fed by another queue (active_source).
     */
    queueFor(player: Player | undefined): PlayerQueue | undefined {
        if (!player || !this.client) return undefined;
        const queues = this.client.queues;
        for (const id of [player.active_source, player.synced_to, player.active_group, player.player_id]) {
            const q = id ? queues.get(id) : undefined;
            if (q) return this.optimisticQueues.apply(q.queue_id, q);
        }
        return undefined;
    }

    /**
     * Show changed queue fields right away on every key that uses the queue. Fast command sequences
     * are coalesced server-side, so keys can't wait for the confirming event.
     */
    patchQueue(queueId: string, patch: Partial<PlayerQueue>, ms = 2000): void {
        this.optimisticQueues.set(queueId, patch, ms);
        this.emitNowAndAfter(ms);
    }

    patchPlayer(playerId: string, patch: Partial<Player>, ms = 2000): void {
        this.optimisticPlayers.set(playerId, patch, ms);
        this.emitNowAndAfter(ms);
    }

    /** Drop overrides again, e.g. when the command failed. */
    unpatch(id: string): void {
        this.optimisticQueues.clear(id);
        this.optimisticPlayers.clear(id);
        this.emit();
    }

    /** The queue's playback state (optimistic overrides are already applied by {@link queueFor}). */
    playbackState(queue: PlayerQueue): PlaybackState {
        return queue.state;
    }

    /** Players suitable for pickers: enabled and not hidden, sorted by name. */
    selectablePlayers(): Player[] {
        return [...(this.client?.players.values() ?? [])]
            .filter((p) => p.enabled !== false && !p.hide_in_ui)
            .sort((a, b) => (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name));
    }

    private applySettings(settings: GlobalSettings): void {
        const prev = this.settings;
        this.settings = settings ?? {};
        this.settingsLoaded = true;
        const connectionChanged = prev.maUrl !== this.settings.maUrl || prev.maToken !== this.settings.maToken || !this.client;
        if (connectionChanged) this.reconnect();
        this.emit();
    }

    private reconnect(): void {
        for (const u of this.unsubscribers) u();
        this.unsubscribers = [];
        this.client?.stop();
        this.client = undefined;

        const { maUrl, maToken } = this.settings;
        if (!maUrl || !maToken) {
            streamDeck.logger.info("[MA] not configured yet");
            return;
        }
        const client = new MusicAssistantClient({
            url: normalizeUrl(maUrl),
            token: maToken.trim(),
            logger: streamDeck.logger,
            // Stream Deck runs plugins on Node 20, which has no stable global WebSocket.
            webSocketFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
        });
        this.unsubscribers.push(
            client.onStateChange((state) => {
                streamDeck.logger.info(`[MA] connection: ${state}`);
                this.emit();
            }),
            client.on("*", (ev) => {
                for (const l of this.eventListeners) l(ev);
                this.emit();
            }),
        );
        this.client = client;
        client.start();
    }

    /** Ask all keys to re-render (e.g. after a lookup finished). */
    notify(): void {
        this.emit();
    }

    private emitNowAndAfter(ms: number): void {
        this.emit();
        // Re-render once the override expired, in case no server event arrives meanwhile.
        setTimeout(() => this.emit(), ms + 50);
    }

    private emit(): void {
        for (const l of this.listeners) {
            try {
                l();
            } catch (e) {
                streamDeck.logger.error("[MA] listener failed", e);
            }
        }
    }
}

/** Accepts "192.168.1.10", "192.168.1.10:8095" or a full URL; defaults to http and port 8095. */
export function normalizeUrl(input: string): string {
    let url = input.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
    const parsed = new URL(url);
    if (!parsed.port && parsed.protocol === "http:") parsed.port = "8095";
    return parsed.origin;
}

export const maConnection = new MaConnection();
