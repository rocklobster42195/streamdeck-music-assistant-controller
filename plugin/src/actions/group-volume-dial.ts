import streamDeck, { action } from "@elgato/streamdeck";
import type { Player } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { groupLeader, groupMembers, isGrouped } from "../ma/groups";
import { LatestSender, glide, stripImage, text, scrimBox, textWidth } from "@rocklobster42195/streamdeck-kit";
import type { GaugeStyle } from "../render/key-image";
import { volumeGauge } from "../render/volume-gauge";
import { markedText } from "../render/marked-text";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { MaDialAction, type StripRender } from "./ma-dial-action";
import type { EffectSettings } from "../render/panorama";
import type { MaKeySettings, PlayerContext } from "./ma-key-action";

type GroupVolumeDialSettings = MaKeySettings & EffectSettings & {
    /** Ring in the cover's accent color instead of MAC's blue. */
    ringCoverColor?: boolean;
    step?: number;
    preset?: number;
    /** Volume as a ring (default) or a pie; the pie has no room for the number, so it moves to the header. */
    gauge?: GaugeStyle;
};

const MUTED = "#ff8a8a";

/**
 * Volume of the whole group the player belongs to (or of the player alone when it isn't grouped).
 * Rotate: group volume · Push: mute group · Touch: preset (hold: save).
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.group-volume-dial" })
export class GroupVolumeDial extends MaDialAction<GroupVolumeDialSettings> {
    private readonly senders = new Map<string, LatestSender<number>>();

    protected override renderPlayer(ctx: PlayerContext<GroupVolumeDialSettings>): StripRender {
        const { id, player, settings } = ctx;
        const leader = groupLeader(player);
        const members = groupMembers(leader);
        const grouped = members.length > 1;
        const volume = Math.round(groupVolume(leader));
        const muted = !!(grouped ? leader.group_volume_muted : leader.volume_muted);

        const shown = glide(`group-${id}`, volume, () => this.render(id));
        const isPie = settings.gauge === "pie";
        const gauge = volumeGauge(settings.gauge, 50, shown / 100, this.ringColor(id, settings.ringCoverColor, leader.current_media), muted);
        const parts = gauge.parts;
        if (!muted && !isPie) parts.push(text(50, 57, String(volume), { size: 21, weight: "bold", anchor: "middle" }));

        const names = members.map((m) => m.display_name ?? m.name);
        const header = grouped ? this.t("key.group").replace("{count}", String(members.length)) : this.t("key.group_single");
        const leaderName = leader.display_name ?? leader.name;
        const others = names.filter((n) => n !== leaderName).join(", ");
        // With the pie, the number moves into the last line, ahead of the other members
        const footer = isPie && !muted ? [`${volume} %`, others].filter(Boolean).join(" · ") : grouped ? others : muted ? this.t("key.muted") : "";
        // The marker goes in front of the short header, so the room name keeps its width
        const head = markedText(100, 30, header, mdiPath(settings.marker), { size: 10, color: "#8a8a90", maxWidth: 96 });
        parts.push(...head.parts, text(100, 50, leaderName, { size: 14, weight: "bold", maxWidth: 96 }));
        if (footer) parts.push(text(100, 68, footer, isPie && !muted ? { size: 12, weight: "bold", color: "#a4a4aa", maxWidth: 96 } : { size: 11, color: grouped ? "#a4a4aa" : MUTED, maxWidth: 96 }));
        // On an effect background, darken only behind the number and the text (not the whole strip)
        const w = Math.max(head.width, textWidth(leaderName, 14, { bold: true, maxWidth: 96 }), footer ? textWidth(footer, 12, { bold: isPie, maxWidth: 96 }) : 0) + 12;
        const scrim = gauge.scrim + scrimBox(94, 18, w, footer ? 56 : 38);
        return { image: stripImage(parts, undefined, this.backdrop(ctx, scrim)) };
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

function groupVolume(leader: Player): number {
    return isGrouped(leader) ? (leader.group_volume ?? leader.volume_level ?? 0) : (leader.volume_level ?? 0);
}
