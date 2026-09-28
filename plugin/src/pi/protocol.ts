// Messages between the plugin and its property inspectors (shared by both sides).
import type { EffectInfo } from "@rocklobster42195/streamdeck-kit";

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

/** An entry of a list the plugin provides to the PI (TTS engines, sources, dashboard endpoints, …). */
export type OptionItem = { value: string; label: string; sub?: string; /** MDI path for a preview (e.g. the icon picker). */ icon?: string };

/** PI → plugin */
export type PiRequest =
    | { event: "options"; requestId: number; source: string; params?: Record<string, string> }
    | { event: "pi-ready" }
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
    | { event: "options-result"; requestId: number; source: string; items: OptionItem[]; error?: string }
    /** `enabled` undefined: the player has no flow-mode setting. */
    | { event: "flow-mode-result"; requestId: number; playerName?: string; enabled?: boolean; error?: string };
