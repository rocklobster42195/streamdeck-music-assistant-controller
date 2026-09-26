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
import { BLANK_EFFECT_ID, DEFAULT_EFFECT_ID } from "streamdeck-core";
import { maConnection } from "../ma/connection";
import { piBridge } from "../pi/pi-bridge";
import { effectSettingsFor, panorama, registerEffectTarget, spreadEffect, unregisterEffectTarget, type EffectSettings } from "../render/panorama";
import { STRIP_W, stripImage } from "../render/strip";
import { functionIcon } from "../render/function-icons";
import { functionOverlay, noticeOverlay, timingOverlay } from "../render/panorama-text";
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
/** Lyrics timing on the dial: range (as in the PI), step per tick, how long the scale stays. */
const OFFSET_MIN = -10;
const OFFSET_MAX = 5;
const OFFSET_STEP = 0.1;
const TIMING_SHOW_MS = 2500;
const NOTICE_MS = 1500;
const OVERLAY_FADE_MS = 400;
const FUNCTION_SHOW_MS = 1500;


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
    /** Per run (key = its first dial): until when the timing scale shows, and a short notice. */
    private readonly timingUntil = new Map<string, number>();
    /** When the current top overlay started showing (its fade-in doesn't restart while it stays up). */
    private readonly shownSince = new Map<string, number>();
    private readonly notice = new Map<string, { text: string; until: number }>();
    private readonly offsetSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
    /** Per run: the function turning changes, and until when its badge shows. */
    private readonly fn = new Map<string, string>();
    private readonly fnShownUntil = new Map<string, number>();

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
            if (!inst || inst.settings.background === effectId || (effectId && this.effectId(inst) === effectId)) return;
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
        // "No effect" spreads as "" (connected Track/Volume dials drop their background too)
        const choice = (s: PanoramaDialSettings) => (s.background === "" ? "" : this.effectId({ ...inst, settings: s }));
        spreadEffect(ev.action.id, choice(before), choice(inst.settings), inst.settings.syncEffect);
        if (before.text !== inst.settings.text || before.lyricsOffset !== inst.settings.lyricsOffset || before.playerId !== inst.settings.playerId) this.shareText(ev.action.id);
        this.join(ev.action.id);
        this.pushSettings(ev.action.id);
    }

    override onDialRotate(ev: DialRotateEvent<PanoramaDialSettings>): void {
        // Turning changes the chosen function: lyrics timing (shown as a scale) or an effect value.
        const { run, lead } = this.lead(ev.action.id);
        const current = this.currentFunction(ev.action.id, run.ids[0], lead);
        if (current === "timing" && lead) {
            const offset = Number(lead.lyricsOffset ?? LYRICS_LEAD_S);
            const next = Math.round(Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, offset + ev.payload.ticks * OFFSET_STEP)) * 10) / 10;
            for (const id of run.ids) {
                const inst = this.instances.get(id);
                if (inst) inst.settings = { ...inst.settings, lyricsOffset: next };
            }
            this.show(run.ids[0], this.timingUntil, TIMING_SHOW_MS);
            this.saveOffset(run.ids);
            return;
        }
        if (current) panorama.setControl(ev.action.id, current);
        panorama.rotate(ev.action.id, ev.payload.ticks);
        if (current) this.show(run.ids[0], this.fnShownUntil, FUNCTION_SHOW_MS);
        this.persistRuntime(ev.action.id);
    }

    override onDialDown(ev: DialDownEvent<PanoramaDialSettings>): void {
        // With more than one function (lyrics timing, particle count and speed, …) a press switches
        // between them and shows which one is active; otherwise it goes to the effect (e.g. a new bounce).
        const { run, lead } = this.lead(ev.action.id);
        const list = this.functions(ev.action.id, lead);
        if (list.length > 1) {
            const key = run.ids[0];
            const current = this.currentFunction(ev.action.id, key, lead);
            const next = list[(list.indexOf(current ?? list[0]) + 1) % list.length];
            this.fn.set(key, next);
            if (next !== "timing") panorama.setControl(ev.action.id, next);
            this.timingUntil.delete(key);
            this.show(key, this.fnShownUntil, FUNCTION_SHOW_MS);
            return;
        }
        panorama.press(ev.action.id);
        this.persistRuntime(ev.action.id);
    }

    /** Show (or keep showing) a top overlay of a run; a visible one only gets its end moved. */
    private show(runKey: string, until: Map<string, number>, ms: number): void {
        const now = Date.now();
        const visible = [this.timingUntil, this.fnShownUntil].some((m) => (m.get(runKey) ?? 0) > now);
        if (!visible) this.shownSince.set(runKey, now);
        until.set(runKey, now + ms);
    }

    /** What turning can change on this dial: lyrics timing (lyrics on), then the effect's values. */
    private functions(id: string, lead: PanoramaDialSettings | undefined): string[] {
        return [...(lead?.text === "lyrics" ? ["timing"] : []), ...panorama.controls(id)];
    }

    private currentFunction(id: string, runKey: string, lead: PanoramaDialSettings | undefined): string | undefined {
        const list = this.functions(id, lead);
        const chosen = this.fn.get(runKey);
        return chosen && list.includes(chosen) ? chosen : list[0];
    }

    override onTouchTap(ev: TouchTapEvent<PanoramaDialSettings>): void {
        // With lyrics on, a tap re-syncs the position with the server (it can drift in long sessions).
        const { run, lead } = this.lead(ev.action.id);
        if (lead?.text === "lyrics") {
            const key = run.ids[0];
            maConnection
                .resync(maConnection.resolvePlayerId(lead.playerId))
                .then(() => this.notice.set(key, { text: streamDeck.i18n.t("key.lyrics_synced"), until: Date.now() + NOTICE_MS }))
                .catch((e) => streamDeck.logger.warn("[panorama] resync failed", e));
            return;
        }
        const [x, y] = ev.payload.tapPos ?? [100, 50];
        panorama.touch(ev.action.id, x, y);
    }

    /** This dial's text run and the settings of the dial that decides its text. */
    private lead(id: string): { run: { ids: string[]; index: number }; lead: PanoramaDialSettings | undefined } {
        const run = this.run(id);
        return { run, lead: run.ids.map((i) => this.instances.get(i)?.settings).find((s) => s?.text && s.text !== "off") };
    }

    /** Persist a timing change on every dial of the run, once the dial stops turning. */
    private saveOffset(ids: string[]): void {
        const key = ids[0];
        clearTimeout(this.offsetSaveTimers.get(key));
        this.offsetSaveTimers.set(
            key,
            setTimeout(() => {
                for (const id of ids) {
                    const inst = this.instances.get(id);
                    inst?.action.setSettings(inst.settings).catch((e) => streamDeck.logger.warn("[panorama] timing save failed", e));
                }
            }, 600),
        );
    }

    /** Timing scale, function badge or notice at the top, fading in and out. */
    private topOverlay(id: string, runKey: string, geometry: { width: number; offset: number }, offset: number, lead: PanoramaDialSettings | undefined): string {
        const now = Date.now();
        const since = this.shownSince.get(runKey) ?? 0;
        const fade = (until: number) => Math.min(1, (until - now) / OVERLAY_FADE_MS, (now - since) / 150);
        const until = this.timingUntil.get(runKey) ?? 0;
        if (until > now) return timingOverlay(geometry, offset, OFFSET_MIN, OFFSET_MAX, fade(until));
        const fnUntil = this.fnShownUntil.get(runKey) ?? 0;
        const fn = this.currentFunction(id, runKey, lead);
        if (fn && fnUntil > now) {
            const level = fn === "timing" ? undefined : panorama.indicator(id);
            return functionOverlay(geometry, functionIcon(fn), streamDeck.i18n.t(`key.fn_${fn}`), level, fade(fnUntil));
        }
        const n = this.notice.get(runKey);
        if (n && n.until > now) return noticeOverlay(geometry, n.text, Math.min(1, (n.until - now) / OVERLAY_FADE_MS));
        return "";
    }

    /** "" = no effect: the dial still joins a (blank) group, so text spans its neighbours. Unset = default. */
    private effectId(inst: Instance): string {
        return inst.settings.background === "" ? BLANK_EFFECT_ID : inst.settings.background || DEFAULT_EFFECT_ID;
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
        const geometry = { width: run.ids.length * STRIP_W, offset: run.index * STRIP_W };
        const offset = Number(lead?.lyricsOffset ?? LYRICS_LEAD_S);
        let text = lead ? this.overlay.render(run.ids[0], geometry, lead.text!, offset, maConnection.resolvePlayerId(lead.playerId)) : "";
        text += this.topOverlay(id, run.ids[0], geometry, offset, lead);
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
