import streamDeck, { action } from "@elgato/streamdeck";
import type { Player } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { LatestSender } from "../ma/latest-sender";
import { ACCENT, ICONS } from "../render/key-image";
import { glide } from "../render/glide";
import { gauge, mdi, stripImage, text } from "../render/strip";
import { MaDialAction, type StripRender } from "./ma-dial-action";
import type { MaKeySettings, PlayerContext } from "./ma-key-action";

type GroupVolumeDialSettings = MaKeySettings & {
    step?: number;
    preset?: number;
};

const MUTED = "#ff8a8a";

/**
 * Volume of the whole group the player belongs to (or of the player alone when it isn't grouped).
 * Rotate: group volume · Push: mute group · Touch: preset (hold: save).
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.group-volume-dial" })
export class GroupVolumeDial extends MaDialAction<GroupVolumeDialSettings> {
    private readonly senders = new Map<string, LatestSender<number>>();

    protected override renderPlayer({ id, player, settings }: PlayerContext<GroupVolumeDialSettings>): StripRender {
        const leader = groupLeader(player);
        const members = groupMembers(leader);
        const grouped = members.length > 1;
        const volume = Math.round(groupVolume(leader));
        const muted = !!(grouped ? leader.group_volume_muted : leader.volume_muted);

        const shown = glide(`group-${id}`, volume, () => this.render(id));
        const parts = [...gauge(50, 50, 34, shown / 100, muted ? "#5a5a60" : ACCENT)];
        if (muted) parts.push(mdi(ICONS.volumeOff, 34, 34, 32, MUTED));
        else parts.push(text(50, 57, String(volume), { size: 21, weight: "bold", anchor: "middle" }));

        const names = members.map((m) => m.display_name ?? m.name);
        parts.push(text(100, 30, grouped ? this.t("key.group").replace("{count}", String(members.length)) : this.t("key.group_single"), { size: 10, color: "#8a8a90", maxWidth: 96 }));
        parts.push(text(100, 50, leader.display_name ?? leader.name, { size: 14, weight: "bold", maxWidth: 96 }));
        if (grouped) parts.push(text(100, 68, names.filter((n) => n !== (leader.display_name ?? leader.name)).join(", "), { size: 11, color: "#a4a4aa", maxWidth: 96 }));
        else if (muted) parts.push(text(100, 68, this.t("key.muted"), { size: 11, color: MUTED }));
        void settings;
        return { image: stripImage(parts) };
    }

    protected override async rotate({ ma, player, settings }: PlayerContext<GroupVolumeDialSettings>, ticks: number): Promise<void> {
        const leader = groupLeader(player);
        const step = Math.max(1, Math.min(10, settings.step ?? 2));
        const next = Math.round(Math.min(100, Math.max(0, groupVolume(leader) + ticks * step)));
        maConnection.patchPlayer(leader.player_id, isGrouped(leader) ? { group_volume: next } : { volume_level: next }, 2500);
        this.sender(leader.player_id, ma).push(next);
    }

    protected override async push({ ma, player }: PlayerContext<GroupVolumeDialSettings>): Promise<void> {
        const leader = groupLeader(player);
        if (isGrouped(leader)) {
            const muted = !leader.group_volume_muted;
            maConnection.patchPlayer(leader.player_id, { group_volume_muted: muted });
            await ma.setGroupMute(leader.player_id, muted);
        } else {
            maConnection.patchPlayer(leader.player_id, { volume_muted: !leader.volume_muted });
            await ma.setMute(leader.player_id, !leader.volume_muted);
        }
    }

    protected override async touch({ id, ma, player, settings }: PlayerContext<GroupVolumeDialSettings>, hold: boolean): Promise<void> {
        const leader = groupLeader(player);
        if (hold) {
            await this.saveSettings(id, { preset: Math.round(groupVolume(leader)) });
            return;
        }
        const preset = Math.round(Math.min(100, Math.max(0, settings.preset ?? 20)));
        maConnection.patchPlayer(leader.player_id, isGrouped(leader) ? { group_volume: preset } : { volume_level: preset });
        await (isGrouped(leader) ? ma.setGroupVolume(leader.player_id, preset) : ma.setVolume(leader.player_id, preset));
    }

    private sender(leaderId: string, ma: PlayerContext<GroupVolumeDialSettings>["ma"]): LatestSender<number> {
        let s = this.senders.get(leaderId);
        if (!s) {
            // Decide at send time whether it is (still) a group
            s = new LatestSender(
                (v) => {
                    const leader = maConnection.player(leaderId);
                    return leader && isGrouped(leader) ? ma.setGroupVolume(leaderId, v) : ma.setVolume(leaderId, v);
                },
                150,
                (e) => streamDeck.logger.warn("[group-volume-dial] set volume failed", e),
            );
            this.senders.set(leaderId, s);
        }
        return s;
    }
}

/** The player that leads the group this player is in (itself when it leads or isn't grouped). */
function groupLeader(player: Player): Player {
    const leaderId = player.synced_to ?? player.active_group;
    return (leaderId && maConnection.player(leaderId)) || player;
}

function isGrouped(leader: Player): boolean {
    return (leader.group_members?.length ?? 0) > 1;
}

function groupMembers(leader: Player): Player[] {
    if (!isGrouped(leader)) return [leader];
    return leader.group_members.map((id) => maConnection.player(id)).filter((p): p is Player => !!p);
}

function groupVolume(leader: Player): number {
    return isGrouped(leader) ? (leader.group_volume ?? leader.volume_level ?? 0) : (leader.volume_level ?? 0);
}
