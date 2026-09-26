import type { Player } from "music-assistant-client";
import { maConnection } from "./connection";

/** The player that leads the group this player is in (itself when it leads or isn't grouped). */
export function groupLeader(player: Player): Player {
    const leaderId = player.synced_to ?? player.active_group;
    return (leaderId && maConnection.player(leaderId)) || player;
}

export function isGrouped(leader: Player): boolean {
    return (leader.group_members?.length ?? 0) > 1;
}

/** The players of a leader's group (just the leader when it isn't grouped). */
export function groupMembers(leader: Player): Player[] {
    if (!isGrouped(leader)) return [leader];
    return leader.group_members.map((id) => maConnection.player(id)).filter((p): p is Player => !!p);
}
