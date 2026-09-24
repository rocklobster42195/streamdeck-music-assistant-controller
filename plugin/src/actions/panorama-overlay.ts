import { currentElapsed, lyricIndexAt } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { lyrics } from "../ma/lyrics";
import { fadeProgress, lyricsOverlay, trackOverlay, type TextRun } from "../render/panorama-text";

/** What the Panorama dial writes over its effect. */
export type OverlayMode = "off" | "track" | "lyrics";

type Shown = { key: string; kind: "track"; title: string; artist: string } | { key: string; kind: "lyrics"; current: string };
type RunState = { shown: Shown; previous?: Shown; changedAt: number };

/**
 * Text over the panorama for the active player: title & artist, or the synced lyrics line (falling
 * back to title & artist while lyrics load or when there are none). Keeps per-run state so a change
 * crossfades on every display of the run at the same moment.
 */
export class PanoramaOverlay {
    private readonly runs = new Map<string, RunState>();

    /** SVG fragment for one display of run `runKey` ('' = no text). */
    render(runKey: string, run: TextRun, mode: OverlayMode, lyricsOffset: number, now = Date.now()): string {
        if (mode === "off") return "";
        const player = maConnection.player(maConnection.globalSettings.activePlayerId);
        const media = player?.current_media;
        if (!media) {
            this.runs.delete(runKey);
            return "";
        }
        const queue = maConnection.queueFor(player);
        let shown: Shown = { key: `t:${media.title}\n${media.artist}`, kind: "track", title: media.title ?? "", artist: media.artist ?? media.album ?? "" };
        let next = "";
        const state = mode === "lyrics" && queue?.current_item?.media_item?.uri === media.uri ? lyrics.forQueue(queue) : undefined;
        if (state?.status === "ok" && queue) {
            const i = lyricIndexAt(state.lines, currentElapsed(queue, now / 1000) + lyricsOffset);
            shown = { key: `l:${media.uri}#${i}`, kind: "lyrics", current: i >= 0 ? state.lines[i].text : "" };
            next = state.lines[i + 1]?.text ?? "";
        }

        const s = this.track(runKey, shown, now);
        const t = fadeProgress(s.changedAt, now);
        const prev = s.previous?.kind === shown.kind ? s.previous : undefined;
        if (shown.kind === "lyrics") return lyricsOverlay(run, shown.current, next, prev?.kind === "lyrics" ? prev.current : undefined, t);
        return trackOverlay(run, shown, prev?.kind === "track" ? prev : undefined, t);
    }

    forget(runKey: string): void {
        this.runs.delete(runKey);
    }

    private track(runKey: string, shown: Shown, now: number): RunState {
        const s = this.runs.get(runKey);
        if (s?.shown.key === shown.key) return s;
        // A run's displays render the same frame one after another: only the first one sees the change
        const next: RunState = { shown, previous: s?.shown, changedAt: s ? now : 0 };
        this.runs.set(runKey, next);
        return next;
    }
}
