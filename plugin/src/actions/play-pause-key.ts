import streamDeck, {
    action,
    type DidReceiveSettingsEvent,
    type KeyAction,
    type KeyDownEvent,
    SingletonAction,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import { currentElapsed } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { piBridge } from "../pi/pi-bridge";
import type { KeyPreview, KeyPreviewState } from "../pi/protocol";
import { getCachedCover, loadCover } from "../render/cover-cache";
import { ICONS, renderKeyImage, rgb } from "../render/key-image";

type PlayPauseSettings = {
    /** "" = follow the active player. */
    playerId?: string;
    showPlayerName?: boolean;
    showProgress?: boolean;
};

type Instance = {
    action: KeyAction<PlayPauseSettings>;
    settings: PlayPauseSettings;
    lastRender?: string;
};

const COVER_SIZE = 160;

@action({ UUID: "de.boriskemper.music-assistant-controller.play-pause-key" })
export class PlayPauseKey extends SingletonAction<PlayPauseSettings> {
    private readonly instances = new Map<string, Instance>();

    constructor() {
        super();
        maConnection.onChange(() => this.renderAll());
    }

    override onWillAppear(ev: WillAppearEvent<PlayPauseSettings>): void {
        if (!ev.action.isKey()) return;
        this.instances.set(ev.action.id, { action: ev.action, settings: ev.payload.settings });
        this.render(ev.action.id);
    }

    override onWillDisappear(ev: WillDisappearEvent<PlayPauseSettings>): void {
        this.instances.delete(ev.action.id);
        piBridge.forget(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<PlayPauseSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        inst.lastRender = undefined;
        this.render(ev.action.id);
    }

    override async onKeyDown(ev: KeyDownEvent<PlayPauseSettings>): Promise<void> {
        const inst = this.instances.get(ev.action.id);
        const ma = maConnection.ma;
        const player = maConnection.player(maConnection.resolvePlayerId(ev.payload.settings.playerId));
        const queue = maConnection.queueFor(player);
        if (!inst || !ma?.isConnected || !player || !queue) {
            await ev.action.showAlert();
            return;
        }
        // Flip immediately on every key of this queue; the server confirms via events.
        const wasPlaying = maConnection.playbackState(queue) === "playing";
        maConnection.setOptimisticState(queue.queue_id, wasPlaying ? "paused" : "playing");
        try {
            await ma.playPause(queue.queue_id);
        } catch (e) {
            streamDeck.logger.warn("[play-pause] command failed", e);
            maConnection.clearOptimisticState(queue.queue_id);
            await ev.action.showAlert();
        }
    }

    private renderAll(): void {
        for (const id of this.instances.keys()) this.render(id);
    }

    private render(id: string): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        const t = (key: string) => streamDeck.i18n.t(key);
        const { settings } = inst;
        const following = !settings.playerId;
        let image: string;
        let title = "";
        let state: KeyPreviewState;
        let track: string | undefined;

        const conn = maConnection.state;
        const player = maConnection.player(maConnection.resolvePlayerId(settings.playerId));
        const playerName = player ? (player.display_name ?? player.name) : undefined;

        if (!maConnection.loaded) {
            // Global settings not there yet (plugin just started): neutral, no text.
            image = renderKeyImage({ icon: ICONS.connecting, dimmed: true });
            state = "offline";
        } else if (!maConnection.globalSettings.maUrl || !maConnection.globalSettings.maToken) {
            image = renderKeyImage({ icon: ICONS.connecting, dimmed: true });
            title = t("key.setup");
            state = "setup";
        } else if (conn === "auth_failed") {
            image = renderKeyImage({ icon: ICONS.offline, color: "#e57373" });
            title = t("key.auth_failed");
            state = "auth_failed";
        } else if (conn !== "connected") {
            image = renderKeyImage({ icon: ICONS.offline, dimmed: true });
            title = t("key.offline");
            state = "offline";
        } else if (!player) {
            image = renderKeyImage({ icon: ICONS.noPlayer, dimmed: true });
            title = t("key.no_player");
            state = "no_player";
        } else {
            const queue = maConnection.queueFor(player);
            const playbackState = queue ? maConnection.playbackState(queue) : player.playback_state;
            const playing = playbackState === "playing";
            state = playing ? "playing" : playbackState === "paused" ? "paused" : "idle";
            const media = player.current_media;
            track = [media?.title, media?.artist].filter(Boolean).join(" · ") || undefined;
            const accent = rgb(media?.palette?.accent, "#e0e0e0");

            let cover: string | undefined;
            const imageUrl = media?.image_url ? maConnection.ma!.resolveImageUrl(media.image_url, COVER_SIZE) : undefined;
            if (imageUrl) {
                cover = getCachedCover(imageUrl);
                if (!cover) void loadCover(imageUrl).then((c) => c && this.render(id));
            }

            let progress: number | undefined;
            if (settings.showProgress && queue && media?.duration) {
                progress = currentElapsed(queue) / media.duration;
            }

            image = renderKeyImage({
                cover,
                icon: playing ? (cover ? undefined : ICONS.note) : ICONS.play,
                color: accent,
                dimmed: !playing,
                progress,
                progressColor: accent,
            });
            if (settings.showPlayerName) title = playerName ?? "";
        }

        const preview: KeyPreview = { image, state, track, playerName, following };
        piBridge.updatePreview(id, preview);

        // Events arrive often (e.g. queue_time_updated) — only push to the device when something changed.
        const signature = `${title}\n${image}`;
        if (signature === inst.lastRender) return;
        inst.lastRender = signature;
        void inst.action.setImage(image);
        void inst.action.setTitle(title);
    }
}
