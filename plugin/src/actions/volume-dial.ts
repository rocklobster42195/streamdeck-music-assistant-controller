import streamDeck, { action, type DialAction } from "@elgato/streamdeck";
import { VolumeDialAction } from "@rocklobster42195/streamdeck-kit/keys";
import { rowStateFromSettings } from "@rocklobster42195/streamdeck-kit";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { macPlayers } from "../bus/mac-players";
import { maConnection } from "../ma/connection";
import { ACCENT } from "../render/key-image";
import { isFresh, migrateCoverColor, panorama, panoramaRows } from "../render/panorama";
import { notReadyStrip } from "./ma-dial-action";
import { migrateVolumeDial, type VolumeDialSettings } from "./play-pause-migrate";

/**
 * The universal Volume dial (the kit's, as the keys): rotate sets the volume of any player on the
 * deck, push mutes, a tap recalls the preset, a long tap saves it. The dial takes part in its row's
 * Panorama as before.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.volume-dial" })
export class VolumeDial extends VolumeDialAction<VolumeDialSettings> {
    /** The dials in their row's Panorama, with the settings it asks for. */
    private readonly inRows = new Map<string, VolumeDialSettings>();

    constructor() {
        super({
            board: macPlayers,
            // Two percent per tick, as the dial always did (a fast spin doubles it)
            defaultStep: 2,
            iconPath: (name) => mdiPath(name),
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
            accent: ACCENT,
            underlay: (id) => (panoramaRows.effectOf(id) && panoramaRows.isMember(id) && panorama.isActive(id) ? panorama.renderSlice(id) : undefined),
            mutedLabel: () => streamDeck.i18n.t("key.muted").toUpperCase(),
            noPlayerLabel: () => streamDeck.i18n.t("key.volume"),
            migrate: migrateVolumeDial,
            unavailable: () => (maConnection.ma?.isConnected && maConnection.loaded ? undefined : notReadyStrip(streamDeck.i18n.t).image),
            onShown: (a, s) => this.joinRow(a, s),
            onSettings: (a, s) => {
                this.inRows.set(a.id, s);
                panoramaRows.changed(a.id);
            },
            onHidden: (id) => {
                this.inRows.delete(id);
                panoramaRows.remove(id);
            },
        });
        maConnection.onChange(() => this.refresh());
    }

    /** Draw every dial again (the connection changed). */
    private refresh(): void {
        for (const id of this.ids()) this.redraw(id);
    }

    private joinRow(a: DialAction<VolumeDialSettings>, settings: VolumeDialSettings): void {
        const id = a.id;
        if (this.inRows.has(id)) {
            this.inRows.set(id, settings);
            panoramaRows.changed(id);
            return;
        }
        // A freshly placed dial takes part in its row's Panorama; old dials without a background
        // setting keep showing none (unset meant "no effect" before rows)
        let current = settings;
        if (isFresh(settings)) {
            current = { ...settings, panoramaMember: true };
            void a.setSettings(current);
        }
        const migrated = migrateCoverColor(current, a.device.id);
        if (migrated) {
            current = migrated;
            void a.setSettings(current);
        }
        this.inRows.set(id, current);
        panoramaRows.add(id, {
            device: a.device.id,
            column: a.coordinates?.column ?? 0,
            label: () => macPlayers.resolve(this.inRows.get(id)?.player)?.name ?? "",
            state: () => rowStateFromSettings(this.inRows.get(id) ?? {}, "silent"),
            save: (patch) => {
                const s = this.inRows.get(id);
                if (!s) return;
                const next = { ...s, ...patch } as VolumeDialSettings;
                this.inRows.set(id, next);
                void a.setSettings(next);
            },
            redraw: () => this.redraw(id),
        });
    }
}
