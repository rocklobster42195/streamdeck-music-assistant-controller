import { action } from "@elgato/streamdeck";
import { maConnection } from "../ma/connection";
import { coverAccent, ICONS, renderKeyImage, rgb } from "../render/key-image";
import { KeyTitleFader } from "../render/key-title";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type PlayPauseSettings = MaKeySettings & {
    showPlayerName?: boolean;
    showProgress?: boolean;
    /** Scrolling "title [artist]" at the bottom of the key (as in sonos-controller). */
    showTitle?: boolean;
};

@action({ UUID: "de.boriskemper.music-assistant-controller.play-pause-key" })
export class PlayPauseKey extends MaKeyAction<PlayPauseSettings> {
    private readonly title = new KeyTitleFader();

    protected override renderPlayer({ id, ma, player, queue, settings, playerName }: PlayerContext<PlayPauseSettings>): KeyRender {
        const playing = (queue?.state ?? player.playback_state) === "playing";
        const media = player.current_media;
        const accent = rgb(coverAccent(media), "#e0e0e0");
        const { cover, previous, mix } = this.coverFrame(id, ma, media);

        let progress: number | undefined;
        if (settings.showProgress && queue && media?.duration) progress = maConnection.elapsed(queue) / media.duration;

        return {
            image: renderKeyImage({
                cover,
                previousCover: previous,
                coverMix: mix,
                icon: playing ? (cover ? undefined : ICONS.note) : ICONS.play,
                color: accent,
                dimmed: !playing,
                progress,
                progressColor: accent,
                overlay:
                    settings.showTitle && media
                        ? this.title.overlay(id, media.title ? `${media.title}${media.artist ? ` [${media.artist}]` : ""}` : (media.artist ?? ""), () => !!this.instances.get(id)?.settings.showTitle, () => this.render(id))
                        : undefined,
            }),
            title: settings.showPlayerName ? playerName : "",
        };
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
