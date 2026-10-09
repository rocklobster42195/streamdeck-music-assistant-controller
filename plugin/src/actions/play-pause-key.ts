import streamDeck, { action, SingletonAction, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { PlayPauseKeys } from "@rocklobster42195/streamdeck-kit";
import { piBridge } from "@rocklobster42195/streamdeck-kit/bridge";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { macPlayers } from "../bus/mac-players";
import { maConnection } from "../ma/connection";
import type { KeyPreview } from "../pi/protocol";
import { panoramaRows } from "../render/panorama";
import { notReadyRender } from "./ma-key-action";
import { migratePlayPause, type PlayPauseSettings as Settings } from "./play-pause-migrate";

const PREVIEW_EVERY_MS = 1000;

/** The universal Play/Pause key (the kit's), on the deck's players: MA's, Sonos Controller's, the PC's. */
@action({ UUID: "de.boriskemper.music-assistant-controller.play-pause-key" })
export class PlayPauseKey extends SingletonAction<Settings> {
    private readonly shown = new Map<string, { action: KeyAction<Settings>; settings: Settings; image?: string; title?: string; previewAt?: number; previewKey?: string }>();
    private readonly keys = new PlayPauseKeys({
        board: macPlayers,
        draw: (id, image, title) => this.draw(id, image, title),
        rowColor: (id) => {
            const s = this.shown.get(id);
            return s ? panoramaRows.rowColor(s.action.device.id) : undefined;
        },
        markerPath: (name) => mdiPath(name),
    });

    constructor() {
        super();
        // Setting up or reconnecting to MA: a key without a player shows where that stands
        maConnection.onChange(() => {
            for (const [id, s] of this.shown) if (!this.keys.player(id)) this.keys.show(id, s.settings);
        });
    }

    override onWillAppear(ev: WillAppearEvent<Settings>): void {
        if (!ev.action.isKey()) return;
        let settings = ev.payload.settings;
        const migrated = migratePlayPause(settings);
        if (migrated) {
            settings = migrated;
            void ev.action.setSettings(migrated);
        }
        this.shown.set(ev.action.id, { action: ev.action, settings });
        this.keys.show(ev.action.id, settings);
    }

    override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
        this.shown.delete(ev.action.id);
        this.keys.hide(ev.action.id);
        piBridge.forget(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
        const s = this.shown.get(ev.action.id);
        if (!s) return;
        s.settings = ev.payload.settings;
        this.keys.show(ev.action.id, s.settings);
    }

    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        try {
            await this.keys.press(ev.action.id);
        } catch (e) {
            streamDeck.logger.warn("[play-pause] press failed", e);
            await ev.action.showAlert();
        }
    }

    private draw(id: string, image: string, title: string): void {
        const s = this.shown.get(id);
        if (!s) return;
        const player = this.keys.player(id);
        let state: KeyPreview["state"] = player ? (this.keys.playing(id) ? "playing" : "paused") : "no_player";
        // No player because MA isn't set up or reachable: say so, as MA-C's other keys do
        if (!player && !maConnection.ma?.isConnected) {
            const [out, notReady] = notReadyRender();
            image = out.image;
            title = out.title ?? "";
            state = notReady;
        }
        if (image !== s.image) {
            s.image = image;
            void s.action.setImage(image);
        }
        if (title !== s.title) {
            s.title = title;
            void s.action.setTitle(title);
        }
        // The settings panel's header: state and track at once, picture changes at most once a second
        const preview: KeyPreview = { image, state, track: [player?.title, player?.artist].filter(Boolean).join(" · ") || undefined, playerName: player?.name, following: !s.settings.player };
        const key = `${preview.state}\n${preview.track ?? ""}\n${preview.playerName ?? ""}`;
        const now = Date.now();
        if (key !== s.previewKey || !s.previewAt || now - s.previewAt >= PREVIEW_EVERY_MS) {
            s.previewAt = now;
            s.previewKey = key;
            piBridge.updatePreview(id, preview);
        }
    }
}
