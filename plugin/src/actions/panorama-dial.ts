import streamDeck, {
    action,
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
import { DEFAULT_EFFECT_ID } from "streamdeck-core";
import { maConnection } from "../ma/connection";
import { piBridge } from "../pi/pi-bridge";
import { effectSettingsFor, panorama, registerEffectTarget, spreadEffect, unregisterEffectTarget, type EffectSettings } from "../render/panorama";
import { STRIP_W, stripImage } from "../render/strip";
import { PanoramaOverlay, type OverlayMode } from "./panorama-overlay";

type PanoramaDialSettings = EffectSettings &
    JsonObject & {
        /** Text over the effect (shared by neighbouring Panorama dials). */
        text?: OverlayMode;
        /** Seconds added to the playback position for lyrics (speaker latency). */
        lyricsOffset?: number;
        /** Player whose music tints the effect and fills the text; "" = active player. */
        playerId?: string;
    };
type Instance = { action: DialAction<PanoramaDialSettings>; settings: PanoramaDialSettings; deviceId: string; column: number; previewAt?: number };

const PREVIEW_EVERY_MS = 1000;
/** Default lyrics lead: the line shows up a moment before it is sung (felt right on hardware). */
const LYRICS_LEAD_S = 0.5;

/**
 * An ambient effect across neighbouring dials (particles, matrix rain, boing ball, boing globe) —
 * the sonos-controller panorama effects. Rotate/push/touch are handed to the effect; values it
 * changes itself (e.g. speed) are saved. Tinted with the active player's cover color when on.
 * Optionally shows title & artist or synced lyrics across neighbouring Panorama dials.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.panorama-dial" })
export class PanoramaDial extends SingletonAction<PanoramaDialSettings> {
    private readonly instances = new Map<string, Instance>();
    private readonly persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly overlay = new PanoramaOverlay();

    constructor() {
        super();
        // Cover changes on the active player → new tint
        maConnection.onChange(() => {
            for (const id of this.instances.keys()) this.pushSettings(id);
        });
    }

    override onWillAppear(ev: WillAppearEvent<PanoramaDialSettings>): void {
        if (!ev.action.isDial()) return;
        const column = "coordinates" in ev.payload && ev.payload.coordinates ? ev.payload.coordinates.column : 0;
        this.instances.set(ev.action.id, { action: ev.action, settings: ev.payload.settings, deviceId: ev.action.device.id, column });
        registerEffectTarget(ev.action.id, (effectId) => {
            const inst = this.instances.get(ev.action.id);
            if (!inst || this.effectId(inst) === effectId) return;
            inst.settings = { ...inst.settings, background: effectId };
            void inst.action.setSettings(inst.settings);
            this.join(ev.action.id);
            this.pushSettings(ev.action.id);
        });
        this.join(ev.action.id);
    }

    override onWillDisappear(ev: WillDisappearEvent<PanoramaDialSettings>): void {
        this.instances.delete(ev.action.id);
        this.overlay.forget(ev.action.id);
        unregisterEffectTarget(ev.action.id);
        panorama.leave(ev.action.id);
        piBridge.forget(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<PanoramaDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        const before = inst.settings;
        inst.settings = ev.payload.settings;
        spreadEffect(ev.action.id, this.effectId({ ...inst, settings: before }), this.effectId(inst), inst.settings.syncEffect);
        if (before.text !== inst.settings.text || before.lyricsOffset !== inst.settings.lyricsOffset || before.playerId !== inst.settings.playerId) this.shareText(ev.action.id);
        this.join(ev.action.id);
        this.pushSettings(ev.action.id);
    }

    override onDialRotate(ev: DialRotateEvent<PanoramaDialSettings>): void {
        panorama.rotate(ev.action.id, ev.payload.ticks);
        this.persistRuntime(ev.action.id);
    }

    override onDialDown(ev: DialDownEvent<PanoramaDialSettings>): void {
        panorama.press(ev.action.id);
        this.persistRuntime(ev.action.id);
    }

    override onTouchTap(ev: TouchTapEvent<PanoramaDialSettings>): void {
        const [x, y] = ev.payload.tapPos ?? [100, 50];
        panorama.touch(ev.action.id, x, y);
    }

    private effectId(inst: Instance): string {
        return inst.settings.background || DEFAULT_EFFECT_ID;
    }

    /** The chosen player, or the active one. */
    private playerId(inst: Instance): string | undefined {
        return maConnection.resolvePlayerId(inst.settings.playerId);
    }

    private effectSettings(inst: Instance): Record<string, unknown> {
        const player = maConnection.player(this.playerId(inst));
        return effectSettingsFor(inst.settings, this.effectId(inst), player?.current_media);
    }

    private join(id: string): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        panorama.join(id, inst.deviceId, inst.column, this.effectId(inst), this.effectSettings(inst), () => this.render(id));
    }

    private pushSettings(id: string): void {
        const inst = this.instances.get(id);
        if (inst) panorama.updateSettings(id, this.effectSettings(inst));
    }

    private render(id: string): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        const run = this.run(id);
        // The first dial of the run that shows text decides (a freshly added neighbour defaults to "off")
        const lead = run.ids.map((i) => this.instances.get(i)?.settings).find((s) => s?.text && s.text !== "off");
        const text = lead ? this.overlay.render(run.ids[0], { width: run.ids.length * STRIP_W, offset: run.index * STRIP_W }, lead.text!, Number(lead.lyricsOffset ?? LYRICS_LEAD_S), maConnection.resolvePlayerId(lead.playerId)) : "";
        const image = stripImage([text], "#000", panorama.renderSlice(id));
        void inst.action.setFeedback({ "full-canvas": image });
        // The PI preview doesn't need every frame
        const now = Date.now();
        if (!inst.previewAt || now - inst.previewAt > PREVIEW_EVERY_MS) {
            inst.previewAt = now;
            // PI header: the chosen player and what it plays (like the other dials)
            const player = maConnection.player(this.playerId(inst));
            const s = player && (maConnection.queueFor(player)?.state ?? player.playback_state);
            const media = player?.current_media;
            piBridge.updatePreview(id, {
                image,
                kind: "dial",
                state: s === "playing" ? "playing" : s === "paused" ? "paused" : "idle",
                track: [media?.title, media?.artist].filter(Boolean).join(" · ") || undefined,
                playerName: player ? (player.display_name ?? player.name) : undefined,
                following: !inst.settings.playerId,
            });
        }
    }

    /**
     * The neighbouring Panorama dials in this dial's effect group, left to right, that share one
     * text line (other dials in the group, e.g. a Track dial with a background, break the run).
     */
    private run(id: string): { ids: string[]; index: number } {
        const members = panorama.members(id);
        const at = members.findIndex((m) => m.context === id);
        if (at < 0) return { ids: [id], index: 0 };
        const joins = (from: number, to: number) => this.instances.has(members[to].context) && Math.abs(members[to].column - members[from].column) === 1;
        let first = at;
        while (first > 0 && joins(first, first - 1)) first--;
        let last = at;
        while (last < members.length - 1 && joins(last, last + 1)) last++;
        const ids = members.slice(first, last + 1).map((m) => m.context);
        return { ids, index: at - first };
    }

    /** A text or player setting changed on one dial: the rest of its run follows. */
    private shareText(id: string): void {
        const source = this.instances.get(id);
        if (!source) return;
        for (const other of this.run(id).ids) {
            const inst = this.instances.get(other);
            const same = inst?.settings.text === source.settings.text && inst?.settings.lyricsOffset === source.settings.lyricsOffset && inst?.settings.playerId === source.settings.playerId;
            if (!inst || other === id || same) continue;
            inst.settings = { ...inst.settings, text: source.settings.text, lyricsOffset: source.settings.lyricsOffset, playerId: source.settings.playerId };
            inst.action.setSettings(inst.settings).catch((e) => streamDeck.logger.warn("[panorama] text sync failed", e));
        }
    }

    /** Save values the effect changed itself (e.g. speed after turning), debounced. */
    private persistRuntime(id: string): void {
        clearTimeout(this.persistTimers.get(id));
        this.persistTimers.set(
            id,
            setTimeout(() => {
                const inst = this.instances.get(id);
                const runtime = panorama.runtimeSettings(id);
                if (!inst || !runtime) return;
                inst.settings = { ...inst.settings, ...(runtime as JsonObject) };
                inst.action.setSettings(inst.settings).catch((e) => streamDeck.logger.warn("[panorama] save failed", e));
            }, 800),
        );
    }
}
