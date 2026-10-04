import streamDeck, { action, type KeyDownEvent, type KeyUpEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { DEFAULT_SEEK_STEP, SeekStepper } from "@rocklobster42195/streamdeck-kit";
import { mdiFastForward, mdiRewind } from "@mdi/js";
import type { PlayerQueue, RepeatMode } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { ACCENT, ICONS, OFF, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

export type PlaybackCommand = "next" | "previous" | "shuffle" | "repeat" | "crossfade" | "dont_stop";

type PlaybackControlSettings = MaKeySettings & {
    command?: PlaybackCommand;
    /** Seek mode (Next/Previous held): seconds per tap (default 10; the PI stores it as text). */
    seekStep?: number | string;
};

/** How long Next/Previous must be held to switch to seek mode. */
const LONG_PRESS_MS = 500;

const REPEAT_CYCLE: Record<string, RepeatMode> = { off: "all", all: "one", one: "off" };

/**
 * One key per playback command. Skip keys dim while a live radio stream plays (nothing to skip);
 * toggles show their state (tinted when on) and flip immediately when pressed.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.playback-control-key" })
export class PlaybackControlKey extends MaKeyAction<PlaybackControlSettings> {
    private readonly seekers = new Map<string, SeekStepper>();
    private readonly holdTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly tickers = new Map<string, ReturnType<typeof setInterval>>();
    /** Keys whose current press already switched seek mode on or off (their release does nothing more). */
    private readonly heldIntoSeek = new Set<string>();

    protected override renderPlayer({ id, player, queue, settings }: PlayerContext<PlaybackControlSettings>): KeyRender {
        const isRadio = player.current_media?.media_type === "radio";
        const command = settings.command ?? "next";
        const seeker = this.seekers.get(id);
        if (seeker?.active && (command === "next" || command === "previous")) {
            // Seek mode: ⏩/⏪ in the key colour, the waiting jump ("+0:30") or where the track is
            const offset = seeker.offset;
            const at = queue ? maConnection.elapsed(queue) : 0;
            return {
                image: renderKeyImage({ icon: command === "next" ? mdiFastForward : mdiRewind, color: ACCENT }),
                title: offset ? `${offset > 0 ? "+" : "−"}${clock(Math.abs(offset))}` : clock(at),
            };
        }
        switch (command) {
            case "next":
            case "previous":
                return { image: renderKeyImage({ icon: command === "next" ? ICONS.next : ICONS.previous, dimmed: isRadio || !queue }) };
            case "shuffle": {
                const on = !!queue?.shuffle_enabled;
                return { image: renderKeyImage({ icon: on ? ICONS.shuffle : ICONS.shuffleOff, color: on ? ACCENT : OFF, active: on ? ACCENT : undefined, dimmed: !on && isRadio }) };
            }
            case "repeat": {
                const mode = queue?.repeat_mode ?? "off";
                const on = mode !== "off";
                const icon = mode === "one" ? ICONS.repeatOne : mode === "all" ? ICONS.repeat : ICONS.repeatOff;
                return { image: renderKeyImage({ icon, color: on ? ACCENT : OFF, active: on ? ACCENT : undefined, dimmed: !on && isRadio }) };
            }
            case "crossfade": {
                const on = !!queue?.crossfade_enabled;
                return { image: renderKeyImage({ icon: ICONS.crossfade, color: on ? ACCENT : OFF, active: on ? ACCENT : undefined }) };
            }
            case "dont_stop": {
                const on = !!queue?.autoplay_enabled;
                return { image: renderKeyImage({ icon: ICONS.dontStop, color: on ? ACCENT : OFF, active: on ? ACCENT : undefined }) };
            }
        }
    }

    // ---- seek mode (grill 2026-10-04): hold Next/Previous, then quick taps add up to one jump ----

    override async onKeyDown(ev: KeyDownEvent<PlaybackControlSettings>): Promise<void> {
        const command = ev.payload.settings.command ?? "next";
        if (command !== "next" && command !== "previous") return super.onKeyDown(ev);
        // Next/Previous act on release: a long press switches seek mode on (or off) instead
        const id = ev.action.id;
        this.heldIntoSeek.delete(id);
        clearTimeout(this.holdTimers.get(id));
        this.holdTimers.set(id, setTimeout(() => {
            this.holdTimers.delete(id);
            this.heldIntoSeek.add(id);
            const seeker = this.seekerFor(id);
            if (seeker.active) seeker.exit();
            else if (!seeker.enter()) void ev.action.showAlert();
        }, LONG_PRESS_MS));
    }

    override async onKeyUp(ev: KeyUpEvent<PlaybackControlSettings>): Promise<void> {
        const command = ev.payload.settings.command ?? "next";
        if (command !== "next" && command !== "previous") return;
        const id = ev.action.id;
        const timer = this.holdTimers.get(id);
        clearTimeout(timer);
        this.holdTimers.delete(id);
        if (this.heldIntoSeek.delete(id) || !timer) return;
        const seeker = this.seekers.get(id);
        if (seeker?.active) {
            const n = Number(ev.payload.settings.seekStep);
            const step = n > 0 ? n : DEFAULT_SEEK_STEP;
            seeker.tap(command === "next" ? step : -step);
            return;
        }
        // A short press: the usual Next/Previous
        await super.onKeyDown(ev as unknown as KeyDownEvent<PlaybackControlSettings>);
    }

    override onWillDisappear(ev: WillDisappearEvent<PlaybackControlSettings>): void {
        const id = ev.action.id;
        clearTimeout(this.holdTimers.get(id));
        this.holdTimers.delete(id);
        clearInterval(this.tickers.get(id));
        this.tickers.delete(id);
        this.heldIntoSeek.delete(id);
        this.seekers.get(id)?.dispose();
        this.seekers.delete(id);
        super.onWillDisappear(ev);
    }

    private seekerFor(id: string): SeekStepper {
        let seeker = this.seekers.get(id);
        if (seeker) return seeker;
        const ctx = () => {
            const inst = this.instances.get(id);
            return inst ? this.playerContext(id, inst.settings) : undefined;
        };
        seeker = new SeekStepper({
            position: () => {
                const q = ctx()?.queue;
                return q ? maConnection.elapsed(q) : undefined;
            },
            duration: () => {
                const c = ctx();
                return c?.queue && c.player.current_media?.media_type !== "radio" ? c.player.current_media?.duration ?? undefined : undefined;
            },
            seek: (target) => {
                const c = ctx();
                if (!c?.queue) return;
                const q = c.queue.queue_id;
                // As the Track dial does: the new position at once, the server confirms
                maConnection.patchQueue(q, { elapsed_time: target, elapsed_time_last_updated: Date.now() / 1000 }, 2500);
                c.ma.seek(q, target).catch((e) => {
                    streamDeck.logger.warn(`[playback-control] seek to ${Math.round(target)} s failed`, e);
                    void this.instances.get(id)?.action.showAlert();
                });
            },
            onChange: () => {
                this.render(id);
                // While in seek mode, the shown position moves on with the track
                clearInterval(this.tickers.get(id));
                this.tickers.delete(id);
                if (this.seekers.get(id)?.active) this.tickers.set(id, setInterval(() => this.render(id), 1000));
            },
        });
        this.seekers.set(id, seeker);
        return seeker;
    }

    protected override async press({ ma, queue, player, settings }: PlayerContext<PlaybackControlSettings>): Promise<void> {
        if (!queue) throw new Error("player has no queue");
        const q = queue.queue_id;
        const command = settings.command ?? "next";
        if ((command === "next" || command === "previous") && player.current_media?.media_type === "radio") {
            throw new Error("nothing to skip on a live stream");
        }
        switch (command) {
            case "next":
                await ma.next(q);
                return;
            case "previous":
                await ma.previous(q);
                return;
            case "shuffle":
                return toggle(q, { shuffle_enabled: !queue.shuffle_enabled }, () => ma.setShuffle(q, !queue.shuffle_enabled));
            case "repeat": {
                const next = REPEAT_CYCLE[queue.repeat_mode] ?? "off";
                return toggle(q, { repeat_mode: next }, () => ma.setRepeat(q, next));
            }
            case "crossfade":
                return toggle(q, { crossfade_enabled: !queue.crossfade_enabled }, () => ma.setCrossfade(q, !queue.crossfade_enabled));
            case "dont_stop":
                return toggle(q, { autoplay_enabled: !queue.autoplay_enabled }, () => ma.setAutoplay(q, !queue.autoplay_enabled));
        }
    }
}

/** Show the new queue state right away, send the command, roll back if it fails. */
async function toggle(queueId: string, patch: Partial<PlayerQueue>, send: () => Promise<unknown>): Promise<void> {
    maConnection.patchQueue(queueId, patch);
    try {
        await send();
    } catch (e) {
        maConnection.unpatch(queueId);
        throw e;
    }
}

/** Seconds as "1:23" (or "1:02:03"). */
function clock(seconds: number): string {
    const t = Math.max(0, Math.round(seconds));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = String(t % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
