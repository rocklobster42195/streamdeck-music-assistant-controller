import { action } from "@elgato/streamdeck";
import { maConnection } from "../ma/connection";
import { mdiBookOpenPageVariant } from "@mdi/js";
import { inProgress, type InProgressItem, type InProgressKind } from "../ma/in-progress";
import { getCachedCover, loadCover } from "@rocklobster42195/streamdeck-kit";
import { ACCENT, ICONS, renderKeyImage } from "../render/key-image";
import { KeyTitleFader } from "../render/key-title";
import { COVER_SIZE, type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type ContinueSettings = MaKeySettings & {
    /** Which kind of item the key continues. */
    kind?: InProgressKind;
    /** Show the item's name (scrolling) at the bottom of the key. */
    showName?: boolean;
};

const KINDS = new Set(["audiobook", "podcast_episode"]);

/**
 * "Continue listening": the most recently started audiobook or podcast episode that isn't finished.
 * Press resumes it where it was left off (MA keeps the position); while it plays, press pauses.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.continue-key" })
export class ContinueKey extends MaKeyAction<ContinueSettings> {
    private readonly title = new KeyTitleFader();

    constructor() {
        super();
        inProgress.onUpdate(() => this.renderAll());
    }

    protected override renderPlayer({ id, ma, queue, settings }: PlayerContext<ContinueSettings>): KeyRender {
        const kind = settings.kind ?? "any";
        const current = this.currentItem(queue, kind);
        const item = current?.item ?? inProgress.latest(kind);
        if (!item) {
            return { image: renderKeyImage({ icon: mdiBookOpenPageVariant, dimmed: true }), title: this.t("key.nothing_to_continue"), preview: { track: "", state: "idle" } };
        }

        let cover: string | undefined;
        if (item.imageProxyId) {
            const url = ma.imageProxyUrl(item.imageProxyId, COVER_SIZE);
            cover = getCachedCover(url);
            if (!cover) void loadCover(url).then((c) => c && this.render(id));
        }
        const playing = current?.playing ?? false;
        const progress = current?.progress ?? item.progress;
        const showName = settings.showName !== false;
        return {
            image: renderKeyImage({
                cover,
                icon: cover ? undefined : item.mediaType === "audiobook" ? mdiBookOpenPageVariant : ICONS.podcast,
                color: playing ? ACCENT : undefined,
                active: playing ? ACCENT : undefined,
                progress,
                progressColor: ACCENT,
                overlay: showName ? this.title.overlay(id, item.name, () => this.instances.get(id)?.settings.showName !== false, () => this.render(id)) : undefined,
            }),
            title: "",
            preview: { track: item.name, state: playing ? "playing" : "idle" },
        };
    }

    protected override async press({ ma, player, queue, settings }: PlayerContext<ContinueSettings>): Promise<void> {
        const kind = settings.kind ?? "any";
        const queueId = queue?.queue_id ?? maConnection.leaderId(player);
        // Already loaded on this player: toggle, so a second press pauses
        if (this.currentItem(queue, kind)) {
            await ma.playPause(queueId);
            return;
        }
        const item = inProgress.latest(kind);
        if (!item) throw new Error("nothing to continue");
        // MA resumes audiobooks and episodes at the saved position by default
        await ma.playMedia(queueId, item.uri, "replace");
        inProgress.refreshSoon(3000);
    }

    /** The queue's current item when it is an audiobook/episode of the wanted kind, with live progress. */
    private currentItem(queue: PlayerContext<ContinueSettings>["queue"], kind: InProgressKind): { item: InProgressItem; playing: boolean; progress?: number } | undefined {
        const media = queue?.current_item?.media_item;
        if (!queue || !media || !KINDS.has(media.media_type) || (kind !== "any" && media.media_type !== kind)) return undefined;
        const known = inProgress.all().find((i) => i.uri === media.uri);
        const image = (queue.current_item?.image as { proxy_id?: string } | null | undefined) ?? media.metadata?.images?.[0];
        const item: InProgressItem = known ?? { uri: media.uri, name: media.name, mediaType: media.media_type as InProgressItem["mediaType"], imageProxyId: image?.proxy_id };
        const duration = queue.current_item?.duration;
        return {
            item,
            playing: queue.state === "playing",
            progress: duration ? Math.min(1, maConnection.elapsed(queue) / duration) : undefined,
        };
    }
}
