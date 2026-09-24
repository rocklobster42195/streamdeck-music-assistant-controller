import { action } from "@elgato/streamdeck";
import { maConnection } from "../ma/connection";
import { ACCENT, ICONS, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

export type VolumeCommand = "up" | "down" | "mute" | "preset";

type VolumeKeySettings = MaKeySettings & {
    command?: VolumeCommand;
    /** Percent per press for up/down. */
    step?: number;
    /** Target volume for "preset". */
    preset?: number;
};

const MUTED = "#ff8a8a";

/** Volume up/down/mute/preset as keys. Shows the current volume; reacts instantly, then syncs. */
@action({ UUID: "de.boriskemper.music-assistant-controller.volume-key" })
export class VolumeKey extends MaKeyAction<VolumeKeySettings> {
    protected override renderPlayer({ player, settings }: PlayerContext<VolumeKeySettings>): KeyRender {
        const volume = Math.round(player.volume_level ?? 0);
        const muted = !!player.volume_muted;
        const badge = muted ? undefined : String(volume);
        switch (settings.command ?? "up") {
            case "up":
                return { image: renderKeyImage({ icon: ICONS.volumeUp, badge, dimmed: muted }) };
            case "down":
                return { image: renderKeyImage({ icon: ICONS.volumeDown, badge, dimmed: muted }) };
            case "mute":
                return muted
                    ? { image: renderKeyImage({ icon: ICONS.volumeOff, color: MUTED, active: MUTED }) }
                    : { image: renderKeyImage({ icon: volumeIcon(volume), badge }) };
            case "preset": {
                const preset = presetOf(settings);
                const on = !muted && volume === preset;
                return { image: renderKeyImage({ icon: volumeIcon(preset), badge: `${preset}`, color: on ? ACCENT : undefined, active: on ? ACCENT : undefined }) };
            }
        }
    }

    protected override async press({ ma, player, settings }: PlayerContext<VolumeKeySettings>): Promise<void> {
        const id = player.player_id;
        const volume = player.volume_level ?? 0;
        const step = Math.max(1, Math.min(25, settings.step ?? 5));
        let patch: { volume_level?: number; volume_muted?: boolean };
        let send: () => Promise<unknown>;
        switch (settings.command ?? "up") {
            case "up":
            case "down": {
                const next = clamp(volume + (settings.command === "down" ? -step : step));
                patch = { volume_level: next };
                send = () => ma.setVolume(id, next);
                break;
            }
            case "mute":
                patch = { volume_muted: !player.volume_muted };
                send = () => ma.setMute(id, !player.volume_muted);
                break;
            case "preset": {
                const preset = presetOf(settings);
                patch = { volume_level: preset, volume_muted: false };
                send = async () => {
                    if (player.volume_muted) await ma.setMute(id, false);
                    await ma.setVolume(id, preset);
                };
                break;
            }
        }
        maConnection.patchPlayer(id, patch);
        try {
            await send();
        } catch (e) {
            maConnection.unpatch(id);
            throw e;
        }
    }
}

function clamp(v: number): number {
    return Math.round(Math.min(100, Math.max(0, v)));
}

function presetOf(settings: VolumeKeySettings): number {
    return clamp(settings.preset ?? 20);
}

export function volumeIcon(volume: number): string {
    if (volume <= 0) return ICONS.volumeOff;
    if (volume < 34) return ICONS.volumeLow;
    if (volume < 67) return ICONS.volumeMedium;
    return ICONS.volumeHigh;
}
