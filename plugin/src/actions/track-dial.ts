import streamDeck, { action } from "@elgato/streamdeck";
import { currentElapsed } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { LatestSender } from "../ma/latest-sender";
import { ICONS, rgb } from "../render/key-image";
import { marqueeNeeded, marqueeSvg } from "streamdeck-core";
import { frames } from "../render/frames";
import { formatTime, image, mdi, progressBar, stripImage, text } from "../render/strip";
import { MaDialAction, type StripRender } from "./ma-dial-action";
import type { MaKeySettings, PlayerContext } from "./ma-key-action";

type TrackDialSettings = MaKeySettings & {
    /** Seconds per tick when seeking. */
    seekStep?: number;
};

/**
 * Cover, title, artist and progress on the touch strip.
 * Rotate: seek · Push: next track · Touch: play/pause.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.track-dial" })
export class TrackDial extends MaDialAction<TrackDialSettings> {
    private readonly seekers = new Map<string, LatestSender<number>>();
    private ticker: ReturnType<typeof setInterval> | undefined;
    /** When the current title started scrolling, per dial (reset when the title changes). */
    private readonly marquee = new Map<string, { key: string; startedAt: number }>();

    constructor() {
        super();
        // Progress moves between server events — re-render once a second (unchanged images aren't re-sent).
        this.ticker = setInterval(() => this.instances.size && this.renderAll(), 1000);
    }

    protected override renderPlayer({ id, ma, player, queue }: PlayerContext<TrackDialSettings>): StripRender {
        const media = player.current_media;
        const playing = (queue?.state ?? player.playback_state) === "playing";
        if (!media) {
            return { image: stripImage([mdi(ICONS.note, 26, 26, 48, "#5a5a60"), text(96, 56, this.t("key.nothing_playing"), { size: 13, color: "#a4a4aa", maxWidth: 100 })]) };
        }
        const accent = rgb(media.palette?.accent, "#6cc4ff");
        const cover = this.cover(id, ma, media);
        const parts: string[] = [];

        // Left: cover (dimmed with a play symbol while not playing)
        if (cover) parts.push(image(cover, 0, 0, 100, 100));
        else parts.push(`<rect width="100" height="100" fill="#1d1d20"/>`, mdi(ICONS.note, 26, 26, 48, "#5a5a60"));
        if (!playing) parts.push(`<rect width="100" height="100" fill="#000" opacity="0.55"/>`, mdi(ICONS.play, 30, 30, 40, "#ffffff"));

        // Right: title, artist, progress
        const x = 108;
        const w = 86;
        // Title and artist: one line each, scrolling when too long (like sonos-controller's track dial)
        const title = media.title ?? media.uri;
        const artist = media.artist ?? media.album ?? "";
        const m = this.marqueeState(id, `${title}
${artist}`);
        const now = Date.now();
        parts.push(marqueeSvg({ id: `t${id}`, text: title, x, y: 28, width: w, fontSize: 14, weight: "bold", startedAt: m.startedAt, now, speed: 30 }));
        parts.push(marqueeSvg({ id: `a${id}`, text: artist, x, y: 47, width: w, fontSize: 11, color: "#a4a4aa", startedAt: m.startedAt + 400, now, speed: 30 }));
        if (marqueeNeeded(title, 14, w) || marqueeNeeded(artist, 11, w)) {
            // Keep redrawing while the text scrolls and this dial still shows this media
            frames.run(`track-${id}`, () => {
                if (!this.instances.has(id) || this.marquee.get(id)?.key !== m.key) return false;
                this.render(id);
                return true;
            });
        } else {
            frames.stop(`track-${id}`);
        }

        const duration = media.duration ?? 0;
        if (media.media_type === "radio" || !duration) {
            parts.push(`<rect x="${x}" y="70" width="38" height="18" rx="4" fill="${accent}"/>`, text(x + 19, 83, "LIVE", { size: 11, weight: "bold", color: "#0b0b0c", anchor: "middle" }));
        } else {
            const elapsed = queue ? currentElapsed(queue) : 0;
            parts.push(...progressBar(x, 68, w, elapsed / duration, accent));
            parts.push(text(x, 90, formatTime(elapsed), { size: 10, color: "#a4a4aa" }));
            parts.push(text(x + w, 90, `-${formatTime(duration - elapsed)}`, { size: 10, color: "#a4a4aa", anchor: "end" }));
        }
        return { image: stripImage(parts) };
    }

    private marqueeState(id: string, key: string): { key: string; startedAt: number } {
        const cur = this.marquee.get(id);
        if (cur?.key === key) return cur;
        const next = { key, startedAt: Date.now() };
        this.marquee.set(id, next);
        return next;
    }

    protected override async rotate({ ma, player, queue, settings }: PlayerContext<TrackDialSettings>, ticks: number): Promise<void> {
        const duration = player.current_media?.duration ?? 0;
        if (!queue || !duration || player.current_media?.media_type === "radio") return;
        const step = Math.max(1, Math.min(60, settings.seekStep ?? 10));
        const target = Math.round(Math.min(duration - 1, Math.max(0, currentElapsed(queue) + ticks * step)));
        maConnection.patchQueue(queue.queue_id, { elapsed_time: target, elapsed_time_last_updated: Date.now() / 1000 }, 2500);
        this.seeker(queue.queue_id, ma).push(target);
    }

    protected override async push({ ma, player, queue }: PlayerContext<TrackDialSettings>): Promise<void> {
        if (!queue) throw new Error("player has no queue");
        if (player.current_media?.media_type === "radio") throw new Error("nothing to skip on a live stream");
        await ma.next(queue.queue_id);
    }

    protected override async touch({ ma, queue }: PlayerContext<TrackDialSettings>): Promise<void> {
        if (!queue) throw new Error("player has no queue");
        maConnection.patchQueue(queue.queue_id, { state: queue.state === "playing" ? "paused" : "playing" });
        await ma.playPause(queue.queue_id);
    }

    private seeker(queueId: string, ma: PlayerContext<TrackDialSettings>["ma"]): LatestSender<number> {
        let s = this.seekers.get(queueId);
        if (!s) {
            s = new LatestSender((pos) => ma.seek(queueId, pos), 250, (e) => streamDeck.logger.warn("[track-dial] seek failed", e));
            this.seekers.set(queueId, s);
        }
        return s;
    }
}
