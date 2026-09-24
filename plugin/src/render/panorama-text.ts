// Text over the panorama effect: "title & artist" (ported from sonos-controller's
// PanoramaEffectsDial overlay) or synced lyrics. Neighbouring text dials form one "run": text is
// laid out across the whole run and every display draws its own 200 px window of it.
import { measureArialWidth } from "streamdeck-core";
import { escapeXml, fit, wrap } from "./strip";

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

/**
 * The sung line (large, wrapped to two lines when needed) and the next one (small, dimmed),
 * centered across the run. While `t` < 1 the previous line fades out and the new one slides in.
 * An empty line (instrumental gap, or before the first line) shows a note.
 */
export function lyricsOverlay(run: TextRun, current: string, next: string, previous: string | undefined, t = 1): string {
    const cx = run.width / 2;
    const max = run.width - 16;
    const parts: string[] = [];
    if (previous !== undefined && t < 1) parts.push(...sungLine(cx, max, previous, 1 - t, -6 * t));
    parts.push(...sungLine(cx, max, current, t, 8 * (1 - t)));
    if (next) parts.push(backed(cx, 88, fit(next, max, 13), 13, "#a4a4aa", "normal", 1));
    return inRun(run, parts);
}

function sungLine(cx: number, max: number, value: string, opacity: number, dy: number): string[] {
    if (!value) return [label(cx, 52 + dy, "♪", 24, "#8a8a90", "normal", "middle", opacity)];
    if (measureArialWidth(value, 22) <= max) return [backed(cx, 50 + dy, value, 22, "#ffffff", "bold", opacity)];
    const lines = wrap(value, max, 17, 2);
    const top = lines.length > 1 ? 36 : 48;
    return lines.map((l, i) => backed(cx, top + i * 21 + dy, l, 17, "#ffffff", "bold", opacity));
}

/** A centered line on its own dark box, so the effect stays bright around the text. */
function backed(cx: number, y: number, value: string, size: number, color: string, weight: string, opacity: number): string {
    if (!value || opacity <= 0) return "";
    const w = measureArialWidth(value, size) * (weight === "bold" ? 1.07 : 1) + 16;
    const box = `<rect x="${(cx - w / 2).toFixed(1)}" y="${(y - size - 2).toFixed(1)}" width="${w.toFixed(1)}" height="${size + 8}" rx="8" fill="#000" opacity="${(0.5 * opacity).toFixed(2)}"/>`;
    return box + label(cx, y, value, size, color, weight, "middle", opacity);
}

/** A text line with a dark outline, so it stays readable on any effect. */
function label(x: number, y: number, value: string, size: number, color: string, weight: string, anchor: "start" | "middle" | "end", opacity: number): string {
    if (!value || opacity <= 0) return "";
    const o = opacity < 1 ? ` opacity="${opacity.toFixed(2)}"` : "";
    return `<text x="${x}" y="${y.toFixed(1)}" fill="${color}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" stroke="#000" stroke-opacity="0.7" stroke-width="3" stroke-linejoin="round" paint-order="stroke"${o}>${escapeXml(value)}</text>`;
}

/** Run coordinates → this display: shift left by its offset (the SVG viewport clips the rest). */
function inRun(run: TextRun, parts: string[]): string {
    return `<g transform="translate(${-run.offset} 0)">${parts.join("")}</g>`;
}
