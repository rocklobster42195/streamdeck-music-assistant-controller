import { action } from "@elgato/streamdeck";
import { mdiSleep } from "@mdi/js";
import type { MusicAssistantClient } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { sleepFader } from "../ma/sleep-fade";
import { formatRemaining, parseSteps } from "../ma/sleep-steps";
import { ACCENT, OFF, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type SleepTimerSettings = MaKeySettings & {
    /** Minutes to step through, e.g. "15,30,60,90". */
    steps?: string;
    /** Seconds to fade out before the timer stops playback; 0 = no fade. */
    fadeOut?: number | string;
};

const DEFAULT_FADE_S = 30;

/**
 * Sleep timer: each press steps to the next duration (15 → 30 → 60 → 90 → off, configurable).
 * While running, the key counts down the time left; at the end the group fades out, stops and
 * gets its volumes back (see sleep-fade).
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.sleep-timer-key" })
export class SleepTimerKey extends MaKeyAction<SleepTimerSettings> {
    constructor() {
        super();
        // Count down (and start fades) without waiting for server events; unchanged images aren't re-sent
        setInterval(() => this.tick(), 1000);
    }

    private tick(): void {
        for (const [id, inst] of this.instances) {
            const ctx = this.playerContext(id, inst.settings);
            if (ctx) sleepFader.update(ctx.ma, ctx.player, fadeSeconds(inst.settings));
        }
        if (this.instances.size) this.renderAll();
    }

    protected override renderPlayer({ ma, player }: PlayerContext<SleepTimerSettings>): KeyRender {
        const left = remainingSeconds(ma, player.sleep_timer_expires_at);
        if (left <= 0) return { image: renderKeyImage({ icon: mdiSleep, color: OFF }) };
        return { image: renderKeyImage({ icon: mdiSleep, color: ACCENT, active: ACCENT, badge: formatRemaining(left) }) };
    }

    protected override async press({ ma, player, settings }: PlayerContext<SleepTimerSettings>): Promise<void> {
        const steps = parseSteps(settings.steps);
        const leftMinutes = Math.ceil(remainingSeconds(ma, player.sleep_timer_expires_at) / 60);
        // Next step above what is left (+1 min tolerance); past the last step → off
        const next = leftMinutes > 0 ? steps.find((s) => s > leftMinutes + 1) : steps[0];
        const id = player.player_id;
        if (next === undefined) {
            maConnection.patchPlayer(id, { sleep_timer_expires_at: null });
            await ma.clearSleepTimer(id);
            return;
        }
        maConnection.patchPlayer(id, { sleep_timer_expires_at: ma.serverNow() + next * 60 });
        await ma.setSleepTimer(id, next * 60);
    }
}

function fadeSeconds(settings: SleepTimerSettings): number {
    const s = Number(settings.fadeOut ?? DEFAULT_FADE_S);
    return Number.isFinite(s) ? Math.max(0, Math.min(300, s)) : DEFAULT_FADE_S;
}

/** The timer's expiry is on the server's clock. */
function remainingSeconds(ma: MusicAssistantClient, expiresAt: number | null | undefined): number {
    return expiresAt ? expiresAt - ma.serverNow() : 0;
}
