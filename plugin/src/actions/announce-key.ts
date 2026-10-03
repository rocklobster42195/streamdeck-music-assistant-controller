import { randomUUID } from "node:crypto";
import streamDeck, { action, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { mdiBullhorn } from "@mdi/js";
import { alarmTimers } from "@rocklobster42195/streamdeck-kit";
import { maConnection } from "../ma/connection";
import { groupLeader, groupMembers } from "../ma/groups";
import { ACCENT, OFF, renderKeyImage } from "../render/key-image";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type AnnounceSettings = MaKeySettings & {
    message?: string;
    ttsEngine?: string;
    /** "player" = the chosen/active player, "group" = it and every player grouped with it, "all" = every available player. */
    target?: "player" | "group" | "all";
    /** 0 = keep each player's volume. */
    volume?: number;
    /** Chime before the message (default on). */
    preAnnounce?: boolean;
    /** Speak at once (default) or after a countdown. */
    when?: "now" | "timer";
    /** Countdown length for "timer". */
    minutes?: number;
    /** MDI icon name for the key (e.g. "mdiPasta"); default: a bullhorn. */
    icon?: string;
    /** While a countdown runs: when it ends (ms since epoch), saved so a restart keeps it. */
    timerEnd?: number;
    /** While a countdown runs: its id in the plugin-wide alarm timers (see ma/alarm-timers). */
    timerId?: string;
};

/** After an announcement the key lights up in its "on" look for a moment (instead of Stream Deck's green tick). */
const DONE_FLASH_MS = 1500;

/**
 * Speaks a text on one or all players — "Dinner is ready!" — via a TTS engine from Home Assistant/MA.
 * With "timer" a press starts a countdown (ring and time on the key) and the message comes when it
 * ends ("The pasta is ready!"); pressing again cancels it. The countdown runs plugin-wide, so it
 * still goes off while the key is on another page or profile, or just being moved.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.announce-key" })
export class AnnounceKey extends MaKeyAction<AnnounceSettings> {
    private readonly tickers = new Map<string, ReturnType<typeof setInterval>>();
    private readonly doneUntil = new Map<string, number>();
    /** Last known settings per running timer, to announce while its key isn't on screen. */
    private readonly timerSettings = new Map<string, AnnounceSettings>();

    constructor() {
        super();
        // A timer went off (possibly while its key was hidden): the key shows its resting look again
        alarmTimers.onFinished((timerId) => {
            this.timerSettings.delete(timerId);
            const id = this.instanceWithTimer(timerId);
            if (!id) return;
            this.save(id, { timerEnd: undefined, timerId: undefined });
            this.render(id);
        });
    }

    protected override renderPlayer({ id, settings }: PlayerContext<AnnounceSettings>): KeyRender {
        const ready = !!settings.message?.trim();
        const icon = mdiPath(settings.icon) ?? mdiBullhorn;
        if (!ready) return { image: renderKeyImage({ icon, color: OFF }), title: this.t("key.announce_setup") };
        if ((this.doneUntil.get(id) ?? 0) > Date.now()) return { image: renderKeyImage({ icon, color: ACCENT, active: ACCENT }) };

        if (settings.when === "timer") {
            const total = minutesOf(settings) * 60_000;
            const left = settings.timerEnd ? settings.timerEnd - Date.now() : 0;
            if (left > 0) {
                this.tick(id);
                return { image: renderKeyImage({ ring: { value: left / total, color: ACCENT, center: { text: clock(left), color: "#ffffff", size: left >= 3_600_000 ? 30 : left >= 600_000 ? 32 : 36 } } }) };
            }
            // At rest like every key: light grey, or the cover color with that option
            return { image: renderKeyImage({ icon, badge: `${minutesOf(settings)} min` }) };
        }
        return { image: renderKeyImage({ icon }) };
    }

    protected override async press(ctx: PlayerContext<AnnounceSettings>): Promise<void> {
        const { id, settings } = ctx;
        if (!settings.message?.trim()) throw new Error("no message");
        if (settings.when !== "timer") return this.announce(ctx);

        // Timer: start it, or cancel the running one
        const running = !!settings.timerEnd && settings.timerEnd > Date.now();
        if (settings.timerId) {
            alarmTimers.cancel(settings.timerId);
            this.timerSettings.delete(settings.timerId);
        }
        if (running) {
            this.save(id, { timerEnd: undefined, timerId: undefined });
        } else {
            const timerId = randomUUID();
            this.save(id, { timerEnd: Date.now() + minutesOf(settings) * 60_000, timerId });
            this.startTimer(timerId, this.instances.get(id)!.settings);
        }
        this.render(id);
    }

    override onWillAppear(ev: WillAppearEvent<AnnounceSettings>): void {
        super.onWillAppear(ev);
        this.attach(ev.action.id);
    }

    /**
     * A key with a countdown (re)appeared: after a page switch or a move its timer is still running
     * here; after a plugin restart it starts again from the saved end. A copied key carries the same
     * timer id, and only the first one keeps the timer.
     */
    private attach(id: string): void {
        const settings = this.instances.get(id)?.settings;
        if (!settings?.timerEnd) return;
        const { timerId } = settings;
        const copy = !!timerId && [...this.instances].some(([other, inst]) => other !== id && inst.settings.timerId === timerId);
        if (!timerId || copy || alarmTimers.hasFinished(timerId) || settings.when !== "timer") {
            this.save(id, { timerEnd: undefined, timerId: undefined });
            this.render(id);
            return;
        }
        this.timerSettings.set(timerId, settings);
        if (!alarmTimers.isRunning(timerId)) this.startTimer(timerId, settings);
    }

    private startTimer(timerId: string, settings: AnnounceSettings): void {
        this.timerSettings.set(timerId, settings);
        alarmTimers.start(timerId, settings.timerEnd!, async () => {
            // The key's current settings when it's on screen, else the last known ones
            const id = this.instanceWithTimer(timerId);
            const current = (id && this.instances.get(id)?.settings) || this.timerSettings.get(timerId);
            const ctx = current && this.playerContext(id ?? timerId, current);
            if (!ctx) return false; // not connected yet: try again
            // Once the announcement went out the timer is done, also when an error comes back:
            // retrying a sent one repeated it (hardware 2026-10-02, three times a minute apart)
            try {
                await this.announce(ctx);
            } catch (e) {
                streamDeck.logger.warn("[announce] timer announcement failed", e);
            }
            return true;
        });
    }

    private instanceWithTimer(timerId: string): string | undefined {
        for (const [id, inst] of this.instances) if (inst.settings.timerId === timerId) return id;
        return undefined;
    }

    /** "All players" needs no particular player: any available one serves as the key's context. */
    protected override playerContext(id: string, settings: AnnounceSettings): PlayerContext<AnnounceSettings> | undefined {
        const ctx = super.playerContext(id, settings);
        if (ctx || settings.target !== "all") return ctx;
        const ma = maConnection.ma;
        const player = maConnection.selectablePlayers().find((p) => p.available);
        if (!ma?.isConnected || !player) return undefined;
        return { id, settings, ma, player, queue: maConnection.queueFor(player), playerName: player.display_name ?? player.name };
    }

    override onWillDisappear(ev: WillDisappearEvent<AnnounceSettings>): void {
        this.stopTick(ev.action.id);
        super.onWillDisappear(ev);
    }

    private async announce({ id, ma, player, settings }: PlayerContext<AnnounceSettings>): Promise<void> {
        const message = settings.message!.trim();
        const targets =
            settings.target === "all"
                ? maConnection.selectablePlayers().filter((p) => p.available)
                : settings.target === "group"
                  ? groupMembers(groupLeader(player)).filter((p) => p.available)
                  : [player];
        const volume = settings.volume && settings.volume > 0 ? settings.volume : undefined;
        // MA answers only once the announcement has played (chime, speech, music back) — far longer
        // than the client's default 10 s, so wait for it instead of reporting a false failure
        await Promise.all(
            targets.map((p) =>
                ma.send(
                    "players/cmd/play_announcement",
                    {
                        player_id: p.player_id,
                        message,
                        ...(settings.ttsEngine ? { tts_engine: settings.ttsEngine } : {}),
                        ...(volume !== undefined ? { volume_level: Math.round(volume) } : {}),
                        pre_announce: settings.preAnnounce !== false,
                    },
                    { timeoutMs: ANNOUNCE_TIMEOUT_MS },
                ),
            ),
        );
        this.doneUntil.set(id, Date.now() + DONE_FLASH_MS);
        this.render(id);
        setTimeout(() => this.render(id), DONE_FLASH_MS + 50);
    }

    /** Once a second while a countdown runs on screen: redraw (going off is up to alarmTimers). */
    private tick(id: string): void {
        if (this.tickers.has(id)) return;
        this.tickers.set(
            id,
            setInterval(() => {
                const end = this.instances.get(id)?.settings.timerEnd;
                if (!end || end <= Date.now()) this.stopTick(id);
                this.render(id);
            }, 1000),
        );
    }

    private stopTick(id: string): void {
        clearInterval(this.tickers.get(id));
        this.tickers.delete(id);
    }

    private save(id: string, patch: Partial<AnnounceSettings>): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        const next = { ...inst.settings, ...patch } as AnnounceSettings;
        for (const key of Object.keys(patch) as (keyof AnnounceSettings)[]) if (patch[key] === undefined) delete next[key];
        inst.settings = next;
        inst.lastRender = undefined;
        void inst.action.setSettings(next);
    }
}

/** How long MA may take to play an announcement before we give up waiting for its answer. */
const ANNOUNCE_TIMEOUT_MS = 180_000;

function minutesOf(s: AnnounceSettings): number {
    return Math.min(180, Math.max(1, Math.round(s.minutes ?? 10)));
}

/** 8:42 — or, from an hour on, hours and minutes without seconds: "1:59 h". */
function clock(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    if (h) return `${h}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")} h`;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
