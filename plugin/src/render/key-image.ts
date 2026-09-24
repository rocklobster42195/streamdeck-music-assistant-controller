import { mdiLanConnect, mdiLanDisconnect, mdiMusicNote, mdiPause, mdiPlay, mdiSpeakerOff } from "@mdi/js";

// Key images are rendered as SVG data URIs at 144 px (the @2x key size).
const SIZE = 144;

export const ICONS = {
    play: mdiPlay,
    pause: mdiPause,
    note: mdiMusicNote,
    offline: mdiLanDisconnect,
    connecting: mdiLanConnect,
    noPlayer: mdiSpeakerOff,
};

export type KeyImageOptions = {
    /** data: URI of the cover art, drawn full-bleed. */
    cover?: string;
    /** MDI path drawn centered (large when there is no cover, as a small badge otherwise). */
    icon?: string;
    /** Icon/accent color. */
    color?: string;
    /** Dim the whole key (e.g. paused or offline). */
    dimmed?: boolean;
    /** 0..1 progress bar at the bottom. */
    progress?: number;
    progressColor?: string;
};

export function renderKeyImage(opts: KeyImageOptions): string {
    const color = opts.color ?? "#e0e0e0";
    const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="#101010"/>`];

    if (opts.cover) {
        parts.push(`<image href="${opts.cover}" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice"/>`);
        if (opts.dimmed) parts.push(`<rect width="${SIZE}" height="${SIZE}" fill="#000" opacity="0.55"/>`);
        if (opts.icon) {
            // Centered badge on top of the cover
            parts.push(`<circle cx="72" cy="72" r="30" fill="#000" opacity="0.55"/>`);
            parts.push(icon(opts.icon, 48, 48, 48, color));
        }
    } else if (opts.icon) {
        parts.push(icon(opts.icon, 32, 32, 80, opts.dimmed ? "#777" : color));
    }

    if (opts.progress !== undefined) {
        const w = Math.round(SIZE * Math.min(1, Math.max(0, opts.progress)));
        parts.push(`<rect y="${SIZE - 6}" width="${SIZE}" height="6" fill="#000" opacity="0.5"/>`);
        parts.push(`<rect y="${SIZE - 6}" width="${w}" height="6" fill="${opts.progressColor ?? color}"/>`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join("")}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function icon(path: string, x: number, y: number, size: number, fill: string): string {
    const scale = size / 24;
    return `<path transform="translate(${x} ${y}) scale(${scale})" fill="${fill}" d="${path}"/>`;
}

/** "rgb(r,g,b)" from an MA palette triplet. */
export function rgb(triplet: [number, number, number] | undefined, fallback: string): string {
    return triplet ? `rgb(${triplet[0]},${triplet[1]},${triplet[2]})` : fallback;
}
