import { action } from "@elgato/streamdeck";
import { mdiSleep } from "@mdi/js";
import { maConnection } from "../ma/connection";
import { parseSteps } from "../ma/sleep-steps";
import { ACCENT, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type SleepTimerSettings = MaKeySettings & {
    /** Minutes to step through, e.g. "15,30,60,90". */
    steps?: string;
};

/**
 * Sleep timer: each press steps to the next duration (15 → 30 → 60 → 90 → off, configurable).
 * While running, the key counts down the minutes left.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.sleep-timer-key" })
export class SleepTimerKey extends MaKeyAction<SleepTimerSettings> {
    constructor() {
        super();
        // Count down without waiting for server events (unchanged images aren't re-sent)
        setInterval(() => this.instances.size && this.renderAll(), 15_000);
    }

    protected override renderPlayer({ player }: PlayerContext<SleepTimerSettings>): KeyRender {
        const left = remainingSeconds(player.sleep_timer_expires_at);
        if (left <= 0) return { image: renderKeyImage({ icon: mdiSleep, color: "#8a8a90" }) };
        const minutes = Math.ceil(left / 60);
        return { image: renderKeyImage({ icon: mdiSleep, color: ACCENT, active: ACCENT, badge: minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` : `${minutes}′` }) };
    }

    protected override async press({ ma, player, settings }: PlayerContext<SleepTimerSettings>): Promise<void> {
        const steps = parseSteps(settings.steps);
        const leftMinutes = Math.ceil(remainingSeconds(player.sleep_timer_expires_at) / 60);
        // Next step above what is left (+1 min tolerance); past the last step → off
        const next = leftMinutes > 0 ? steps.find((s) => s > leftMinutes + 1) : steps[0];
        const id = player.player_id;
        if (next === undefined) {
            maConnection.patchPlayer(id, { sleep_timer_expires_at: null });
            await ma.clearSleepTimer(id);
            return;
        }
        maConnection.patchPlayer(id, { sleep_timer_expires_at: Date.now() / 1000 + next * 60 });
        await ma.setSleepTimer(id, next * 60);
    }
}

function remainingSeconds(expiresAt: number | null | undefined): number {
    return expiresAt ? expiresAt - Date.now() / 1000 : 0;
}
