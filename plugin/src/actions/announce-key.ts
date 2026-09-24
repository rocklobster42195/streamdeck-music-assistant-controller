import { action } from "@elgato/streamdeck";
import { mdiBullhorn } from "@mdi/js";
import { maConnection } from "../ma/connection";
import { renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type AnnounceSettings = MaKeySettings & {
    message?: string;
    ttsEngine?: string;
    /** "player" = the chosen/active player, "all" = every available player. */
    target?: "player" | "all";
    /** 0 = keep each player's volume. */
    volume?: number;
    /** Chime before the message (default on). */
    preAnnounce?: boolean;
};

/** Speaks a text on one or all players — "Dinner is ready!" — via a TTS engine from Home Assistant/MA. */
@action({ UUID: "de.boriskemper.music-assistant-controller.announce-key" })
export class AnnounceKey extends MaKeyAction<AnnounceSettings> {
    protected override renderPlayer({ settings }: PlayerContext<AnnounceSettings>): KeyRender {
        const ready = !!settings.message?.trim();
        return { image: renderKeyImage({ icon: mdiBullhorn, color: ready ? "#f0b429" : "#6c6c72" }), title: ready ? "" : this.t("key.announce_setup") };
    }

    protected override async press({ ma, player, settings }: PlayerContext<AnnounceSettings>): Promise<"ok"> {
        const message = settings.message?.trim();
        if (!message) throw new Error("no message");
        const targets = settings.target === "all" ? maConnection.selectablePlayers().filter((p) => p.available) : [player];
        const volume = settings.volume && settings.volume > 0 ? settings.volume : undefined;
        await Promise.all(
            targets.map((p) =>
                ma.playAnnouncement(p.player_id, { message, ttsEngine: settings.ttsEngine || undefined, volume, preAnnounce: settings.preAnnounce !== false }),
            ),
        );
        return "ok";
    }
}
