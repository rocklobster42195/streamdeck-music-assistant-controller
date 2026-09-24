import { action } from "@elgato/streamdeck";
import { currentElapsed } from "music-assistant-client";
import { marqueeNeeded, marqueeSvg } from "streamdeck-core";
import { maConnection } from "../ma/connection";
import { frames } from "../render/frames";
import { ICONS, renderKeyImage, rgb } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type PlayPauseSettings = MaKeySettings & {
    showPlayerName?: boolean;
    showProgress?: boolean;
    /** Scrolling "title · artist" at the bottom of the key. */
    showTitle?: boolean;
};

const TITLE_W = 128;
const TITLE_SIZE = 19;

@action({ UUID: "de.boriskemper.music-assistant-controller.play-pause-key" })
export class PlayPauseKey extends MaKeyAction<PlayPauseSettings> {
    private readonly marquee = new Map<string, { key: string; startedAt: number }>();

    protected override renderPlayer({ id, ma, player, queue, settings, playerName }: PlayerContext<PlayPauseSettings>): KeyRender {
        const playing = (queue?.state ?? player.playback_state) === "playing";
        const media = player.current_media;
        const accent = rgb(media?.palette?.accent, "#e0e0e0");
        const cover = this.cover(id, ma, media);

        let progress: number | undefined;
        if (settings.showProgress && queue && media?.duration) progress = currentElapsed(queue) / media.duration;

        return {
            image: renderKeyImage({
                cover,
                icon: playing ? (cover ? undefined : ICONS.note) : ICONS.play,
                color: accent,
                dimmed: !playing,
                progress,
                progressColor: accent,
                overlay: settings.showTitle && media ? this.titleOverlay(id, [media.title, media.artist].filter(Boolean).join(" · "), progress !== undefined) : undefined,
            }),
            title: settings.showPlayerName ? playerName : "",
        };
    }

    /** Dark band at the bottom with the scrolling title (above the progress bar, if shown). */
    private titleOverlay(id: string, value: string, withProgress: boolean): string {
        if (!value) return "";
        let m = this.marquee.get(id);
        if (m?.key !== value) {
            m = { key: value, startedAt: Date.now() };
            this.marquee.set(id, m);
        }
        const bottom = withProgress ? 138 : 144;
        const band = `<rect y="${bottom - 34}" width="144" height="34" fill="#000" opacity="0.6"/>`;
        const line = marqueeSvg({ id: `k${id}`, text: value, x: 8, y: bottom - 11, width: TITLE_W, fontSize: TITLE_SIZE, weight: "bold", startedAt: m.startedAt, now: Date.now(), speed: 35 });
        if (marqueeNeeded(value, TITLE_SIZE, TITLE_W)) {
            const key = m.key;
            frames.run(`key-${id}`, () => {
                if (!this.instances.has(id) || this.marquee.get(id)?.key !== key || !this.instances.get(id)?.settings.showTitle) return false;
                this.render(id);
                return true;
            });
        }
        return band + line;
    }

    protected override async press({ ma, queue }: PlayerContext<PlayPauseSettings>): Promise<void> {
        if (!queue) throw new Error("player has no queue");
        // Flip immediately on every key of this queue; the server confirms via events.
        maConnection.patchQueue(queue.queue_id, { state: queue.state === "playing" ? "paused" : "playing" });
        try {
            await ma.playPause(queue.queue_id);
        } catch (e) {
            maConnection.unpatch(queue.queue_id);
            throw e;
        }
    }
}
