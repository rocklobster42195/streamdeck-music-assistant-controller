// Latest data pushed by the plugin, shared by all MAC PI components.
import { refreshPiSelects, registerSelectParams, reloadPiSelects, sd } from "@rocklobster42195/streamdeck-kit/pi";
import type { EffectInfo } from "@rocklobster42195/streamdeck-kit";
import type { ConnectionStatus, KeyPreview, PiPush, PlayerOption } from "../pi/protocol";

type Listener = () => void;

export const piState = {
    status: undefined as ConnectionStatus | undefined,
    players: [] as PlayerOption[],
    activePlayerId: undefined as string | undefined,
    preview: undefined as KeyPreview | undefined,
    effects: [] as EffectInfo[],
    /** Level streams on deckbus (undefined until the plugin said). */
    audioSources: undefined as number | undefined,
};

const listeners = new Set<Listener>();

export function onPiState(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Tell the kit's <pi-select>s: lists reload once MA's connection changes, "with=player" ones when the player does. */
let lastConnection: string | undefined;
function updateSelects(): void {
    const connection = piState.status?.state;
    if (connection !== lastConnection) {
        lastConnection = connection;
        reloadPiSelects();
    } else refreshPiSelects();
}

export function initPiState(): void {
    // <pi-select with="player">: the action's player, else the active player
    registerSelectParams("player", () => ({ playerId: String(sd.settings.playerId || sd.globalSettings.activePlayerId || piState.activePlayerId || "") }));
    onPiState(updateSelects);
    sd.onMessage((msg: PiPush) => {
        if (msg?.event === "status") piState.status = msg.status;
        else if (msg?.event === "players") {
            piState.players = msg.players;
            piState.activePlayerId = msg.activePlayerId;
        } else if (msg?.event === "preview") piState.preview = msg.preview;
        else if (msg?.event === "effects") piState.effects = msg.effects;
        else if (msg?.event === "audio-sources") {
            if (msg.count === piState.audioSources) return;
            piState.audioSources = msg.count;
            reloadPiSelects();
        }
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
