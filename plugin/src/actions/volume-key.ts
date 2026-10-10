import { action } from "@elgato/streamdeck";
import { VolumeKeyAction } from "@rocklobster42195/streamdeck-kit/keys";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { macPlayers } from "../bus/mac-players";
import { maConnection } from "../ma/connection";
import { panoramaRows } from "../render/panorama";
import { notReadyRender } from "./ma-key-action";
import { migrateVolume, type VolumeSettings } from "./play-pause-migrate";

/** The universal Volume key (the kit's): louder, quieter, mute, a preset, for any player on the deck. */
@action({ UUID: "de.boriskemper.music-assistant-controller.volume-key" })
export class VolumeKey extends VolumeKeyAction<VolumeSettings> {
    constructor() {
        super({
            board: macPlayers,
            markerPath: (name) => mdiPath(name),
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
            migrate: migrateVolume,
            unavailable: () => (maConnection.ma?.isConnected ? undefined : notReadyRender()[0]),
        });
        maConnection.onChange(() => this.refresh());
    }
}
