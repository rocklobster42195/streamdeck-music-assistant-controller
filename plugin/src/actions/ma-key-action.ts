import streamDeck, {
    type DidReceiveSettingsEvent,
    type KeyAction,
    type KeyDownEvent,
    SingletonAction,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import type { MusicAssistantClient, Player, PlayerMedia, PlayerQueue } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { piBridge } from "../pi/pi-bridge";
import type { KeyPreview, KeyPreviewState } from "../pi/protocol";
import { CoverFader, type CoverFrame } from "../render/cover-fade";
import { coverAccent, ICONS, renderKeyImage, rgb, withIconTint } from "../render/key-image";

/** Every MAC key has a player target; "" / undefined = follow the active player. */
export type MaKeySettings = {
    playerId?: string;
    /** Icons in the cover's color instead of light grey / blue (off: as usual). */
    iconCoverColor?: boolean;
} & JsonObject;

/** Everything a key needs to render or act once MA is connected and its player exists. */
export type PlayerContext<S> = {
    id: string;
    settings: S;
    ma: MusicAssistantClient;
    player: Player;
    /** Queue that drives the player right now (optimistic overrides applied). */
    queue: PlayerQueue | undefined;
    playerName: string;
};

export type KeyRender = {
    image: string;
    title?: string;
    /** Override what the PI header shows (defaults: what the player is playing). */
    preview?: Partial<Pick<KeyPreview, "track" | "state">>;
};

type Instance<S extends JsonObject> = { action: KeyAction<S>; settings: S; lastRender?: string; lastTitle?: string; previewAt?: number; previewKey?: string };

/** An open PI's key preview doesn't need every animation frame (the Stream Deck app shows the key live). */
const PREVIEW_EVERY_MS = 1000;

export const COVER_SIZE = 160;

/**
 * Base class for MAC keys. Handles instances, re-rendering on every MA change, the common
 * "not ready" states (loading, setup, token, offline, no player), the PI preview, and only
 * pushes images/titles to Stream Deck when they actually changed.
 */
export abstract class MaKeyAction<S extends MaKeySettings> extends SingletonAction<S> {
    protected readonly instances = new Map<string, Instance<S>>();

    /** false = the action is bound to its own player setting and never falls back to the active player. */
    protected readonly followsActivePlayer: boolean = true;

    constructor() {
        super();
        maConnection.onChange(() => this.renderAll());
    }

    /** Render the key for a connected player. */
    protected abstract renderPlayer(ctx: PlayerContext<S>): KeyRender;

    /** Handle a key press for a connected player. Throwing shows the alert triangle; returning "ok" shows the check mark. */
    protected abstract press(ctx: PlayerContext<S>): Promise<void | "ok">;

    /** Translate a key from the plugin's locale files. */
    protected t(key: string): string {
        return streamDeck.i18n.t(key);
    }

    override onWillAppear(ev: WillAppearEvent<S>): void {
        if (!ev.action.isKey()) return;
        this.instances.set(ev.action.id, { action: ev.action, settings: ev.payload.settings });
        this.render(ev.action.id);
    }

    override onWillDisappear(ev: WillDisappearEvent<S>): void {
        this.instances.delete(ev.action.id);
        this.covers.forget(ev.action.id);
        piBridge.forget(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        inst.lastRender = undefined;
        this.render(ev.action.id);
    }

    override async onKeyDown(ev: KeyDownEvent<S>): Promise<void> {
        const ctx = this.playerContext(ev.action.id, ev.payload.settings);
        if (!ctx) {
            await ev.action.showAlert();
            return;
        }
        try {
            if ((await this.press(ctx)) === "ok") await ev.action.showOk();
        } catch (e) {
            streamDeck.logger.warn(`[${this.manifestId ?? "action"}] press failed`, e);
            await ev.action.showAlert();
        }
    }

    protected renderAll(): void {
        for (const id of this.instances.keys()) this.render(id);
    }

    protected render(id: string): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        const ctx = this.playerContext(id, inst.settings);
        let out: KeyRender;
        let previewState: KeyPreviewState;

        if (ctx) {
            // "Cover color" option: icons take the color of what is playing
            const tint = inst.settings.iconCoverColor === true ? coverAccent(ctx.player.current_media) : undefined;
            out = withIconTint(tint && rgb(tint, ""), () => this.renderPlayer(ctx));
            const s = ctx.queue?.state ?? ctx.player.playback_state;
            previewState = s === "playing" ? "playing" : s === "paused" ? "paused" : "idle";
        } else {
            [out, previewState] = notReadyRender();
        }

        const media = ctx?.player.current_media;
        const preview: KeyPreview = {
            image: out.image,
            state: previewState,
            track: [media?.title, media?.artist].filter(Boolean).join(" · ") || undefined,
            playerName: ctx?.playerName,
            following: !inst.settings.playerId,
            ...out.preview,
        };
        // State or track changes go out at once; image-only changes (animation frames) at most once a second
        const now = Date.now();
        const previewKey = `${preview.state}\n${preview.track ?? ""}\n${preview.playerName ?? ""}`;
        if (previewKey !== inst.previewKey || !inst.previewAt || now - inst.previewAt >= PREVIEW_EVERY_MS) {
            inst.previewAt = now;
            inst.previewKey = previewKey;
            piBridge.updatePreview(id, preview);
        }

        // Events arrive often (e.g. queue_time_updated) — only push to the device when something changed.
        const title = out.title ?? "";
        const signature = `${title}\n${out.image}`;
        if (signature === inst.lastRender) return;
        inst.lastRender = signature;
        void inst.action.setImage(out.image);
        // Titles rarely change; don't resend them with every animation frame
        if (title !== inst.lastTitle) {
            inst.lastTitle = title;
            void inst.action.setTitle(title);
        }
    }

    protected playerContext(id: string, settings: S): PlayerContext<S> | undefined {
        const ma = maConnection.ma;
        if (!maConnection.loaded || !ma?.isConnected) return undefined;
        // Most actions follow the active player when none is set; bound ones (e.g. a room key) never do.
        const player = maConnection.player(this.followsActivePlayer ? maConnection.resolvePlayerId(settings.playerId) : settings.playerId || undefined);
        if (!player) return undefined;
        return { id, settings, ma, player, queue: maConnection.queueFor(player), playerName: player.display_name ?? player.name };
    }

    private readonly covers = new CoverFader();

    /**
     * Cover art of the current media as data URI. While the next cover loads, the last one stays
     * (and re-renders once it's there); a new cover crossfades in over the old one.
     */
    protected coverFrame(id: string, ma: MusicAssistantClient, media: PlayerMedia | null | undefined, startMix = 0): CoverFrame {
        const url = media?.image_url ? ma.resolveImageUrl(media.image_url, COVER_SIZE) : undefined;
        return this.covers.frame(id, url, () => this.render(id), startMix);
    }

    /** {@link coverFrame} without the crossfade, for keys that just show the cover. */
    protected cover(id: string, ma: MusicAssistantClient, media: PlayerMedia | null | undefined): string | undefined {
        return this.coverFrame(id, ma, media).cover;
    }
}

/** Key image/title and PI state for the states where no player can be controlled. */
function notReadyRender(): [KeyRender, KeyPreviewState] {
    const t = (key: string) => streamDeck.i18n.t(key);
    const g = maConnection.globalSettings;
    if (!maConnection.loaded) return [{ image: renderKeyImage({ icon: ICONS.connecting, dimmed: true }) }, "offline"];
    if (!g.maUrl || !g.maToken) return [{ image: renderKeyImage({ icon: ICONS.connecting, dimmed: true }), title: t("key.setup") }, "setup"];
    if (maConnection.state === "auth_failed") return [{ image: renderKeyImage({ icon: ICONS.offline, color: "#e57373" }), title: t("key.auth_failed") }, "auth_failed"];
    if (maConnection.state !== "connected") return [{ image: renderKeyImage({ icon: ICONS.offline, dimmed: true }), title: t("key.offline") }, "offline"];
    return [{ image: renderKeyImage({ icon: ICONS.noPlayer, dimmed: true }), title: t("key.no_player") }, "no_player"];
}
