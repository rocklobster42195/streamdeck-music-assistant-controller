// MA-C on deckbus (see the kit's docs/deckbus-protocol.md): tells the other plugins whether Music
// Assistant is connected, shares the Panorama with other plugins' dials next to MA-C's, and lists
// the level streams other plugins offer (XR-C's channels, later SA-C's system audio) for the
// Panorama's "Audio source".
import { effectsChanged, panorama, setEffectPeers } from "../render/panorama";
import streamDeck from "@elgato/streamdeck";
import { piBridge, trackActions } from "@rocklobster42195/streamdeck-kit/bridge";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { maConnection } from "../ma/connection";
import { macActions, shareActionsTo } from "./mac-actions";

/** A level stream some peer offers in its `streams` state. */
export type OfferedStream = { topic: string; label: string; stereo?: boolean; /** A mic or other input: not music, so not offered. */ input?: boolean };

let bus: DeckBus | undefined;
let lastStatus = "";

/**
 * Call before streamDeck.connect(), so no willAppear is missed. A dial's effect is announced by the
 * Panorama when the dial joins it (so "like the neighbour" announces the effect it took).
 */
export function trackMacActions(): void {
    trackActions(macActions);
}

/** The bus (without peers when it couldn't start: MA-C works on without it). */
export function macBus(): DeckBus | undefined {
    return bus;
}

/**
 * Call after streamDeck.connect() (the plugin version comes from there). The bus exists at once, so
 * dials can subscribe while it still starts (subscriptions reach every peer that connects later).
 */
export async function startMacBus(): Promise<void> {
    bus = new DeckBus({ id: "de.boriskemper.music-assistant-controller", name: "MA-C", version: streamDeck.info.plugin.version, caps: [] });
    const b = bus;
    shareActionsTo((key, value) => b.setState(key, value));
    b.setState("actions", macActions.list());
    // One Panorama with other plugins' dials next to MA-C's (stays local while nobody is there);
    // "like the neighbour" dials follow other plugins' dials
    panorama.connect(b);
    setEffectPeers(() => b.peers());
    b.onPeers(() => effectsChanged());
    if (!(await bus.start())) return;
    streamDeck.logger.info(`[deckbus] MA-C in slot ${bus.slot}`);
    maConnection.onChange(shareStatus);
    shareStatus();
    // An open Panorama PI shows "Moves with" only while there is something to choose
    bus.onPeers(() => piBridge.schedulePush());
}

function shareStatus(): void {
    const state = maConnection.state;
    const status = { online: state === "connected", detail: state === "connected" ? `MA ${maConnection.ma?.serverInfo?.server_version ?? ""}`.trim() : state };
    const json = JSON.stringify(status);
    if (!bus || json === lastStatus) return;
    lastStatus = json;
    bus.setState("status", status);
}

/** The "Audio source" choice: `<peer id>|<topic>`, e.g. "de.boriskemper.xair-controller|meters/ch:3". */
export function sourceId(peerId: string, topic: string): string {
    return `${peerId}|${topic}`;
}

export function parseSourceId(id: string | undefined): { peerId: string; topic: string } | undefined {
    const at = id?.indexOf("|") ?? -1;
    return id && at > 0 ? { peerId: id.slice(0, at), topic: id.slice(at + 1) } : undefined;
}

/** Every level stream the peers on the bus offer right now (no inputs like a mic), with the offering plugin's name. */
export function offeredStreams(): { id: string; label: string; peer: string }[] {
    return (bus?.peers() ?? []).flatMap((peer) => {
        const streams = Array.isArray(peer.state.streams) ? (peer.state.streams as OfferedStream[]) : [];
        return streams.filter((s) => typeof s?.topic === "string" && s.topic.startsWith("meters/") && s.input !== true).map((s) => ({ id: sourceId(peer.id, s.topic), label: String(s.label ?? s.topic), peer: peer.name }));
    });
}
