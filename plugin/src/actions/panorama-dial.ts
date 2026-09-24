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
import { effectSettingsFor, panorama, type EffectSettings } from "../render/panorama";
import { stripImage } from "../render/strip";

type PanoramaDialSettings = EffectSettings & JsonObject;
type Instance = { action: DialAction<PanoramaDialSettings>; settings: PanoramaDialSettings; deviceId: string; column: number; previewAt?: number };

const PREVIEW_EVERY_MS = 1000;

/**
 * An ambient effect across neighbouring dials (particles, matrix rain, boing ball, boing globe) —
 * the sonos-controller panorama effects. Rotate/push/touch are handed to the effect; values it
 * changes itself (e.g. speed) are saved. Tinted with the active player's cover color when on.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.panorama-dial" })
export class PanoramaDial extends SingletonAction<PanoramaDialSettings> {
    private readonly instances = new Map<string, Instance>();
    private readonly persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
        this.join(ev.action.id);
    }

    override onWillDisappear(ev: WillDisappearEvent<PanoramaDialSettings>): void {
        this.instances.delete(ev.action.id);
        panorama.leave(ev.action.id);
        piBridge.forget(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<PanoramaDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
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

    private effectSettings(inst: Instance): Record<string, unknown> {
        const active = maConnection.player(maConnection.globalSettings.activePlayerId);
        return effectSettingsFor(inst.settings, this.effectId(inst), active?.current_media);
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
        const image = stripImage([], "#000", panorama.renderSlice(id));
        void inst.action.setFeedback({ "full-canvas": image });
        // The PI preview doesn't need every frame
        const now = Date.now();
        if (!inst.previewAt || now - inst.previewAt > PREVIEW_EVERY_MS) {
            inst.previewAt = now;
            const effectId = this.effectId(inst);
            const name = streamDeck.i18n.t(`effect.${effectId}.name`);
            piBridge.updatePreview(id, { image, kind: "dial", state: "idle", track: name.startsWith("effect.") ? effectId : name });
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
