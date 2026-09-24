// Text over the panorama effect: "title & artist" (ported from sonos-controller's
// PanoramaEffectsDial overlay) or synced lyrics. Neighbouring text dials form one "run": text is
// laid out across the whole run and every display draws its own 200 px window of it.
import { balanceLines, measureArialWidth, wrapToWidth } from "streamdeck-core";
import { escapeXml, fit } from "./strip";

/** A run of neighbouring text dials: total width, and where this display sits in it. */
export type TextRun = { width: number; offset: number };

export const FADE_MS = 400;

/** 0 → 1 over FADE_MS after `changedAt`. */
export function fadeProgress(changedAt: number, now = Date.now()): number {
    return Math.min(1, Math.max(0, (now - changedAt) / FADE_MS));
}

type TrackInfo = { title: string; artist: string };

/**
 * Title and artist right-aligned at the end of the run on dark pills (as in sonos-controller).
 * While `t` < 1 the previous text dissolves into the new one.
 */
export function trackOverlay(run: TextRun, info: TrackInfo, prev?: TrackInfo, t = 1): string {
    const x = run.width - 4;
    const max = run.width - 12;
    const layers = [{ info, opacity: t }, ...(prev && t < 1 ? [{ info: prev, opacity: 1 - t }] : [])];
    const shown = layers.map((l) => ({ ...l, title: fit(l.info.title, max, 20), artist: fit(l.info.artist, max, 15) }));
    const titleW = Math.max(...shown.map((s) => (s.title ? measureArialWidth(s.title, 20) : 0)));
    const artistW = Math.max(...shown.map((s) => (s.artist ? measureArialWidth(s.artist, 15) : 0)));
    const parts: string[] = [];
    if (titleW) parts.push(`<rect x="${x - titleW - 4}" y="49" width="${titleW + 8}" height="27" rx="3" fill="#000" fill-opacity="0.7"/>`);
    if (artistW) parts.push(`<rect x="${x - artistW - 4}" y="77" width="${artistW + 8}" height="20" rx="3" fill="#000" fill-opacity="0.7"/>`);
    for (const s of shown) {
        parts.push(label(x, 72, s.title, 20, "#ffffff", "500", "end", s.opacity), label(x, 93, s.artist, 15, "#aaaaaa", "normal", "end", s.opacity));
    }
    return inRun(run, parts);
}

const SUNG = 22;
const NEXT = 16;
const NEXT_COLOR = "#d4d4d8";

/**
 * The sung line (large; long lines are split into even halves at full size) and the next one
 * (smaller, a little dimmer), centered across the run. While `t` < 1 the previous line fades out
 * and the new one slides in. An empty line (instrumental gap, before the first line) shows a note.
 */
export function lyricsOverlay(run: TextRun, current: string, next: string, previous: string | undefined, t = 1): string {
    const cx = run.width / 2;
    // 16 px margin on each side, so lines never touch the edges of the run
    const max = run.width - 32;
    const layout = sungLayout(current, max);
    const parts: string[] = [];
    if (previous !== undefined && t < 1) parts.push(...sungLines(cx, sungLayout(previous, max), 1 - t, -6 * t));
    parts.push(...sungLines(cx, layout, t, 8 * (1 - t)));
    // The next line sits below the sung block (left out when the sung line needs three rows)
    if (next && layout.lines.length < 3) parts.push(backed(cx, layout.lines.length > 1 ? 90 : 82, fit(next, max, NEXT), NEXT, NEXT_COLOR, "normal", 1));
    return inRun(run, parts);
}

type SungLayout = { lines: string[]; size: number; top: number; gap: number };

/** Largest first: two lines stay big, three lines only when two don't fit even at 18 px. */
const STEPS: [size: number, lines: number][] = [
    [SUNG, 2],
    [20, 2],
    [18, 2],
    [18, 3],
    [16, 3],
];

/** The sung block centered around y = 40 (the next line sits below it). */
function sungLayout(value: string, max: number): SungLayout {
    if (!value) return { lines: [], size: SUNG, top: 0, gap: 0 };
    for (const [size, maxLines] of STEPS) {
        const lines = balanceLines(value, size, max, maxLines, true);
        if (lines) return place(lines, size);
    }
    return place(wrapToWidth(value, 16, max, 3, true), 16);
}

function place(lines: string[], size: number): SungLayout {
    const gap = Math.round(size * 1.2);
    return { lines, size, gap, top: Math.round(40 + size * 0.35 - ((lines.length - 1) * gap) / 2) };
}

function sungLines(cx: number, layout: SungLayout, opacity: number, dy: number): string[] {
    if (!layout.lines.length) return [label(cx, 54 + dy, "♪", 26, "#b0b0b6", "normal", "middle", opacity)];
    return layout.lines.map((l, i) => backed(cx, layout.top + i * layout.gap + dy, l, layout.size, "#ffffff", "bold", opacity));
}

/** A centered line on its own dark box, so the effect stays bright around the text. */
function backed(cx: number, y: number, value: string, size: number, color: string, weight: string, opacity: number): string {
    if (!value || opacity <= 0) return "";
    const w = measureArialWidth(value, size, weight === "bold") + 16;
    const box = `<rect x="${(cx - w / 2).toFixed(1)}" y="${(y - size - 2).toFixed(1)}" width="${w.toFixed(1)}" height="${size + 8}" rx="8" fill="#000" opacity="${(0.5 * opacity).toFixed(2)}"/>`;
    return box + label(cx, y, value, size, color, weight, "middle", opacity);
}

/** A plain text line (no outline — it made the text look washed out on hardware). */
function label(x: number, y: number, value: string, size: number, color: string, weight: string, anchor: "start" | "middle" | "end", opacity: number): string {
    if (!value || opacity <= 0) return "";
    const o = opacity < 1 ? ` opacity="${opacity.toFixed(2)}"` : "";
    return `<text x="${x}" y="${y.toFixed(1)}" fill="${color}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${o}>${escapeXml(value)}</text>`;
}

/** Run coordinates → this display: shift left by its offset (the SVG viewport clips the rest). */
function inRun(run: TextRun, parts: string[]): string {
    return `<g transform="translate(${-run.offset} 0)">${parts.join("")}</g>`;
}
