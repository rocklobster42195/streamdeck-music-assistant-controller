import { action } from "@elgato/streamdeck";
import { PlaybackControlKeyAction } from "@rocklobster42195/streamdeck-kit/keys";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { macPlayers } from "../bus/mac-players";
import { maConnection } from "../ma/connection";
import { panoramaRows } from "../render/panorama";
import { notReadyRender } from "./ma-key-action";
import { migratePlayback, type PlaybackSettings as Settings } from "./play-pause-migrate";

/**
 * The universal Playback Control key (the kit's): next, previous, shuffle, repeat, crossfade and
 * "Don't stop the music" for any player on the deck; crossfade and Don't stop where MA plays.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.playback-control-key" })
export class PlaybackControlKey extends PlaybackControlKeyAction<Settings> {
    constructor() {
        super({
            board: macPlayers,
            markerPath: (name) => mdiPath(name),
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
            migrate: migratePlayback,
            unavailable: () => (maConnection.ma?.isConnected ? undefined : notReadyRender()[0]),
        });
        maConnection.onChange(() => this.refresh());
    }
}
