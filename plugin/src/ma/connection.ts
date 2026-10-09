import streamDeck from "@elgato/streamdeck";
import { MusicAssistantClient, type ConnectionState, type MaEvent, type MediaPalette, type PlaybackState, type Player, type PlayerMedia, type PlayerQueue, type QueueItem, currentElapsed } from "music-assistant-client";
import { OptimisticStore } from "@rocklobster42195/streamdeck-kit";
import { PlayingHold } from "./playing-hold";
import { TrackAdvance } from "./track-advance";

/** Plugin-wide settings, shared by all actions (Stream Deck global settings). */
export type GlobalSettings = {
    maUrl?: string;
    maToken?: string;
    /** Target of every action whose player setting is "Active player". */
    activePlayerId?: string;
    /** Other plugins' keys may control MA-C's players over deckbus (default on). */
    othersMayControlPlayers?: boolean;
    /** "When a call starts on this computer", per player (the kit's CallReaction). */
    callReaction?: Record<string, string>;
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
    private readonly playingHold = new PlayingHold();
    private holdTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly optimisticPlayers = new OptimisticStore<Player>();
    /** The track that really plays, ahead of MA's late reports (see TrackAdvance). */
    private readonly advance = new TrackAdvance();
    private readonly advanceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    /** Palettes of upcoming tracks (by image proxy id), fetched ahead so a predicted track has its colour. */
    private readonly palettes = new Map<string, MediaPalette | null>();

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

    /**
     * A player as the keys should show it (with optimistic overrides applied). While its queue is
     * known to play another track than MA still reports (see TrackAdvance), that track is its media.
     */
    player(playerId: string | undefined): Player | undefined {
        const raw = playerId ? this.client?.players.get(playerId) : undefined;
        const p = raw && this.optimisticPlayers.apply(raw.player_id, raw);
        const media = p?.current_media;
        if (!p || !media?.queue_item_id) return p;
        const shown = this.queueFor(p)?.current_item;
        if (!shown || shown.queue_item_id === media.queue_item_id) return p;
        return { ...p, current_media: this.mediaOf(shown, media) };
    }

    /**
     * Queue that currently drives what a player plays: a synced member follows its leader,
     * and a player can be fed by another queue (active_source).
     */
    queueFor(player: Player | undefined): PlayerQueue | undefined {
        if (!player || !this.client) return undefined;
        const queues = this.client.queues;
        // Started outside MA (Sonos app, radio, line-in): MA's own queue is idle, so the keys go by
        // the player's own state and media instead
        const source = player.active_source;
        if (source && source !== player.player_id && !queues.has(source)) return undefined;
        for (const id of [player.active_source, player.synced_to, player.active_group, player.player_id]) {
            const q = id ? queues.get(id) : undefined;
            if (q) return this.bridged(this.advanced(this.optimisticQueues.apply(q.queue_id, q)));
        }
        return undefined;
    }

    /** The queue with the track that really plays (see TrackAdvance), re-rendered at its predicted end. */
    private advanced(queue: PlayerQueue): PlayerQueue {
        const now = this.client?.serverNow() ?? Date.now() / 1000;
        const view = this.advance.view(queue, now);
        this.prefetchPalette(view.next_item ?? undefined);
        const left = this.advance.nextChangeIn(queue, now);
        clearTimeout(this.advanceTimers.get(queue.queue_id));
        if (left !== undefined) this.advanceTimers.set(queue.queue_id, setTimeout(() => this.emit(), left * 1000 + 50));
        return view;
    }

    /** A queue item as a player's media (for a track MA hasn't reported yet). */
    private mediaOf(item: QueueItem, before: PlayerMedia): PlayerMedia {
        const m = item.media_item as { name?: string; uri?: string; artists?: { name?: string }[]; album?: { name?: string } | null } | null | undefined;
        const proxy = item.image?.proxy_id;
        return {
            uri: m?.uri ?? before.uri,
            media_type: before.media_type,
            title: m?.name ?? item.name,
            artist: m?.artists?.map((a) => a.name).filter(Boolean).join("/") || null,
            album: m?.album?.name ?? null,
            image_url: proxy && this.client ? this.client.imageProxyUrl(proxy, 512) : null,
            palette: (proxy && this.palettes.get(proxy)) || null,
            duration: item.duration ?? null,
            queue_item_id: item.queue_item_id,
            source_id: before.source_id,
        };
    }

    /** Fetches the palette of an upcoming track's cover once (MA computes it the same way for players). */
    private prefetchPalette(item: QueueItem | undefined): void {
        const proxy = item?.image?.proxy_id;
        if (!proxy || this.palettes.has(proxy) || !this.client) return;
        this.palettes.set(proxy, null);
        while (this.palettes.size > 50) this.palettes.delete(this.palettes.keys().next().value!);
        this.client
            .call("metadata/get_image_palette", { image_id: proxy })
            .then((palette) => {
                if (palette) this.palettes.set(proxy, palette as MediaPalette);
            })
            .catch(() => this.palettes.delete(proxy));
    }

    /** Shows a queue that stopped playing only a moment ago as still playing (see PlayingHold). */
    private bridged(queue: PlayerQueue): PlayerQueue {
        if (queue.state === "playing") return queue;
        const ms = this.playingHold.remaining(queue.queue_id);
        if (!ms) return queue;
        // Re-render once the hold ends, in case the server stays silent.
        this.holdTimer ??= setTimeout(() => {
            this.holdTimer = undefined;
            this.emit();
        }, ms + 50);
        return { ...queue, state: "playing" };
    }

    /**
     * Show changed queue fields right away on every key that uses the queue. Fast command sequences
     * are coalesced server-side, so keys can't wait for the confirming event.
     */
    patchQueue(queueId: string, patch: Partial<PlayerQueue>, ms = 2000): void {
        if (patch.state && patch.state !== "playing") this.playingHold.suppress(queueId);
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
        });
        this.unsubscribers.push(
            client.onStateChange((state) => {
                streamDeck.logger.info(`[MA] connection: ${state}`);
                this.emit();
            }),
            client.on("*", (ev) => {
                if (ev.event === "queue_updated" && (ev.data as PlayerQueue | undefined)?.state === "playing" && ev.object_id) this.playingHold.notePlaying(ev.object_id);
                for (const l of this.eventListeners) l(ev);
                this.emit();
            }),
        );
        this.client = client;
        client.start();
    }

    /** Re-measure the server clock and reload the position of the queue a player plays from. */
    async resync(playerId: string | undefined): Promise<void> {
        const client = this.client;
        if (!client) return;
        await client.resync(this.queueFor(this.player(playerId))?.queue_id);
        this.emit();
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
