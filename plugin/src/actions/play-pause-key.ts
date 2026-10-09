import { action } from "@elgato/streamdeck";
import type { PlayerMedia, PlayerQueue } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { upcomingCrossfade } from "../ma/crossfade-predict";
import { playingProvider, providerLogo } from "../ma/provider-icons";
import { providerBadge } from "../render/provider-badge";
import { getCachedCover, loadCover, frames } from "@rocklobster42195/streamdeck-kit";
import { ICONS, renderKeyImage } from "../render/key-image";
import { coverAccent, rgb } from "../render/cover-color";
import { KeyTitleFader } from "../render/key-title";
import { COVER_SIZE, type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type PlayPauseSettings = MaKeySettings & {
    showPlayerName?: boolean;
    showProgress?: boolean;
    /** Scrolling "title [artist]" at the bottom of the key (as in sonos-controller). */
    showTitle?: boolean;
    /** Logo of the music service that is playing, top left. */
    showProvider?: boolean;
};

@action({ UUID: "de.boriskemper.music-assistant-controller.play-pause-key" })
export class PlayPauseKey extends MaKeyAction<PlayPauseSettings> {
    private readonly title = new KeyTitleFader();
    /** The next item whose cover a predicted crossfade already faded in, and how far. */
    private readonly predicted = new Map<string, { itemId: string; mix: number }>();
    /** Keys whose predicted fade is running right now (drives the redraw ticks). */
    private readonly fading = new Set<string>();

    protected override renderPlayer({ id, ma, player, queue, settings, playerName }: PlayerContext<PlayPauseSettings>): KeyRender {
        const playing = (queue?.state ?? player.playback_state) === "playing";
        const media = player.current_media;
        const accent = rgb(coverAccent(media), "#e0e0e0");
        // Once MA reports the predicted track, its cover continues from where the prediction left off.
        const pred = this.predicted.get(id);
        const current = queue?.current_item?.queue_item_id;
        const startMix = pred && pred.itemId === current ? pred.mix : 0;
        if (pred && pred.itemId === current) this.predicted.delete(id);
        let { cover, previous, mix } = this.coverFrame(id, ma, media, startMix);

        // In flow mode, fade the next cover in along with MA's audio crossfade (see crossfade-predict.ts).
        const xf = playing && queue ? upcomingCrossfade(queue, maConnection.elapsed(queue)) : undefined;
        this.fading.delete(id);
        const nextUrl = xf?.next.image?.proxy_id ? ma.imageProxyUrl(xf.next.image.proxy_id, COVER_SIZE) : undefined;
        if (xf && nextUrl && cover) {
            const next = getCachedCover(nextUrl);
            if (!next) void loadCover(nextUrl).then((c) => c && this.render(id));
            else {
                previous = cover;
                cover = next;
                mix = xf.mix;
                this.predicted.set(id, { itemId: xf.next.queue_item_id, mix: xf.mix });
                if (xf.mix < 1) {
                    this.fading.add(id);
                    // Keys otherwise only redraw on events — tick while the fade runs.
                    frames.run(`xfade-${id}`, () => {
                        if (!this.fading.has(id) || !this.instances.has(id)) return false;
                        this.render(id);
                        return this.fading.has(id);
                    });
                }
            }
        }

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
                cornerBadge: this.badge(id, settings, media, queue),
                overlay:
                    settings.showTitle && media
                        ? this.title.overlay(id, media.title ? `${media.title}${media.artist ? ` [${media.artist}]` : ""}` : (media.artist ?? ""), () => !!this.instances.get(id)?.settings.showTitle, () => this.render(id))
                        : undefined,
            }),
            title: settings.showPlayerName ? playerName : "",
        };
    }

    private badge(id: string, settings: PlayPauseSettings, media: PlayerMedia | null | undefined, queue: PlayerQueue | undefined): string | undefined {
        const provider = settings.showProvider ? playingProvider(media, queue) : undefined;
        const logo = provider && providerLogo(provider, 13, 13, 22, () => this.render(id));
        return logo ? providerBadge(24, 24, 18, logo) : undefined;
    }

    protected override async press({ ma, player, queue }: PlayerContext<PlayPauseSettings>): Promise<void> {
        // Playing from a source outside MA (e.g. started in the Sonos app): control the player itself
        if (!queue) {
            await ma.call("players/cmd/play_pause", { player_id: player.player_id });
            return;
        }
        // Flip immediately on every key of this queue; the server confirms via events.
        maConnection.showPlaying(queue.queue_id, queue.state !== "playing");
        try {
            await ma.playPause(queue.queue_id);
        } catch (e) {
            maConnection.unpatch(queue.queue_id);
            throw e;
        }
    }
}
