import { lyricsOverlay, trackOverlay, fadeProgress, type RunText, type TextRun } from "@rocklobster42195/streamdeck-kit";
import { lyricIndexAt } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { lyrics } from "../ma/lyrics";

/** What the Panorama dial writes over its effect. */
export type OverlayMode = "off" | "track" | "lyrics";

type RunState = { shown: RunText; previous?: RunText; changedAt: number };

/** Identity of a text, for noticing a change (a lyrics line or a track). */
const keyOf = (t: RunText): string => (t.kind === "track" ? `t:${t.title}\n${t.artist}` : `l:${t.current}`);

/**
 * Text over the panorama for a player: title & artist, or the synced lyrics line (falling
 * back to title & artist while lyrics load or when there are none). `describe` says what this
 * plugin's player shows; `render` draws any run text — this plugin's or another plugin's, from
 * the bus — and keeps per-run state so a change crossfades on every display of the run at the same moment.
 */
export class PanoramaOverlay {
    private readonly runs = new Map<string, RunState>();

    /** What a player's text is right now (undefined: nothing to show). */
    describe(mode: OverlayMode, lyricsOffset: number, playerId: string | undefined): RunText | undefined {
        if (mode === "off") return undefined;
        const player = maConnection.player(playerId);
        const media = player?.current_media;
        if (!media) return undefined;
        const queue = maConnection.queueFor(player);
        const state = mode === "lyrics" && queue?.current_item?.media_item?.uri === media.uri ? lyrics.forQueue(queue) : undefined;
        if (state?.status === "ok" && queue) {
            const i = lyricIndexAt(state.lines, maConnection.elapsed(queue) + lyricsOffset);
            return { kind: "lyrics", current: i >= 0 ? state.lines[i].text : "", next: state.lines[i + 1]?.text ?? "" };
        }
        return { kind: "track", title: media.title ?? "", artist: media.artist ?? media.album ?? "" };
    }

    /** SVG fragment for one display of run `runKey` ('' = no text). */
    render(runKey: string, run: TextRun, text: RunText | undefined, now = Date.now()): string {
        if (!text) {
            this.runs.delete(runKey);
            return "";
        }
        const s = this.track(runKey, text, now);
        const t = fadeProgress(s.changedAt, now);
        const prev = s.previous?.kind === text.kind ? s.previous : undefined;
        if (text.kind === "lyrics") return lyricsOverlay(run, text.current, text.next, prev?.kind === "lyrics" ? prev.current : undefined, t);
        return trackOverlay(run, text, prev?.kind === "track" ? prev : undefined, t);
    }

    forget(runKey: string): void {
        this.runs.delete(runKey);
    }

    private track(runKey: string, shown: RunText, now: number): RunState {
        const s = this.runs.get(runKey);
        if (s && keyOf(s.shown) === keyOf(shown)) return s;
        // A run's displays render the same frame one after another: only the first one sees the change
        const next: RunState = { shown, previous: s?.shown, changedAt: s ? now : 0 };
        this.runs.set(runKey, next);
        return next;
    }
}
