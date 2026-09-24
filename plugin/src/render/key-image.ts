import {
    mdiAlbum,
    mdiAllInclusive,
    mdiPlaylistMusic,
    mdiPodcast,
    mdiRadio,
    mdiStar,
    mdiHeart,
    mdiHeartOutline,
    mdiLanConnect,
    mdiLanDisconnect,
    mdiMusicNote,
    mdiPause,
    mdiPlay,
    mdiRepeat,
    mdiRepeatOff,
    mdiRepeatOnce,
    mdiShuffleDisabled,
    mdiShuffleVariant,
    mdiSkipNext,
    mdiSkipPrevious,
    mdiSpeaker,
    mdiSpeakerOff,
    mdiTransition,
    mdiVolumeHigh,
    mdiVolumeLow,
    mdiVolumeMedium,
    mdiVolumeMinus,
    mdiVolumeOff,
    mdiVolumePlus,
} from "@mdi/js";

// Key images are rendered as SVG data URIs at 144 px (the @2x key size).
const SIZE = 144;

export const ICONS = {
    play: mdiPlay,
    pause: mdiPause,
    note: mdiMusicNote,
    offline: mdiLanDisconnect,
    connecting: mdiLanConnect,
    noPlayer: mdiSpeakerOff,
    next: mdiSkipNext,
    previous: mdiSkipPrevious,
    shuffle: mdiShuffleVariant,
    shuffleOff: mdiShuffleDisabled,
    repeat: mdiRepeat,
    repeatOne: mdiRepeatOnce,
    repeatOff: mdiRepeatOff,
    crossfade: mdiTransition,
    dontStop: mdiAllInclusive,
    heart: mdiHeart,
    heartOutline: mdiHeartOutline,
    volumeHigh: mdiVolumeHigh,
    volumeMedium: mdiVolumeMedium,
    volumeLow: mdiVolumeLow,
    volumeOff: mdiVolumeOff,
    volumeUp: mdiVolumePlus,
    volumeDown: mdiVolumeMinus,
    star: mdiStar,
    speaker: mdiSpeaker,
    radio: mdiRadio,
    playlist: mdiPlaylistMusic,
    podcast: mdiPodcast,
    album: mdiAlbum,
};

/** Accent for "on" states (matches the PI theme). */
export const ACCENT = "#6cc4ff";

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
    /** Highlight the key as "on" (tinted background + ring in this color). */
    active?: string;
    /** Small status dot in the top-right corner (e.g. a player's playback state). */
    statusDot?: string;
    /** Small caption at the top (e.g. "1" for repeat one, or a volume value). Keys' titles stay free for the user. */
    badge?: string;
};

export function renderKeyImage(opts: KeyImageOptions): string {
    const color = opts.color ?? "#e0e0e0";
    const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="#101010"/>`];
    if (opts.active && !opts.cover) {
        parts.push(`<rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" rx="18" fill="${opts.active}" opacity="0.14"/>`);
    }

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

    if (opts.active) {
        // Frame on top, so it also shows over cover art
        const inset = opts.cover ? 3 : 4;
        parts.push(`<rect x="${inset}" y="${inset}" width="${SIZE - 2 * inset}" height="${SIZE - 2 * inset}" rx="18" fill="none" stroke="${opts.active}" stroke-width="${opts.cover ? 6 : 3}" opacity="${opts.cover ? 1 : 0.7}"/>`);
        if (opts.cover && !opts.icon) {
            // "Now playing" tag in the corner
            parts.push(`<circle cx="${SIZE - 26}" cy="${SIZE - 26}" r="16" fill="${opts.active}"/>`);
            parts.push(icon(mdiPlay, SIZE - 38, SIZE - 38, 24, "#0b1a26"));
        }
    }

    if (opts.statusDot) {
        parts.push(`<circle cx="${SIZE - 26}" cy="26" r="9" fill="#101010"/>`, `<circle cx="${SIZE - 26}" cy="26" r="6" fill="${opts.statusDot}"/>`);
    }

    if (opts.badge) {
        parts.push(`<text x="${SIZE / 2}" y="30" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="${color}">${escapeXml(opts.badge)}</text>`);
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

function escapeXml(s: string): string {
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** "rgb(r,g,b)" from an MA palette triplet. */
export function rgb(triplet: [number, number, number] | undefined, fallback: string): string {
    return triplet ? `rgb(${triplet[0]},${triplet[1]},${triplet[2]})` : fallback;
}
