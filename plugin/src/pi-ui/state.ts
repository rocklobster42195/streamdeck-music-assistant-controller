// Latest data pushed by the plugin, shared by all MAC PI components.
import { sd } from "streamdeck-core/pi";
import type { EffectInfo } from "streamdeck-core";
import type { ConnectionStatus, KeyPreview, PiPush, PlayerOption } from "../pi/protocol";

type Listener = () => void;

export const piState = {
    status: undefined as ConnectionStatus | undefined,
    players: [] as PlayerOption[],
    activePlayerId: undefined as string | undefined,
    preview: undefined as KeyPreview | undefined,
    effects: [] as EffectInfo[],
};

const listeners = new Set<Listener>();

export function onPiState(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function initPiState(): void {
    sd.onMessage((msg: PiPush) => {
        if (msg?.event === "status") piState.status = msg.status;
        else if (msg?.event === "players") {
            piState.players = msg.players;
            piState.activePlayerId = msg.activePlayerId;
        } else if (msg?.event === "preview") piState.preview = msg.preview;
        else if (msg?.event === "effects") piState.effects = msg.effects;
        else return;
        for (const fn of listeners) fn();
    });
    // Changing global settings (e.g. the active player) should reflect immediately.
    sd.onGlobalSettings(() => {
        piState.activePlayerId = (sd.globalSettings.activePlayerId as string | undefined) || piState.activePlayerId;
        for (const fn of listeners) fn();
    });
    sd.onReady(() => sd.sendToPlugin({ event: "pi-ready" }));
}

export function playerName(id: string | undefined): string | undefined {
    return piState.players.find((p) => p.id === id)?.name;
}
