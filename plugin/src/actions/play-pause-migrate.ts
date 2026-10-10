import type { JsonObject } from "@elgato/utils";
import type { PlaybackKeySettings, PlayPauseKeySettings, VolumeDialSettings as KitVolumeDialSettings, VolumeKeySettings } from "@rocklobster42195/streamdeck-kit";

/** MA-C's Play/Pause key settings before the universal key (kit grill 2026-10-09). */
type LegacySettings = {
    playerId?: string;
    showPlayerName?: boolean;
    showProvider?: boolean;
    iconCoverColor?: boolean;
};
export type PlayPauseSettings = PlayPauseKeySettings & LegacySettings;

/** An MA player id onto a deck player choice: a Sonos speaker is one player with Sonos Controller's ("device:…"). */
export function playerChoice(playerId: string | undefined): string | undefined {
    if (!playerId) return undefined;
    return /^RINCON_/i.test(playerId) ? `device:${playerId}` : `MA-C/${playerId}`;
}

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
        ...(playerId ? { player: playerChoice(playerId) } : {}),
        ...(s.keyColor ?? iconCoverColor ? { keyColor: s.keyColor ?? "cover" } : {}),
        topLeft: showProvider ? "source" : "none",
        topRight: "marker",
        showName: !!showPlayerName,
        showCover: true,
    };
}

/** MA-C's Playback Control key settings, with the older ones. */
export type PlaybackSettings = PlaybackKeySettings & { playerId?: string; iconCoverColor?: boolean };

/** Old settings onto the universal key's, once: the MA player becomes a deck player choice. */
export function migratePlayback(s: PlaybackSettings): PlaybackSettings | undefined {
    if (s.playerId === undefined && s.iconCoverColor === undefined) return undefined;
    const { playerId, iconCoverColor, ...rest } = s;
    const player = playerChoice(playerId);
    return { ...rest, ...(player ? { player } : {}), ...(s.keyColor ?? iconCoverColor ? { keyColor: s.keyColor ?? "cover" } : {}) };
}

/** MA-C's Volume key settings, with the older ones. */
export type VolumeSettings = VolumeKeySettings & { playerId?: string; iconCoverColor?: boolean };

/** Old settings onto the universal key's, once: the MA player becomes a deck player choice; the rest stays (MA-C's keys had a ring by default). */
export function migrateVolume(s: VolumeSettings): VolumeSettings | undefined {
    if (s.playerId === undefined && s.iconCoverColor === undefined) return undefined;
    const { playerId, iconCoverColor, ...rest } = s;
    const player = playerChoice(playerId);
    return { ...rest, ...(player ? { player } : {}), ...(s.keyColor ?? iconCoverColor ? { keyColor: s.keyColor ?? "cover" } : {}) };
}

/** MA-C's Volume dial settings, with the older ones. */
export type VolumeDialSettings = KitVolumeDialSettings & { playerId?: string; ringCoverColor?: boolean; marker?: string } & JsonObject;

/**
 * Old settings onto the universal dial's, once: the MA player becomes a deck player choice, the
 * ring in the cover's colour a key colour, the marker the dial's icon (it sits in the ring now).
 */
export function migrateVolumeDial(s: VolumeDialSettings): VolumeDialSettings | undefined {
    if (s.playerId === undefined && s.ringCoverColor === undefined && s.marker === undefined) return undefined;
    const { playerId, ringCoverColor, marker, ...rest } = s;
    const player = playerChoice(playerId);
    return {
        ...rest,
        ...(player ? { player } : {}),
        ...(ringCoverColor && s.keyColor === undefined ? { keyColor: "cover" } : {}),
        ...(marker && s.icon === undefined ? { icon: marker } : {}),
    };
}
