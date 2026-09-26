import streamDeck from "@elgato/streamdeck";
import type { Player } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { flowModePlayerId, getFlowMode, setFlowMode } from "../ma/flow-mode";
import { searchLibrary } from "../ma/library";
import { listEffects } from "streamdeck-core";
import type { ConnectionStatus, KeyPreview, OptionItem, PiPush, PiRequest, PlayerOption, PlayerState } from "./protocol";

/** Provides a list for the PI; `params` come from the requesting component (e.g. a player id). */
export type OptionsProvider = (params: Record<string, string>) => Promise<OptionItem[]> | OptionItem[];

/**
 * Feeds the visible property inspector: connection status, player list and the live key preview.
 * Only pushes when something actually changed, and only to the PI that is open.
 */
class PiBridge {
    private visibleActionId: string | undefined;
    private readonly previews = new Map<string, KeyPreview>();
    private readonly lastSent = new Map<string, string>();
    private readonly optionProviders = new Map<string, OptionsProvider>();

    /** Make a named list available to PI components (`<mac-select source="…">`). */
    registerOptions(source: string, provider: OptionsProvider): void {
        this.optionProviders.set(source, provider);
    }
    private pushTimer: ReturnType<typeof setTimeout> | undefined;

    init(): void {
        streamDeck.ui.onDidAppear((ev) => {
            this.visibleActionId = ev.action.id;
            this.lastSent.clear();
        });
        streamDeck.ui.onDidDisappear((ev) => {
            if (this.visibleActionId === ev.action.id) this.visibleActionId = undefined;
        });
        streamDeck.ui.onSendToPlugin((ev) => this.handle(ev.payload as PiRequest, ev.action.id));
        maConnection.onChange(() => this.schedulePush());
    }

    /** Actions report what their key shows; forwarded when that action's PI is open. */
    updatePreview(actionId: string, preview: KeyPreview): void {
        this.previews.set(actionId, preview);
        if (actionId === this.visibleActionId) void this.send({ event: "preview", preview });
    }

    forget(actionId: string): void {
        this.previews.delete(actionId);
    }

    private handle(msg: PiRequest, actionId: string): void {
        switch (msg?.event) {
            case "pi-ready":
                this.visibleActionId = actionId;
                this.lastSent.clear();
                this.pushAll();
                break;
            case "reconnect":
                maConnection.reconnectNow();
                break;
            case "options":
                void this.answerOptions(msg.requestId, msg.source, msg.params ?? {});
                break;
            case "library-search":
                void this.librarySearch(msg.requestId, msg.query, msg.filter);
                break;
            case "flow-mode":
                void this.flowMode(msg.requestId, msg.playerId, msg.set);
                break;
        }
    }

    private async librarySearch(requestId: number, query: string, filter: Parameters<typeof searchLibrary>[2]): Promise<void> {
        const ma = maConnection.ma;
        let reply: PiPush;
        try {
            if (!ma?.isConnected) throw new Error("not connected");
            const { items, favorites } = await searchLibrary(ma, query ?? "", filter ?? "all");
            reply = { event: "library-results", requestId, items, favorites };
        } catch (e) {
            streamDeck.logger.warn("[pi] library search failed", e);
            reply = { event: "library-results", requestId, items: [], favorites: !query, error: String((e as Error)?.message ?? e) };
        }
        // Results are answers to a request — never deduplicated.
        await streamDeck.ui.sendToPropertyInspector(reply as never);
    }

    private async flowMode(requestId: number, playerSetting: string | undefined, set: boolean | undefined): Promise<void> {
        let reply: PiPush;
        try {
            const ma = maConnection.ma;
            const playerId = flowModePlayerId(playerSetting);
            if (!ma?.isConnected || !playerId) throw new Error("no player");
            const enabled = set === undefined ? await getFlowMode(ma, playerId) : await setFlowMode(ma, playerId, set);
            const player = maConnection.player(playerId);
            reply = { event: "flow-mode-result", requestId, playerName: player?.display_name ?? player?.name, enabled };
        } catch (e) {
            reply = { event: "flow-mode-result", requestId, error: String((e as Error)?.message ?? e) };
        }
        await streamDeck.ui.sendToPropertyInspector(reply as never);
    }

    private async answerOptions(requestId: number, source: string, params: Record<string, string>): Promise<void> {
        let reply: PiPush;
        try {
            const provider = this.optionProviders.get(source);
            if (!provider) throw new Error(`unknown option source "${source}"`);
            reply = { event: "options-result", requestId, source, items: await provider(params) };
        } catch (e) {
            reply = { event: "options-result", requestId, source, items: [], error: String((e as Error)?.message ?? e) };
        }
        await streamDeck.ui.sendToPropertyInspector(reply as never);
    }

    private schedulePush(): void {
        if (!this.visibleActionId || this.pushTimer) return;
        // Events can arrive in bursts — coalesce into one update.
        this.pushTimer = setTimeout(() => {
            this.pushTimer = undefined;
            this.pushAll();
        }, 200);
    }

    private pushAll(): void {
        if (!this.visibleActionId) return;
        void this.send({ event: "status", status: connectionStatus() });
        void this.send({ event: "players", players: playerOptions(), activePlayerId: maConnection.globalSettings.activePlayerId });
        void this.send({ event: "effects", effects: listEffects() });
        const preview = this.previews.get(this.visibleActionId);
        if (preview) void this.send({ event: "preview", preview });
    }

    private async send(msg: PiPush): Promise<void> {
        const json = JSON.stringify(msg);
        if (this.lastSent.get(msg.event) === json) return;
        this.lastSent.set(msg.event, json);
        await streamDeck.ui.sendToPropertyInspector(msg as never);
    }
}

function connectionStatus(): ConnectionStatus {
    const ma = maConnection.ma;
    const { maUrl, maToken } = maConnection.globalSettings;
    const state = maConnection.state;
    return {
        configured: !!(maUrl && maToken),
        state,
        reachable: state === "connected" || state === "authenticating" || state === "auth_failed",
        url: ma?.url,
        serverVersion: ma?.serverInfo?.server_version,
        playerCount: maConnection.selectablePlayers().length,
    };
}

function playerOptions(): PlayerOption[] {
    return maConnection.selectablePlayers().map((p) => ({ id: p.player_id, name: p.display_name ?? p.name, state: playerState(p) }));
}

export function playerState(p: Player): PlayerState {
    if (!p.available) return "offline";
    if (p.playback_state === "playing") return "playing";
    if (p.playback_state === "paused") return "paused";
    return "idle";
}

export const piBridge = new PiBridge();
