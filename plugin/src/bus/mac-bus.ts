// MA-C on deckbus (see the kit's docs/deckbus-protocol.md): tells the other plugins whether Music
// Assistant is connected, and lists the level streams other plugins offer (XR-C's channels, later
// SA-C's system audio) for the Panorama's "Audio source".
import streamDeck from "@elgato/streamdeck";
import { DEFAULT_EFFECT_ID } from "@rocklobster42195/streamdeck-kit";
import { trackActions } from "@rocklobster42195/streamdeck-kit/bridge";
import { ActionsState, DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { maConnection } from "../ma/connection";

/** A level stream some peer offers in its `streams` state. */
export type OfferedStream = { topic: string; label: string; stereo?: boolean };

let bus: DeckBus | undefined;
let lastStatus = "";
/** Where MA-C's actions are visible ("actions" state); collected from the start, shared once the bus exists. */
const actions = new ActionsState({ setState: (key, value) => bus?.setState(key, value) });

/** Call before streamDeck.connect(), so no willAppear is missed. */
export function trackMacActions(): void {
    trackActions(actions, (uuid, settings) => {
        const background = typeof settings.background === "string" ? settings.background : undefined;
        // The Panorama dial shows the default effect when none is set; "" is "no effect"
        const effect = uuid.endsWith(".panorama-dial") ? (background === "" ? undefined : background || DEFAULT_EFFECT_ID) : background || undefined;
        return effect ? { effect } : undefined;
    });
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
    bus.setState("actions", actions.list());
    if (!(await bus.start())) return;
    streamDeck.logger.info(`[deckbus] MA-C in slot ${bus.slot}`);
    maConnection.onChange(shareStatus);
    shareStatus();
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

/** Every level stream the peers on the bus offer right now, with the offering plugin's name. */
export function offeredStreams(): { id: string; label: string; peer: string }[] {
    return (bus?.peers() ?? []).flatMap((peer) => {
        const streams = Array.isArray(peer.state.streams) ? (peer.state.streams as OfferedStream[]) : [];
        return streams.filter((s) => typeof s?.topic === "string" && s.topic.startsWith("meters/")).map((s) => ({ id: sourceId(peer.id, s.topic), label: String(s.label ?? s.topic), peer: peer.name }));
    });
}
