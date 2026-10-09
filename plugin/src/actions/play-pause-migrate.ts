import type { PlayPauseKeySettings } from "@rocklobster42195/streamdeck-kit";

/** MA-C's Play/Pause key settings before the universal key (kit grill 2026-10-09). */
type LegacySettings = {
    playerId?: string;
    showPlayerName?: boolean;
    showProvider?: boolean;
    iconCoverColor?: boolean;
};
export type PlayPauseSettings = PlayPauseKeySettings & LegacySettings;

/**
 * Old settings onto the universal key's, once (undefined: nothing to do). MA-C's keys had the
 * service logo top left and the marker top right; they keep that. A key without a player follows
 * the deck's active speaker now (the user's choice, grill 2026-10-09 Q7b), not MA-C's chosen one.
 */
export function migratePlayPause(s: PlayPauseSettings): PlayPauseSettings | undefined {
    if (s.topLeft !== undefined || s.topRight !== undefined) return undefined;
    const { playerId, showPlayerName, showProvider, iconCoverColor, ...rest } = s;
    return {
        ...rest,
        // A Sonos speaker is one player with Sonos Controller's ("device:…"); others are MA-C's own
        ...(playerId ? { player: /^RINCON_/i.test(playerId) ? `device:${playerId}` : `MA-C/${playerId}` } : {}),
        ...(s.keyColor ?? iconCoverColor ? { keyColor: s.keyColor ?? "cover" } : {}),
        topLeft: showProvider ? "source" : "none",
        topRight: "marker",
        showName: !!showPlayerName,
        showCover: true,
    };
}
