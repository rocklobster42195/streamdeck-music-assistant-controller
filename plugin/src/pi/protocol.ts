// Messages between the plugin and its property inspectors (shared by both sides).

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
    state: KeyPreviewState;
    /** "Title · Artist" of what is playing. */
    track?: string;
    playerName?: string;
    /** The key follows the active player. */
    following?: boolean;
};

/** PI → plugin */
export type PiRequest = { event: "pi-ready" } | { event: "reconnect" };

/** Plugin → PI */
export type PiPush =
    | { event: "status"; status: ConnectionStatus }
    | { event: "players"; players: PlayerOption[]; activePlayerId?: string }
    | { event: "preview"; preview: KeyPreview };
