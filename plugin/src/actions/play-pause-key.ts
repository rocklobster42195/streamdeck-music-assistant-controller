import { action, type DidReceiveSettingsEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { piBridge } from "@rocklobster42195/streamdeck-kit/bridge";
import { PlayPauseKeyAction } from "@rocklobster42195/streamdeck-kit/keys";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { macPlayers } from "../bus/mac-players";
import { maConnection } from "../ma/connection";
import type { KeyPreview } from "../pi/protocol";
import { panoramaRows } from "../render/panorama";
import { notReadyRender } from "./ma-key-action";
import { migratePlayPause, type PlayPauseSettings } from "./play-pause-migrate";

const PREVIEW_EVERY_MS = 1000;

/** The universal Play/Pause key (the kit's), on the deck's players: MA's, Sonos Controller's, the PC's. */
@action({ UUID: "de.boriskemper.music-assistant-controller.play-pause-key" })
export class PlayPauseKey extends PlayPauseKeyAction<PlayPauseSettings> {
    private readonly previews = new Map<string, { at: number; key: string }>();
    /** Keys without a player of their own (they follow the deck's active one). */
    private readonly following = new Set<string>();

    constructor() {
        super({
            board: macPlayers,
            markerPath: (name) => mdiPath(name),
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
            migrate: migratePlayPause,
            // No player because MA isn't set up or reachable: say so, as MA-C's other keys do
            unavailable: () => (maConnection.ma?.isConnected ? undefined : notReadyRender()[0]),
            onDraw: (id, s) => this.preview(id, s),
        });
        maConnection.onChange(() => this.refresh());
    }

    override onWillAppear(ev: WillAppearEvent<PlayPauseSettings>): void {
        this.follow(ev.action.id, migratePlayPause(ev.payload.settings) ?? ev.payload.settings);
        super.onWillAppear(ev);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<PlayPauseSettings>): void {
        this.follow(ev.action.id, ev.payload.settings);
        super.onDidReceiveSettings(ev);
    }

    override onWillDisappear(ev: WillDisappearEvent<PlayPauseSettings>): void {
        super.onWillDisappear(ev);
        this.following.delete(ev.action.id);
        this.previews.delete(ev.action.id);
        piBridge.forget(ev.action.id);
    }

    private follow(id: string, settings: PlayPauseSettings): void {
        if (settings.player) this.following.delete(id);
        else this.following.add(id);
    }

    /** The settings panel's header: state and track at once, picture changes at most once a second. */
    private preview(id: string, s: Parameters<NonNullable<ConstructorParameters<typeof PlayPauseKeyAction>[0]["onDraw"]>>[1]): void {
        const state: KeyPreview["state"] = s.player ? (s.playing ? "playing" : "paused") : maConnection.ma?.isConnected ? "no_player" : notReadyRender()[1];
        const preview: KeyPreview = { image: s.image, state, track: [s.player?.title, s.player?.artist].filter(Boolean).join(" · ") || undefined, playerName: s.player?.name, following: this.following.has(id) };
        const key = `${preview.state}\n${preview.track ?? ""}\n${preview.playerName ?? ""}`;
        const last = this.previews.get(id);
        const now = Date.now();
        if (last && last.key === key && now - last.at < PREVIEW_EVERY_MS) return;
        this.previews.set(id, { at: now, key });
        piBridge.updatePreview(id, preview);
    }
}
