import { RunTextOverlay, type RunText, type TextRun } from "@rocklobster42195/streamdeck-kit";
import { lyricIndexAt } from "music-assistant-client";
import { macPlayers } from "../bus/mac-players";
import { maConnection } from "../ma/connection";
import { lyrics } from "../ma/lyrics";

/** What the Panorama dial writes over its effect. */
export type OverlayMode = "off" | "track" | "lyrics";

/**
 * Text over the panorama for a player: title & artist, or the synced lyrics line (falling
 * back to title & artist while lyrics load or when there are none). `describe` says what this
 * plugin's player shows; `render` draws any run text — this plugin's or another plugin's, from
 * the bus — through the kit's crossfade, so a change fades on every display of the run at the same moment.
 */
export class PanoramaOverlay {
    private readonly fade = new RunTextOverlay();

    /**
     * What a player's text is right now (undefined: nothing to show). `playerId` is a player chosen
     * for the dial; without one the text follows the deck's active player, as every other plugin's
     * dial does (also while it is paused: the one that was playing, not MA-C's own "active" choice).
     */
    describe(mode: OverlayMode, lyricsOffset: number, playerId: string | undefined): RunText | undefined {
        if (mode === "off") return undefined;
        const deck = playerId ? undefined : macPlayers.active(false);
        const maId = playerId ?? deck?.routes.find((r) => !r.peer)?.entry.player ?? maConnection.resolvePlayerId(undefined);
        const player = maConnection.player(maId);
        const media = player?.current_media;
        // The deck's player knows its title best (a speaker's own radio, or MA's stream through SO-C)
        if (deck?.title) {
            const same = media?.title === deck.title;
            if (!same || mode !== "lyrics") return { kind: "track", title: deck.title, artist: deck.artist ?? deck.album ?? "" };
        }
        if (!media) return undefined;
        const queue = maConnection.queueFor(player);
        const state = mode === "lyrics" && queue?.current_item?.media_item?.uri === media.uri ? lyrics.forQueue(queue) : undefined;
        if (state?.status === "ok" && queue) {
            const i = lyricIndexAt(state.lines, maConnection.elapsed(queue) + lyricsOffset);
            return { kind: "lyrics", current: i >= 0 ? state.lines[i].text : "", next: state.lines[i + 1]?.text ?? "" };
        }
        return { kind: "track", title: media.title ?? "", artist: media.artist ?? media.album ?? "" };
    }

    /** SVG fragment for one display of run `runKey` ('' = no text); `changedAt` is when the text changed. */
    render(runKey: string, run: TextRun, text: RunText | undefined, changedAt?: number): string {
        return this.fade.render(runKey, run, text, Date.now(), changedAt);
    }

    forget(runKey: string): void {
        this.fade.forget(runKey);
    }
}
