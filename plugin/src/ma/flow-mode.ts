import type { MusicAssistantClient } from "music-assistant-client";
import { maConnection } from "./connection";

// MA's "flow mode" (player setting `flow_mode`): the queue plays as one continuous stream that MA
// mixes itself. On Sonos (native protocol) crossfade only works with it — without it Sonos plays
// the tracks one by one and MA's crossfade setting has no effect (measured 2026-09-26). Changing it
// makes MA restart the current playback once.

/** The player whose config counts for a key: the leader of the queue that feeds it. */
export function flowModePlayerId(playerSetting: string | undefined): string | undefined {
    const player = maConnection.player(maConnection.resolvePlayerId(playerSetting));
    return maConnection.queueFor(player)?.queue_id ?? player?.player_id;
}

/** Current value, or undefined when the player has no such setting. */
export async function getFlowMode(ma: MusicAssistantClient, playerId: string): Promise<boolean | undefined> {
    const config = await ma.call("config/players/get", { player_id: playerId });
    const entry = (config.values as Record<string, { value?: unknown } | undefined> | undefined)?.flow_mode;
    return entry === undefined ? undefined : entry.value === true;
}

export async function setFlowMode(ma: MusicAssistantClient, playerId: string, enabled: boolean): Promise<boolean | undefined> {
    await ma.call("config/players/save", { player_id: playerId, values: { flow_mode: enabled } });
    return getFlowMode(ma, playerId);
}
