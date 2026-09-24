import streamDeck, { action } from "@elgato/streamdeck";
import { maConnection } from "../ma/connection";
import { LatestSender } from "../ma/latest-sender";
import { transferSource, transferTo } from "../ma/transfer";
import { ACCENT, ICONS } from "../render/key-image";
import { image, mdi, stripImage, text } from "../render/strip";
import { MaDialAction, type StripRender } from "./ma-dial-action";
import type { MaKeySettings, PlayerContext } from "./ma-key-action";

const STATE_COLORS: Record<string, string> = { playing: "#4cc38a", paused: "#f0b429", idle: "#6b6b72", offline: "#ff6b6b" };

/**
 * Choose the active player with a turn — every "Active player" key and dial follows.
 * Rotate: next/previous player · Push: bring the music here (from wherever it plays) · Touch: play/pause.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.player-dial" })
export class PlayerDial extends MaDialAction<MaKeySettings> {
    /** Saving global settings on every tick is too chatty; the display follows instantly anyway. */
    private readonly commit = new LatestSender<string>((id) => maConnection.setActivePlayer(id), 400, (e) => streamDeck.logger.warn("[player-dial] set active failed", e));
    private flashUntil = 0;
    private flashText = "";

    protected override renderPlayer({ id, ma, player, queue, playerName }: PlayerContext<MaKeySettings>): StripRender {
        const players = maConnection.selectablePlayers();
        const index = players.findIndex((p) => p.player_id === player.player_id);
        const state = !player.available ? "offline" : (queue?.state ?? player.playback_state) === "playing" ? "playing" : queue?.state === "paused" ? "paused" : "idle";
        const media = state === "playing" || state === "paused" ? player.current_media : undefined;
        const cover = this.cover(id, ma, media);
        const parts: string[] = [];

        if (cover) parts.push(image(cover, 8, 18, 64, 64));
        else parts.push(`<rect x="8" y="18" width="64" height="64" rx="8" fill="#1d1d20"/>`, mdi(ICONS.speaker, 20, 30, 40, ACCENT));
        parts.push(`<circle cx="68" cy="22" r="7" fill="#0a0a0a"/>`, `<circle cx="68" cy="22" r="5" fill="${STATE_COLORS[state]}"/>`);

        parts.push(text(82, 14, this.t("key.active_player"), { size: 10, color: "#8a8a90", maxWidth: 112 }));
        parts.push(text(82, 42, playerName, { size: 15, weight: "bold", maxWidth: 110 }));
        const flash = this.flashUntil > Date.now();
        const line = flash ? this.flashText : media ? [media.title, media.artist].filter(Boolean).join(" · ") : this.t(`pi.state_${state}`);
        parts.push(text(82, 62, line, { size: 11, color: flash ? ACCENT : "#a4a4aa", maxWidth: 112 }));

        // Position dots (up to 9), else "3 / 12"
        if (players.length > 1 && players.length <= 9) {
            players.forEach((_, i) => parts.push(`<circle cx="${82 + i * 11}" cy="86" r="3" fill="${i === index ? ACCENT : "#3a3a40"}"/>`));
        } else if (players.length > 9) {
            parts.push(text(82, 90, `${index + 1} / ${players.length}`, { size: 10, color: "#8a8a90" }));
        }
        return { image: stripImage(parts) };
    }

    protected override async rotate({ player }: PlayerContext<MaKeySettings>, ticks: number): Promise<void> {
        const players = maConnection.selectablePlayers().filter((p) => p.available || p.player_id === player.player_id);
        if (players.length < 2) return;
        const index = players.findIndex((p) => p.player_id === player.player_id);
        const next = players[(((index + ticks) % players.length) + players.length) % players.length];
        // Show the new active player right away; persist it throttled
        maConnection.previewActivePlayer(next.player_id);
        this.commit.push(next.player_id);
    }

    protected override async push({ player }: PlayerContext<MaKeySettings>): Promise<void> {
        const source = transferSource(player.player_id, undefined, true);
        if (!source) throw new Error("nothing plays elsewhere");
        await transferTo(player.player_id, source);
        this.flashText = this.t("key.music_here");
        this.flashUntil = Date.now() + 1800;
        maConnection.notify();
        setTimeout(() => maConnection.notify(), 1850);
    }

    protected override async touch({ ma, queue }: PlayerContext<MaKeySettings>): Promise<void> {
        if (!queue) throw new Error("player has no queue");
        maConnection.patchQueue(queue.queue_id, { state: queue.state === "playing" ? "paused" : "playing" });
        await ma.playPause(queue.queue_id);
    }
}
