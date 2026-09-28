import { action } from "@elgato/streamdeck";
import { getCachedCover, loadCover } from "@rocklobster42195/streamdeck-kit";
import { ACCENT, ICONS, renderKeyImage } from "../render/key-image";
import { COVER_SIZE, type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

/** How MA should enqueue the item (MA QueueOption). */
export type EnqueueOption = "replace" | "next" | "add";

type PlayItemSettings = MaKeySettings & {
    uri?: string;
    name?: string;
    subtitle?: string;
    mediaType?: string;
    imageProxyId?: string;
    option?: EnqueueOption;
    showName?: boolean;
};

/**
 * Plays any MA item — playlist, album, radio station, podcast, track — with one press.
 * Shows the item's cover and lights up while it is what the player is playing.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.play-item-key" })
export class PlayItemKey extends MaKeyAction<PlayItemSettings> {
    protected override renderPlayer({ id, ma, player, queue, settings }: PlayerContext<PlayItemSettings>): KeyRender {
        if (!settings.uri) return { image: renderKeyImage({ icon: ICONS.star, dimmed: true }), title: this.t("key.choose_item") };

        let cover: string | undefined;
        if (settings.imageProxyId) {
            const url = ma.imageProxyUrl(settings.imageProxyId, COVER_SIZE);
            cover = getCachedCover(url);
            if (!cover) void loadCover(url).then((c) => c && this.render(id));
        }

        const playingThis = (queue?.state ?? player.playback_state) === "playing" && isCurrent(settings.uri, player.current_media?.uri, queue?.current_item);
        return {
            image: renderKeyImage({
                cover,
                icon: cover ? undefined : mediaIcon(settings.mediaType),
                color: playingThis ? ACCENT : undefined,
                active: playingThis ? ACCENT : undefined,
            }),
            title: settings.showName ? (settings.name ?? "") : "",
            // PI header: the chosen item, and "playing" only while it is what plays.
            preview: { track: [settings.name, settings.subtitle].filter(Boolean).join(" · "), state: playingThis ? "playing" : "idle" },
        };
    }

    protected override async press({ ma, player, queue, settings }: PlayerContext<PlayItemSettings>): Promise<"ok"> {
        if (!settings.uri) throw new Error("no item chosen");
        await ma.playMedia(queue?.queue_id ?? player.player_id, settings.uri, settings.option ?? "replace");
        return "ok";
    }
}

/** Is `uri` what the player is playing — the item itself (radio/track) or the album of the current track? */
function isCurrent(uri: string, currentUri: string | undefined, currentItem: unknown): boolean {
    if (!currentUri) return false;
    if (currentUri === uri) return true;
    const media = (currentItem as { media_item?: { album?: { uri?: string } } } | null | undefined)?.media_item;
    return media?.album?.uri === uri;
}

function mediaIcon(mediaType: string | undefined): string {
    switch (mediaType) {
        case "radio":
            return ICONS.radio;
        case "playlist":
            return ICONS.playlist;
        case "podcast":
            return ICONS.podcast;
        case "album":
            return ICONS.album;
        default:
            return ICONS.note;
    }
}
