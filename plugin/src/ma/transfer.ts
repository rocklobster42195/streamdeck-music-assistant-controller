import type { Player } from "music-assistant-client";
import { maConnection } from "./connection";

/**
 * Where should "bring the music here" take it from? The given player (e.g. the previous active
 * player) if it is playing; with `anyPlaying`, otherwise any other player that is playing.
 * Returns the queue id to transfer from, or undefined when there is nothing to take.
 */
export function transferSource(targetPlayerId: string, preferredPlayerId?: string, anyPlaying = false): string | undefined {
    const playing = (p: Player | undefined) => p && p.player_id !== targetPlayerId && maConnection.queueFor(p)?.state === "playing";
    const preferred = maConnection.player(preferredPlayerId);
    if (playing(preferred)) return maConnection.queueFor(preferred!)!.queue_id;
    if (!anyPlaying) return undefined;
    const other = maConnection.selectablePlayers().find((p) => playing(maConnection.player(p.player_id)));
    return other ? maConnection.queueFor(maConnection.player(other.player_id)!)!.queue_id : undefined;
}

/** Move playback from `sourceQueueId` to the target player's own queue and start it there. */
export async function transferTo(targetPlayerId: string, sourceQueueId: string): Promise<void> {
    const ma = maConnection.ma;
    if (!ma) throw new Error("not connected");
    const target = maConnection.player(targetPlayerId);
    const targetQueue = (target && maConnection.queueFor(target)?.queue_id) ?? targetPlayerId;
    if (sourceQueueId === targetQueue) return;
    await ma.transferQueue(sourceQueueId, targetQueue, true);
}
