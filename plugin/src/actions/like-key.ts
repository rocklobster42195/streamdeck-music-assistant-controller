import { action } from "@elgato/streamdeck";
import { maConnection } from "../ma/connection";
import { favorites } from "../ma/favorites";
import { ICONS, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

const HEART = "#ff6b8b";

/**
 * "Like" = MA favorite (the MA UI shows favorites with a heart, too). The heart is filled when the
 * current item already is a favorite; pressing toggles it.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.like-key" })
export class LikeKey extends MaKeyAction<MaKeySettings> {
    protected override renderPlayer({ player }: PlayerContext<MaKeySettings>): KeyRender {
        const uri = player.current_media?.uri;
        if (!uri) return { image: renderKeyImage({ icon: ICONS.heartOutline, dimmed: true }) };
        const info = favorites.get(uri);
        return info?.favorite
            ? { image: renderKeyImage({ icon: ICONS.heart, color: HEART, active: HEART }) }
            : { image: renderKeyImage({ icon: ICONS.heartOutline, color: "#e0e0e0" }) };
    }

    protected override async press({ ma, player }: PlayerContext<MaKeySettings>): Promise<void> {
        const uri = player.current_media?.uri;
        if (!uri) throw new Error("nothing playing");
        const info = favorites.get(uri);
        if (info?.favorite && info.libraryItemId) {
            favorites.set(uri, { ...info, favorite: false });
            maConnection.notify();
            await ma.removeFavorite(info.mediaType, info.libraryItemId);
        } else {
            favorites.set(uri, { favorite: true, mediaType: info?.mediaType ?? player.current_media?.media_type ?? "track", libraryItemId: info?.libraryItemId });
            maConnection.notify();
            await ma.addCurrentlyPlayingToFavorites(player.player_id);
        }
    }
}
