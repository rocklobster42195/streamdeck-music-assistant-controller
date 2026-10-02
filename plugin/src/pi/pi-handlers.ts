import streamDeck from "@elgato/streamdeck";
import { listEffects } from "@rocklobster42195/streamdeck-kit";
import { piBridge, type PiPushMessage } from "@rocklobster42195/streamdeck-kit/bridge";
import type { Player } from "music-assistant-client";
import { offeredStreams } from "../bus/mac-bus";
import { maConnection } from "../ma/connection";
import { flowModePlayerId, getFlowMode, setFlowMode } from "../ma/flow-mode";
import { searchLibrary } from "../ma/library";
import type { ConnectionStatus, LibraryFilter, PiPush, PlayerOption, PlayerState } from "./protocol";
import { panoramaRows } from "../render/panorama";

/**
 * MA-C's part of the kit's PI bridge: connection status, player list and effects for the open PI,
 * plus the requests only MA-C knows (reconnect, library search, flow mode).
 */
export function initPiBridge(): void {
    piBridge.init();
    // The dials' Panorama section (<pi-panorama>): the row's effect, dials and settings
    panoramaRows.attachPi(piBridge);
    piBridge.handle("reconnect", () => maConnection.reconnectNow());
    piBridge.handle("library-search", (msg) => librarySearch(msg.requestId as number, msg.query as string, msg.filter as LibraryFilter));
    piBridge.handle("flow-mode", (msg) => flowMode(msg.requestId as number, msg.playerId as string | undefined, msg.set as boolean | undefined));
    piBridge.addPusher(() =>
        [
            { event: "status", status: connectionStatus() } as const,
            { event: "players", players: playerOptions(), activePlayerId: maConnection.globalSettings.activePlayerId } as const,
            { event: "effects", effects: listEffects() } as const,
            { event: "audio-sources", count: offeredStreams().length } as const,
        ].map(json),
    );
    maConnection.onChange(() => piBridge.schedulePush());
}

async function librarySearch(requestId: number, query: string, filter: LibraryFilter): Promise<void> {
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
    await piBridge.reply(json(reply));
}

async function flowMode(requestId: number, playerSetting: string | undefined, set: boolean | undefined): Promise<void> {
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
    await piBridge.reply(json(reply));
}

/** MA-C's typed message as the bridge's JSON message. */
function json(msg: PiPush): PiPushMessage {
    return msg as unknown as PiPushMessage;
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

function playerState(p: Player): PlayerState {
    if (!p.available) return "offline";
    if (p.playback_state === "playing") return "playing";
    if (p.playback_state === "paused") return "paused";
    return "idle";
}
