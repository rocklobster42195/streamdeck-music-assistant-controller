import { action } from "@elgato/streamdeck";
import { mdiAudioInputRca, mdiBluetooth, mdiLogin, mdiPlaylistMusic, mdiTelevision } from "@mdi/js";
import { ACCENT, OFF, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type SourceSettings = MaKeySettings & {
    source?: string;
    sourceName?: string;
};

/** Switch a player to an input (Line-in, TV, Bluetooth, …) — lit while that source is active. */
@action({ UUID: "de.boriskemper.music-assistant-controller.source-key" })
export class SourceKey extends MaKeyAction<SourceSettings> {
    protected override renderPlayer({ player, settings }: PlayerContext<SourceSettings>): KeyRender {
        if (!settings.source) return { image: renderKeyImage({ icon: mdiLogin, dimmed: true }), title: this.t("key.choose_source") };
        const active = player.active_source === settings.source;
        return {
            image: renderKeyImage({ icon: sourceIcon(settings.source, settings.sourceName), color: active ? ACCENT : OFF, active: active ? ACCENT : undefined }),
            title: settings.sourceName ?? "",
        };
    }

    protected override async press({ ma, player, settings }: PlayerContext<SourceSettings>): Promise<"ok"> {
        if (!settings.source) throw new Error("no source chosen");
        await ma.selectSource(player.player_id, settings.source);
        return "ok";
    }
}

function sourceIcon(id: string, name = ""): string {
    const s = `${id} ${name}`.toLowerCase();
    if (/tv|hdmi|arc|television/.test(s)) return mdiTelevision;
    if (/bluetooth|bt\b/.test(s)) return mdiBluetooth;
    if (/line|aux|rca|analog/.test(s)) return mdiAudioInputRca;
    if (/queue|music assistant/.test(s)) return mdiPlaylistMusic;
    return mdiLogin;
}
