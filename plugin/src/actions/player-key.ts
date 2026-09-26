import { action } from "@elgato/streamdeck";
import { maConnection } from "../ma/connection";
import { transferSource, transferTo } from "../ma/transfer";
import { ACCENT, ICONS, OFF, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type PlayerKeySettings = MaKeySettings & {
    /** Bring what's playing on the previous active player along (default on). */
    transfer?: boolean;
    showCover?: boolean;
};

const STATE_COLORS: Record<string, string> = { playing: "#4cc38a", paused: "#f0b429", idle: "#6b6b72", offline: "#ff6b6b" };

/**
 * One key per room. Press: this player becomes the active player (all "Active player" keys follow);
 * with "Bring music along", playback moves here from the previous active player — music follows you.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.player-key" })
export class PlayerKey extends MaKeyAction<PlayerKeySettings> {
    protected override readonly followsActivePlayer = false;

    protected override renderPlayer({ id, ma, player, queue, playerName, settings }: PlayerContext<PlayerKeySettings>): KeyRender {
        const active = maConnection.globalSettings.activePlayerId === player.player_id;
        const state = !player.available ? "offline" : (queue?.state ?? player.playback_state) === "playing" ? "playing" : queue?.state === "paused" ? "paused" : "idle";
        const cover = settings.showCover !== false && state === "playing" ? this.cover(id, ma, player.current_media) : undefined;
        return {
            image: renderKeyImage({
                cover,
                icon: cover ? undefined : ICONS.speaker,
                color: active ? ACCENT : OFF,
                dimmed: !player.available,
                active: active ? ACCENT : undefined,
                statusDot: STATE_COLORS[state],
            }),
            title: playerName,
        };
    }

    protected override async press({ player, settings }: PlayerContext<PlayerKeySettings>): Promise<"ok"> {
        const previous = maConnection.globalSettings.activePlayerId;
        if (settings.transfer !== false && previous !== player.player_id) {
            const source = transferSource(player.player_id, previous);
            if (source) await transferTo(player.player_id, source);
        }
        await maConnection.setActivePlayer(player.player_id);
        return "ok";
    }
}
