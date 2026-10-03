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
import { BLANK_EFFECT_ID, rowStateFromSettings, STRIP_W, stripImage } from "@rocklobster42195/streamdeck-kit";
import { watchLevel } from "../bus/audio-level";
import { maConnection } from "../ma/connection";
import { piBridge } from "@rocklobster42195/streamdeck-kit/bridge";
import { isFresh, migrateCoverColor, panorama, panoramaRows } from "../render/panorama";
import { functionIcon } from "../render/function-icons";
import { functionOverlay, noticeOverlay, timingOverlay } from "../render/panorama-text";
import { PanoramaOverlay, type OverlayMode } from "./panorama-overlay";

type PanoramaDialSettings = JsonObject & {
        /** Text over the effect (shared by neighbouring Panorama dials). */
        text?: OverlayMode;
        /** Seconds added to the playback position for lyrics (speaker latency). */
        lyricsOffset?: number;
        /** Player whose music tints the effect and fills the text; "" = active player. */
        playerId?: string;
        /** deckbus level stream the effect moves with ("<peer id>|<topic>"); unset/"" = none. */
        audioSource?: string;
        /** Its name, shown in the PI while the source isn't on the bus. */
        audioSourceName?: string;
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
/** Turning an effect value: ticks are batched and sent to the row this often. */
const TUNE_MS = 100;


/**
 * An ambient effect across neighbouring dials (particles, matrix rain, boing ball, boing globe) —
 * the sonos-controller panorama effects; the effect is the row's (the kit's panorama/rows.ts).
 * Rotate/push/touch are handed to the effect; values it changes itself (e.g. speed) become the
 * row's. Tinted with the active player's cover color when on.
 * Optionally shows title & artist or synced lyrics across neighbouring Panorama dials.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.panorama-dial" })
export class PanoramaDial extends SingletonAction<PanoramaDialSettings> {
    private readonly instances = new Map<string, Instance>();
    private readonly persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly tuneTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly pendingTicks = new Map<string, { key: string; ticks: number }>();
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
    /** Per dial: the audio source it follows while visible. */
    private readonly audio = new Map<string, { source: string; stop: () => void }>();


    override onWillAppear(ev: WillAppearEvent<PanoramaDialSettings>): void {
        if (!ev.action.isDial()) return;
        const column = "coordinates" in ev.payload && ev.payload.coordinates ? ev.payload.coordinates.column : 0;
        this.instances.set(ev.action.id, { action: ev.action, settings: ev.payload.settings, deviceId: ev.action.device.id, column });
        const id = ev.action.id;
        const migrated = migrateCoverColor(ev.payload.settings, ev.action.device.id, true);
        if (migrated) {
            this.instances.get(id)!.settings = migrated;
            void ev.action.setSettings(migrated);
        }
        // A freshly placed Panorama dial next to another one takes over its text line (title or
        // lyrics, timing, player) and audio source; the effect and its colour are the row's anyway
        const neighbour = isFresh(ev.payload.settings) ? this.neighbour(id) : undefined;
        if (neighbour) {
            const inst = this.instances.get(id)!;
            const pick = <K extends keyof PanoramaDialSettings>(k: K) => (neighbour[k] !== undefined ? { [k]: neighbour[k] } : {});
            inst.settings = { ...inst.settings, ...pick("text"), ...pick("lyricsOffset"), ...pick("playerId"), ...pick("audioSource"), ...pick("audioSourceName") };
            void inst.action.setSettings(inst.settings);
        }
        panoramaRows.add(id, {
            device: ev.action.device.id,
            column,
            label: () => streamDeck.i18n.t("key.panorama_label"),
            state: () => rowStateFromSettings(this.instances.get(id)?.settings ?? {}),
            save: (patch) => {
                const inst = this.instances.get(id);
                if (!inst) return;
                inst.settings = { ...inst.settings, ...patch } as PanoramaDialSettings;
                void inst.action.setSettings(inst.settings);
            },
            redraw: () => this.render(id),
            // Without an effect the dial stays in a blank group, so title and lyrics span its neighbours
            whenNone: BLANK_EFFECT_ID,
        });
        this.followAudio(id);
    }

    /** The settings of a Panorama dial right next to this one (left first). */
    private neighbour(id: string): PanoramaDialSettings | undefined {
        const me = this.instances.get(id);
        if (!me) return undefined;
        for (const side of [-1, 1]) {
            for (const [other, inst] of this.instances) if (other !== id && inst.deviceId === me.deviceId && inst.column === me.column + side) return inst.settings;
        }
        return undefined;
    }

    override onWillDisappear(ev: WillDisappearEvent<PanoramaDialSettings>): void {
        this.audio.get(ev.action.id)?.stop();
        this.audio.delete(ev.action.id);
        this.instances.delete(ev.action.id);
        this.overlay.forget(ev.action.id);
        panoramaRows.remove(ev.action.id);
        piBridge.forget(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<PanoramaDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        const before = inst.settings;
        inst.settings = ev.payload.settings;
        if (before.text !== inst.settings.text || before.lyricsOffset !== inst.settings.lyricsOffset || before.playerId !== inst.settings.playerId) this.shareText(ev.action.id);
        panoramaRows.changed(ev.action.id);
        this.followAudio(ev.action.id);
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
        // An effect value turns through the row (the kit's PanoramaRows.tune), so it works also while
        // another plugin's dial runs the effect and this one follows; ticks go out every TUNE_MS
        const field = this.tunable(ev.action.id, current);
        if (!field) return;
        const pending = this.pendingTicks.get(ev.action.id) ?? { key: field.key, ticks: 0 };
        pending.ticks += ev.payload.ticks;
        this.pendingTicks.set(ev.action.id, pending);
        if (!this.tuneTimers.has(ev.action.id)) {
            this.tuneTimers.set(ev.action.id, setTimeout(() => {
                this.tuneTimers.delete(ev.action.id);
                const p = this.pendingTicks.get(ev.action.id);
                this.pendingTicks.delete(ev.action.id);
                if (p?.ticks) panoramaRows.tune(ev.action.id, p.key, p.ticks);
                this.render(ev.action.id);
            }, TUNE_MS));
        }
        this.show(run.ids[0], this.fnShownUntil, FUNCTION_SHOW_MS);
    }

    /** The row's effect value behind a function id (its control id, e.g. "count", or its key). */
    private tunable(id: string, fn: string | undefined) {
        return fn ? panoramaRows.tunables(id).find((f) => (f.control ?? f.key) === fn) : undefined;
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
            this.timingUntil.delete(key);
            this.show(key, this.fnShownUntil, FUNCTION_SHOW_MS);
            return;
        }
        panorama.press(ev.action.id);
        this.persistRuntime(ev.action.id);
    }

    /** Let the effect move with the chosen audio source (subscribed only while the dial is visible). */
    private followAudio(id: string): void {
        const source = this.instances.get(id)?.settings.audioSource || "";
        const current = this.audio.get(id);
        if (current?.source === source) return;
        current?.stop();
        this.audio.delete(id);
        if (source) this.audio.set(id, { source, stop: watchLevel(source, (level) => panorama.setLevel(id, level)) });
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
        return [...(lead?.text === "lyrics" ? ["timing"] : []), ...panoramaRows.tunables(id).map((f) => f.control ?? f.key)];
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
            const f = fn === "timing" ? undefined : this.tunable(id, fn);
            const level = f ? ((f.value - f.min) / Math.max(1e-9, f.max - f.min)) * 100 : undefined;
            return functionOverlay(geometry, functionIcon(fn), streamDeck.i18n.t(`key.fn_${fn}`), level, fade(fnUntil));
        }
        const n = this.notice.get(runKey);
        if (n && n.until > now) return noticeOverlay(geometry, n.text, Math.min(1, (n.until - now) / OVERLAY_FADE_MS));
        return "";
    }

    /** The chosen player, or the active one. */
    private playerId(inst: Instance): string | undefined {
        return maConnection.resolvePlayerId(inst.settings.playerId);
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
        const image = stripImage([text], "#000", panoramaRows.isMember(id) ? panorama.renderSlice(id) : "");
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
     * The Panorama dials right next to this one on the same device, left to right, that share one
     * text line (any other dial in between breaks the run). Not from the effect group: while
     * another plugin leads the row's effect, MA-C has no local group, and the title still has to
     * span its own dials (hardware 2026-10-03).
     */
    private run(id: string): { ids: string[]; index: number } {
        const me = this.instances.get(id);
        if (!me) return { ids: [id], index: 0 };
        const byColumn = new Map<number, string>();
        for (const [other, inst] of this.instances) if (inst.deviceId === me.deviceId) byColumn.set(inst.column, other);
        let first = me.column;
        while (byColumn.has(first - 1)) first--;
        let last = me.column;
        while (byColumn.has(last + 1)) last++;
        const ids: string[] = [];
        for (let c = first; c <= last; c++) ids.push(byColumn.get(c)!);
        return { ids, index: me.column - first };
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

    /** Values the effect changed itself (e.g. speed after turning) become the row's, debounced. */
    private persistRuntime(id: string): void {
        clearTimeout(this.persistTimers.get(id));
        this.persistTimers.set(
            id,
            setTimeout(() => {
                const inst = this.instances.get(id);
                const runtime = panorama.runtimeSettings(id);
                // Turning tunes the row's effect: stored with every dial of the row, in every plugin
                if (inst && runtime) panoramaRows.setRow(inst.deviceId, { settings: runtime });
            }, 800),
        );
    }
}
