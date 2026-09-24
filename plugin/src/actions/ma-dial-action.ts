import streamDeck, {
    type DialAction,
    type DialDownEvent,
    type DialRotateEvent,
    type DidReceiveSettingsEvent,
    SingletonAction,
    type TouchTapEvent,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import type { MusicAssistantClient, PlayerMedia } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { piBridge } from "../pi/pi-bridge";
import type { KeyPreview, KeyPreviewState } from "../pi/protocol";
import { getCachedCover, loadCover } from "../render/cover-cache";
import { ICONS } from "../render/key-image";
import { mdi, stripImage, text } from "../render/strip";
import { COVER_SIZE, type MaKeySettings, type PlayerContext } from "./ma-key-action";

export type StripRender = { image: string; preview?: Partial<Pick<KeyPreview, "track" | "state">> };

type Instance<S extends JsonObject> = { action: DialAction<S>; settings: S; lastRender?: string };

/**
 * Base class for MAC dials (Stream Deck +). Mirrors MaKeyAction: instances, not-ready states,
 * PI preview, render dedupe — but renders a 200×100 touch-strip segment via setFeedback.
 */
export abstract class MaDialAction<S extends MaKeySettings> extends SingletonAction<S> {
    protected readonly instances = new Map<string, Instance<S>>();

    constructor() {
        super();
        maConnection.onChange(() => this.renderAll());
    }

    protected abstract renderPlayer(ctx: PlayerContext<S>): StripRender;
    protected abstract rotate(ctx: PlayerContext<S>, ticks: number): Promise<void>;
    protected abstract push(ctx: PlayerContext<S>): Promise<void>;
    protected abstract touch(ctx: PlayerContext<S>, hold: boolean): Promise<void>;

    protected t(key: string): string {
        return streamDeck.i18n.t(key);
    }

    override onWillAppear(ev: WillAppearEvent<S>): void {
        if (!ev.action.isDial()) return;
        this.instances.set(ev.action.id, { action: ev.action, settings: ev.payload.settings });
        this.render(ev.action.id);
    }

    override onWillDisappear(ev: WillDisappearEvent<S>): void {
        this.instances.delete(ev.action.id);
        piBridge.forget(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        inst.lastRender = undefined;
        this.render(ev.action.id);
    }

    override async onDialRotate(ev: DialRotateEvent<S>): Promise<void> {
        await this.run(ev.action.id, ev.payload.settings, (ctx) => this.rotate(ctx, ev.payload.ticks));
    }

    override async onDialDown(ev: DialDownEvent<S>): Promise<void> {
        await this.run(ev.action.id, ev.payload.settings, (ctx) => this.push(ctx));
    }

    override async onTouchTap(ev: TouchTapEvent<S>): Promise<void> {
        await this.run(ev.action.id, ev.payload.settings, (ctx) => this.touch(ctx, ev.payload.hold));
    }

    /** Persist settings from the plugin side (e.g. "hold to save preset"). */
    protected async saveSettings(id: string, patch: Partial<S>): Promise<void> {
        const inst = this.instances.get(id);
        if (!inst) return;
        inst.settings = { ...inst.settings, ...patch };
        await inst.action.setSettings(inst.settings);
        this.render(id);
    }

    protected renderAll(): void {
        for (const id of this.instances.keys()) this.render(id);
    }

    protected render(id: string): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        const ctx = this.playerContext(id, inst.settings);
        let out: StripRender;
        let state: KeyPreviewState;
        if (ctx) {
            out = this.renderPlayer(ctx);
            const s = ctx.queue?.state ?? ctx.player.playback_state;
            state = s === "playing" ? "playing" : s === "paused" ? "paused" : "idle";
        } else {
            [out, state] = this.notReady();
        }
        const media = ctx?.player.current_media;
        piBridge.updatePreview(id, {
            image: out.image,
            kind: "dial",
            state,
            track: [media?.title, media?.artist].filter(Boolean).join(" · ") || undefined,
            playerName: ctx?.playerName,
            following: !inst.settings.playerId,
            ...out.preview,
        });
        if (out.image === inst.lastRender) return;
        inst.lastRender = out.image;
        void inst.action.setFeedback({ "full-canvas": out.image });
    }

    protected playerContext(id: string, settings: S): PlayerContext<S> | undefined {
        const ma = maConnection.ma;
        if (!maConnection.loaded || !ma?.isConnected) return undefined;
        const player = maConnection.player(maConnection.resolvePlayerId(settings.playerId));
        if (!player) return undefined;
        return { id, settings, ma, player, queue: maConnection.queueFor(player), playerName: player.display_name ?? player.name };
    }

    protected cover(id: string, ma: MusicAssistantClient, media: PlayerMedia | null | undefined): string | undefined {
        if (!media?.image_url) return undefined;
        const url = ma.resolveImageUrl(media.image_url, COVER_SIZE);
        const hit = getCachedCover(url);
        if (!hit) void loadCover(url).then((c) => c && this.render(id));
        return hit;
    }

    private async run(id: string, settings: S, fn: (ctx: PlayerContext<S>) => Promise<void>): Promise<void> {
        const inst = this.instances.get(id);
        const ctx = this.playerContext(id, settings);
        if (!ctx || !inst) {
            await inst?.action.showAlert();
            return;
        }
        try {
            await fn(ctx);
        } catch (e) {
            streamDeck.logger.warn(`[${this.manifestId ?? "dial"}] input failed`, e);
            await inst.action.showAlert();
        }
    }

    private notReady(): [StripRender, KeyPreviewState] {
        const g = maConnection.globalSettings;
        const msg = (icon: string, color: string, label: string) => stripImage([mdi(icon, 20, 26, 48, color), ...(label ? [text(84, 57, label, { size: 17, weight: "bold", color, maxWidth: 110 })] : [])]);
        if (!maConnection.loaded) return [{ image: msg(ICONS.connecting, "#777", "") }, "offline"];
        if (!g.maUrl || !g.maToken) return [{ image: msg(ICONS.connecting, "#9a9aa0", this.t("key.setup")) }, "setup"];
        if (maConnection.state === "auth_failed") return [{ image: msg(ICONS.offline, "#e57373", this.t("key.auth_failed")) }, "auth_failed"];
        if (maConnection.state !== "connected") return [{ image: msg(ICONS.offline, "#9a9aa0", this.t("key.offline")) }, "offline"];
        return [{ image: msg(ICONS.noPlayer, "#9a9aa0", this.t("key.no_player")) }, "no_player"];
    }
}
