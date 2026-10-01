// MA-C's messages between the plugin and its property inspectors (shared by both sides). The kit
// handles "pi-ready", "options" and "options-result" itself (see its protocol.ts).
import type { EffectInfo, OptionItem } from "@rocklobster42195/streamdeck-kit";

export type { OptionItem };

export type PlayerState = "playing" | "paused" | "idle" | "offline";

export type PlayerOption = { id: string; name: string; state: PlayerState };

export type ConnectionStatus = {
    configured: boolean;
    state: "stopped" | "connecting" | "authenticating" | "connected" | "reconnecting" | "auth_failed";
    /** Server answered (it sent its info) on the current connection attempt. */
    reachable: boolean;
    url?: string;
    serverVersion?: string;
    playerCount: number;
};

export type KeyPreviewState = "playing" | "paused" | "idle" | "setup" | "offline" | "auth_failed" | "no_player";

export type KeyPreview = {
    image: string;
    /** "dial" = 200×100 touch-strip segment instead of a square key. */
    kind?: "key" | "dial";
    state: KeyPreviewState;
    /** "Title · Artist" of what is playing. */
    track?: string;
    playerName?: string;
    /** The key follows the active player. */
    following?: boolean;
};

export type LibraryMediaType = "playlist" | "album" | "radio" | "podcast" | "track" | "artist" | "audiobook";
export type LibraryFilter = "all" | LibraryMediaType;

/** A playable item as shown in the PI's library browser. */
export type LibraryItem = {
    uri: string;
    name: string;
    subtitle?: string;
    mediaType: LibraryMediaType | string;
    /** MA image proxy id, stored in the key's settings to render its cover. */
    imageProxyId?: string;
    /** Absolute thumbnail URL for the PI list. */
    thumbUrl?: string;
};


/** PI → plugin */
export type PiRequest =
    | { event: "reconnect" }
    /** Empty query = favorites. */
    | { event: "library-search"; requestId: number; query: string; filter: LibraryFilter }
    /** Read (or, with `set`, change) MA's flow mode of the action's player (empty = active player). */
    | { event: "flow-mode"; requestId: number; playerId?: string; set?: boolean };

/** Plugin → PI */
export type PiPush =
    | { event: "status"; status: ConnectionStatus }
    | { event: "players"; players: PlayerOption[]; activePlayerId?: string }
    | { event: "preview"; preview: KeyPreview }
    | { event: "library-results"; requestId: number; items: LibraryItem[]; favorites: boolean; error?: string }
    | { event: "effects"; effects: EffectInfo[] }
    /** How many level streams other plugins offer on deckbus (the Panorama's "Moves with"). */
    | { event: "audio-sources"; count: number }
    /** `enabled` undefined: the player has no flow-mode setting. */
    | { event: "flow-mode-result"; requestId: number; playerName?: string; enabled?: boolean; error?: string };
