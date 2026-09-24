// Stream Deck + touch-strip segments: 200×100 SVG, sent as the "full-canvas" pixmap of layouts/canvas.json.
// Text uses Arial (renders reliably on the device; see sonos-controller's dials).

export const STRIP_W = 200;
export const STRIP_H = 100;

export function stripImage(parts: string[], background = "#0a0a0a"): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_W}" height="${STRIP_H}" viewBox="0 0 ${STRIP_W} ${STRIP_H}"><rect width="${STRIP_W}" height="${STRIP_H}" fill="${background}"/>${parts.join("")}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function escapeXml(s: string): string {
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Cut text to roughly fit `maxWidth` px at `fontSize` (Arial averages ~0.55em per glyph). */
export function fit(text: string, maxWidth: number, fontSize: number): string {
    const max = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)));
    const t = text.trim();
    return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Split text into at most `maxLines` lines that fit `maxWidth`; the last line gets an ellipsis if needed. */
export function wrap(value: string, maxWidth: number, fontSize: number, maxLines = 2): string[] {
    const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)));
    const words = value.trim().split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const next = line ? `${line} ${w}` : w;
        if (next.length <= perLine) {
            line = next;
            continue;
        }
        if (line) lines.push(line);
        line = w;
        if (lines.length === maxLines - 1) {
            // Last allowed line: take the rest and cut it
            return [...lines, fit([line, ...words.slice(i + 1)].join(" "), maxWidth, fontSize)];
        }
    }
    if (line) lines.push(fit(line, maxWidth, fontSize));
    return lines.slice(0, maxLines);
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
