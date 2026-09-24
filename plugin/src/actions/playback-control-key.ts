import { action } from "@elgato/streamdeck";
import type { PlayerQueue, RepeatMode } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { ACCENT, ICONS, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

export type PlaybackCommand = "next" | "previous" | "shuffle" | "repeat" | "crossfade" | "dont_stop";

type PlaybackControlSettings = MaKeySettings & { command?: PlaybackCommand };

const REPEAT_CYCLE: Record<string, RepeatMode> = { off: "all", all: "one", one: "off" };

/**
 * One key per playback command. Skip keys dim while a live radio stream plays (nothing to skip);
 * toggles show their state (tinted when on) and flip immediately when pressed.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.playback-control-key" })
export class PlaybackControlKey extends MaKeyAction<PlaybackControlSettings> {
    protected override renderPlayer({ player, queue, settings }: PlayerContext<PlaybackControlSettings>): KeyRender {
        const isRadio = player.current_media?.media_type === "radio";
        const command = settings.command ?? "next";
        switch (command) {
            case "next":
            case "previous":
                return { image: renderKeyImage({ icon: command === "next" ? ICONS.next : ICONS.previous, dimmed: isRadio || !queue }) };
            case "shuffle": {
                const on = !!queue?.shuffle_enabled;
                return { image: renderKeyImage({ icon: on ? ICONS.shuffle : ICONS.shuffleOff, color: on ? ACCENT : undefined, active: on ? ACCENT : undefined, dimmed: !on && isRadio }) };
            }
            case "repeat": {
                const mode = queue?.repeat_mode ?? "off";
                const on = mode !== "off";
                const icon = mode === "one" ? ICONS.repeatOne : mode === "all" ? ICONS.repeat : ICONS.repeatOff;
                return { image: renderKeyImage({ icon, color: on ? ACCENT : undefined, active: on ? ACCENT : undefined, dimmed: !on && isRadio }) };
            }
            case "crossfade": {
                const on = !!queue?.crossfade_enabled;
                return { image: renderKeyImage({ icon: ICONS.crossfade, color: on ? ACCENT : "#8a8a90", active: on ? ACCENT : undefined }) };
            }
            case "dont_stop": {
                const on = !!queue?.autoplay_enabled;
                return { image: renderKeyImage({ icon: ICONS.dontStop, color: on ? ACCENT : "#8a8a90", active: on ? ACCENT : undefined }) };
            }
        }
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
