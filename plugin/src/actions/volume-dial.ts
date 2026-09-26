import streamDeck, { action } from "@elgato/streamdeck";
import { maConnection } from "../ma/connection";
import { LatestSender } from "../ma/latest-sender";
import { ICONS } from "../render/key-image";
import { glide } from "../render/glide";
import { gauge, mdi, stripImage, text, scrimBox, scrimDisc, textWidth } from "../render/strip";
import { MaDialAction, type StripRender } from "./ma-dial-action";
import { volumeIcon } from "./volume-key";
import type { EffectSettings } from "../render/panorama";
import type { MaKeySettings, PlayerContext } from "./ma-key-action";

type VolumeDialSettings = MaKeySettings & EffectSettings & {
    /** Ring in the cover's accent color instead of MAC's blue. */
    ringCoverColor?: boolean;
    /** Percent per tick. */
    step?: number;
    preset?: number;
    /** Show volume number and player name (default on). */
    showText?: boolean;
    /** Where the ring sits; the text takes the other side ("center": number inside the ring, no name). */
    align?: "left" | "center" | "right";
};

const MUTED = "#ff8a8a";
const SAVED_FLASH_MS = 1500;

/**
 * Rotate: volume · Push: mute · Touch: recall preset (hold: save current volume as preset).
 * Every tick shows instantly; only the latest value is sent to MA (throttled).
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.volume-dial" })
export class VolumeDial extends MaDialAction<VolumeDialSettings> {
    private readonly senders = new Map<string, LatestSender<number>>();
    private readonly savedUntil = new Map<string, number>();

    protected override renderPlayer(ctx: PlayerContext<VolumeDialSettings>): StripRender {
        const { id, player, playerName, settings } = ctx;
        const volume = Math.round(player.volume_level ?? 0);
        const muted = !!player.volume_muted;
        const showText = settings.showText !== false;
        const align = settings.align ?? "left";
        const cx = align === "center" ? 100 : align === "right" ? 150 : 50;
        // The ring glides to the new volume; the number shows the target right away
        const shown = glide(`vol-${id}`, volume, () => this.render(id));
        const accent = this.ringColor(id, settings.ringCoverColor, player.current_media);
        const parts = [...gauge(cx, 50, 34, shown / 100, muted ? "#5a5a60" : accent)];

        // Inside the ring: the number (with text), a speaker icon (without), or the muted icon
        if (muted) parts.push(mdi(ICONS.volumeOff, cx - 16, 34, 32, MUTED));
        else if (showText) parts.push(text(cx, 57, String(volume), { size: 21, weight: "bold", anchor: "middle" }));
        else parts.push(mdi(volumeIcon(volume), cx - 12, 38, 24, "#8a8a90"));

        // On an effect background, darken only behind the number and the text (not the whole strip)
        let scrim = scrimDisc(cx, 50, 30);
        if (showText && align !== "center") {
            const saved = (this.savedUntil.get(id) ?? 0) > Date.now();
            const anchor = align === "right" ? "end" : "start";
            const tx = align === "right" ? 96 : 100;
            const label = saved ? this.t("key.preset_saved").replace("{volume}", String(presetOf(settings))) : muted ? this.t("key.muted") : this.t("key.volume");
            const w = Math.max(textWidth(playerName, 14, { bold: true, maxWidth: 92 }), textWidth(label, 12, { maxWidth: 92 })) + 12;
            scrim += scrimBox(anchor === "end" ? tx + 6 - w : tx - 6, 27, w, 44);
            parts.push(text(tx, 44, playerName, { size: 14, weight: "bold", maxWidth: 92, anchor }));
            parts.push(
                saved
                    ? text(tx, 64, this.t("key.preset_saved").replace("{volume}", String(presetOf(settings))), { size: 12, color: accent, maxWidth: 92, anchor })
                    : text(tx, 64, muted ? this.t("key.muted") : this.t("key.volume"), { size: 12, color: muted ? MUTED : "#a4a4aa", maxWidth: 92, anchor }),
            );
        }
        return { image: stripImage(parts, undefined, this.backdrop(ctx, scrim)) };
    }

    protected override async rotate({ ma, player, settings }: PlayerContext<VolumeDialSettings>, ticks: number): Promise<void> {
        const id = player.player_id;
        const step = Math.max(1, Math.min(10, settings.step ?? 2));
        const next = clamp((player.volume_level ?? 0) + ticks * step);
        maConnection.patchPlayer(id, { volume_level: next }, 2500);
        this.sender(id, ma).push(next);
    }

    protected override async push({ ma, player }: PlayerContext<VolumeDialSettings>): Promise<void> {
        const id = player.player_id;
        maConnection.patchPlayer(id, { volume_muted: !player.volume_muted });
        await ma.setMute(id, !player.volume_muted);
    }

    protected override async touch({ id, ma, player, settings }: PlayerContext<VolumeDialSettings>, hold: boolean): Promise<void> {
        if (hold) {
            this.savedUntil.set(id, Date.now() + SAVED_FLASH_MS);
            await this.saveSettings(id, { preset: Math.round(player.volume_level ?? 0) });
            setTimeout(() => this.render(id), SAVED_FLASH_MS + 50);
            return;
        }
        const preset = presetOf(settings);
        maConnection.patchPlayer(player.player_id, { volume_level: preset, volume_muted: false });
        if (player.volume_muted) await ma.setMute(player.player_id, false);
        await ma.setVolume(player.player_id, preset);
    }

    private sender(playerId: string, ma: PlayerContext<VolumeDialSettings>["ma"]): LatestSender<number> {
        let s = this.senders.get(playerId);
        if (!s) {
            s = new LatestSender((v) => ma.setVolume(playerId, v), 150, (e) => streamDeck.logger.warn("[volume-dial] set volume failed", e));
            this.senders.set(playerId, s);
        }
        return s;
    }
}

function clamp(v: number): number {
    return Math.round(Math.min(100, Math.max(0, v)));
}

function presetOf(settings: VolumeDialSettings): number {
    return clamp(settings.preset ?? 20);
}
