// Stream Deck + touch-strip segments: 200×100 SVG, sent as the "full-canvas" pixmap of layouts/canvas.json.
// Text uses Arial (renders reliably on the device; see sonos-controller's dials) and is measured
// with real Arial glyph widths from streamdeck-core.
import { truncateToWidth, wrapToWidth } from "streamdeck-core";

export const STRIP_W = 200;
export const STRIP_H = 100;

/** Full strip image. `underlay` (e.g. a panorama effect slice) is drawn between background and content. */
export function stripImage(parts: string[], background = "#0a0a0a", underlay = ""): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_W}" height="${STRIP_H}" viewBox="0 0 ${STRIP_W} ${STRIP_H}"><defs><clipPath id="strip"><rect width="${STRIP_W}" height="${STRIP_H}"/></clipPath></defs><rect width="${STRIP_W}" height="${STRIP_H}" fill="${background}"/>${underlay ? `<g clip-path="url(#strip)">${underlay}</g>` : ""}${parts.join("")}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function escapeXml(s: string): string {
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Cut text to fit `maxWidth` px at `fontSize` (real Arial glyph widths). */
export function fit(value: string, maxWidth: number, fontSize: number): string {
    return truncateToWidth(value.trim(), fontSize, maxWidth);
}

/** Split text into at most `maxLines` lines that fit `maxWidth` (measured); the last line gets an ellipsis if needed. */
export function wrap(value: string, maxWidth: number, fontSize: number, maxLines = 2): string[] {
    return wrapToWidth(value, fontSize, maxWidth, maxLines);
}

export function text(x: number, y: number, value: string, opts: { size?: number; color?: string; weight?: "bold" | "normal"; anchor?: "start" | "middle" | "end"; maxWidth?: number } = {}): string {
    const size = opts.size ?? 13;
    const shown = opts.maxWidth ? fit(value, opts.maxWidth, size) : value;
    return `<text x="${x}" y="${y}" fill="${opts.color ?? "#ffffff"}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${opts.weight ?? "normal"}" text-anchor="${opts.anchor ?? "start"}">${escapeXml(shown)}</text>`;
}

/** MDI icon path, `size` px, top-left at (x, y). */
export function mdi(path: string, x: number, y: number, size: number, fill: string): string {
    return `<path transform="translate(${x} ${y}) scale(${size / 24})" fill="${fill}" d="${path}"/>`;
}

/** Circular gauge (0..1) centered at (cx, cy). */
export function gauge(cx: number, cy: number, r: number, value: number, color: string, track = "#2c2c30", width = 8): string[] {
    const v = Math.min(1, Math.max(0, value));
    const circumference = 2 * Math.PI * r;
    return [
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="${width}"/>`,
        v > 0
            ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${(v * circumference).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`
            : "",
    ];
}

export function progressBar(x: number, y: number, w: number, value: number, color: string, h = 4): string[] {
    const v = Math.min(1, Math.max(0, value));
    return [`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#2c2c30"/>`, `<rect x="${x}" y="${y}" width="${Math.max(h, w * v).toFixed(1)}" height="${h}" rx="${h / 2}" fill="${color}"/>`];
}

/** Image (data URI) into a rect, cropped to fill. */
export function image(href: string, x: number, y: number, w: number, h: number): string {
    return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
}

export function formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
