import streamDeck, { action, type DialAction } from "@elgato/streamdeck";
import { TrackDialAction } from "@rocklobster42195/streamdeck-kit/keys";
import { getCachedCover, loadCover, rowStateFromSettings } from "@rocklobster42195/streamdeck-kit";
import { macPlayers } from "../bus/mac-players";
import { maConnection } from "../ma/connection";
import { providerBadge } from "../render/provider-badge";
import { isFresh, migrateCoverColor, panorama, panoramaRows } from "../render/panorama";
import { notReadyStrip } from "./ma-dial-action";
import { migrateTrackDial, type TrackDialSettings } from "./play-pause-migrate";

/**
 * The universal Track dial (the kit's, as the keys): cover, title, artist and progress of any
 * player on the deck. Rotate: seek · Push: next track · Touch: play/pause. The dial takes part in
 * its row's Panorama as before.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.track-dial" })
export class TrackDial extends TrackDialAction<TrackDialSettings> {
    /** The dials in their row's Panorama, with the settings it asks for. */
    private readonly inRows = new Map<string, TrackDialSettings>();

    constructor() {
        super({
            board: macPlayers,
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
            underlay: (id) => (panoramaRows.effectOf(id) && panoramaRows.isMember(id) && panorama.isActive(id) ? panorama.renderSlice(id) : undefined),
            // The music service's logo on the cover (the "Show the service" option)
            badge: (id, p) => {
                if (!this.inRows.get(id)?.showProvider || !p.sourceIcon) return undefined;
                const icon = p.sourceIcon.startsWith("data:") ? p.sourceIcon : getCachedCover(p.sourceIcon);
                if (!icon) {
                    void loadCover(p.sourceIcon).then((c) => c && this.redraw(id));
                    return undefined;
                }
                const left = this.inRows.get(id)?.coverSide !== "right";
                const cx = left ? 15 : 115;
                return providerBadge(cx, 15, 12, `<image href="${icon}" x="${cx - 8}" y="7" width="16" height="16"/>`);
            },
            nothingLabel: () => streamDeck.i18n.t("key.nothing_playing"),
            migrate: migrateTrackDial,
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
        maConnection.onChange(() => {
            for (const id of this.ids()) this.redraw(id);
        });
    }

    private joinRow(a: DialAction<TrackDialSettings>, settings: TrackDialSettings): void {
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
                const next = { ...s, ...patch } as TrackDialSettings;
                this.inRows.set(id, next);
                void a.setSettings(next);
            },
            redraw: () => this.redraw(id),
        });
    }
}
