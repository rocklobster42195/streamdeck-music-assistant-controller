import { arc, pie } from "@rocklobster42195/streamdeck-kit";
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

/**
 * Key color tiers (same on every key): ACCENT = on / active, the default light grey = an action
 * that is available, OFF = a toggle that is off or a choice that isn't the current one,
 * UNAVAILABLE = can't be used right now (e.g. skip on a radio stream).
 */
export const ACCENT = "#6cc4ff";
export const OFF = "#8a8a90";
export const UNAVAILABLE = "#4a4a50";

export type KeyImageOptions = {
    /** data: URI of the cover art, drawn full-bleed. */
    cover?: string;
    /** Cover being faded out underneath `cover` (see CoverFader). */
    previousCover?: string;
    /** 0..1 opacity of `cover` over `previousCover`. */
    coverMix?: number;
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
    /** Extra SVG drawn on top of everything (e.g. a scrolling title). */
    overlay?: string;
    /** Service badge in the top-left corner (already positioned SVG, see providerBadge). */
    cornerBadge?: string;
    /** Caption under the icon (e.g. "1" for repeat one, or a volume value). Keys' titles stay free for the user. */
    badge?: string;
    /**
     * A gauge (0..1) filling the key instead of an icon, e.g. the mute key's volume: a ring with a
     * number or icon in the center, or a pie (Sonos Controller's look), which has room only for an
     * icon when it is empty.
     */
    ring?: { value: number; color: string; style?: GaugeStyle; center?: { icon?: string; text?: string; color: string; size?: number; /** The key's marker may take this spot. */ markerSpot?: boolean } };
};

// Icon sizes without cover art: as large as sonos-controller's full-bleed MDI glyphs, a bit
// smaller when a caption sits underneath.
const ICON = { size: 112, xy: 16 };
const ICON_WITH_BADGE = { size: 92, x: 26, y: 6 };
const ICON_BESIDE_MARKER = { size: 100, xy: 22 };

/** Cover color that replaces the light default and the blue "on" color while a key renders (see withIconTint). */
let iconTint: string | undefined;

/**
 * Render with icons in `tint` (the cover's color) instead of the light default and the blue "on"
 * color — for keys with the "Cover color" option. OFF grey and UNAVAILABLE stay as they are, so
 * the three states remain tellable apart.
 */
export function withIconTint<T>(tint: string | undefined, render: () => T): T {
    const before = iconTint;
    iconTint = tint;
    try {
        return render();
    } finally {
        iconTint = before;
    }
}

/** The user's marker icon (MDI path) for the key being rendered (see withKeyMarker). */
let keyMarker: string | undefined;

/**
 * Render with the key's marker, a small icon the user picks to tell keys apart (e.g. a pot for the
 * kitchen). It sits in the top-right corner; a ring's empty center or the Player key's room icon
 * takes it instead where there is one.
 */
export function withKeyMarker<T>(marker: string | undefined, render: () => T): T {
    const before = keyMarker;
    keyMarker = marker;
    try {
        return render();
    } finally {
        keyMarker = before;
    }
}

export function renderKeyImage(input: KeyImageOptions): string {
    const placed = placeMarker(input, keyMarker);
    input = placed.opts;
    const t = iconTint;
    const opts: KeyImageOptions = t
        ? {
              ...input,
              color: input.color === undefined || input.color === ACCENT ? t : input.color,
              active: input.active === ACCENT ? t : input.active,
              // The mute key's volume ring (a muted one keeps its grey)
              ring: input.ring && input.ring.color === ACCENT ? { ...input.ring, color: t } : input.ring,
          }
        : input;
    const color = opts.color ?? "#e0e0e0";
    const parts: string[] = [`<rect width="${SIZE}" height="${SIZE}" fill="#101010"/>`];
    if (opts.active && !opts.cover) {
        parts.push(`<rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" rx="18" fill="${opts.active}" opacity="0.14"/>`);
    }

    if (opts.cover) {
        const mix = opts.previousCover ? Math.min(1, Math.max(0, opts.coverMix ?? 1)) : 1;
        if (mix < 1) parts.push(`<image href="${opts.previousCover}" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice"/>`);
        parts.push(`<image href="${opts.cover}" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice"${mix < 1 ? ` opacity="${mix.toFixed(2)}"` : ""}/>`);
        if (opts.dimmed) parts.push(`<rect width="${SIZE}" height="${SIZE}" fill="#000" opacity="0.55"/>`);
        if (opts.icon) {
            // Centered badge on top of the cover
            parts.push(`<circle cx="72" cy="72" r="30" fill="#000" opacity="0.55"/>`);
            parts.push(icon(opts.icon, 48, 48, 48, color));
        }
    } else if (opts.ring) {
        parts.push(...ringParts(opts.ring));
    } else if (opts.icon) {
        const fill = opts.dimmed ? UNAVAILABLE : color;
        // A little smaller next to a corner marker, so the two don't touch
        const big = placed.corner ? ICON_BESIDE_MARKER : ICON;
        parts.push(opts.badge ? icon(opts.icon, ICON_WITH_BADGE.x, ICON_WITH_BADGE.y, ICON_WITH_BADGE.size, fill) : icon(opts.icon, big.xy, big.xy, big.size, fill));
    }

    if (opts.active) {
        // Frame on top, so it also shows over cover art
        const inset = opts.cover ? 3 : 4;
        parts.push(`<rect x="${inset}" y="${inset}" width="${SIZE - 2 * inset}" height="${SIZE - 2 * inset}" rx="18" fill="none" stroke="${opts.active}" stroke-width="${opts.cover ? 6 : 3}" opacity="${opts.cover ? 1 : 0.7}"/>`);
        // "Now playing" tag in the corner (top instead of bottom when a title band sits at the bottom;
        // left out when the marker already takes the top)
        if (opts.cover && !opts.icon && !(opts.overlay && placed.corner)) {
            const cy = opts.overlay ? 26 : SIZE - 26;
            parts.push(`<circle cx="${SIZE - 26}" cy="${cy}" r="16" fill="${opts.active}"/>`);
            parts.push(icon(mdiPlay, SIZE - 38, cy - 12, 24, "#0b1a26"));
        }
    }

    if (opts.statusDot) {
        parts.push(`<circle cx="${SIZE - 26}" cy="26" r="9" fill="#101010"/>`, `<circle cx="${SIZE - 26}" cy="26" r="6" fill="${opts.statusDot}"/>`);
    }

    if (opts.badge && !opts.ring) {
        // Under the icon; over cover art it stays at the top, where the cover badge leaves room.
        const y = opts.cover ? 30 : SIZE - 8;
        parts.push(`<text x="${SIZE / 2}" y="${y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${opts.cover ? 22 : 28}" font-weight="700" fill="${opts.dimmed ? UNAVAILABLE : color}">${escapeXml(opts.badge)}</text>`);
    }

    if (opts.progress !== undefined) {
        const w = Math.round(SIZE * Math.min(1, Math.max(0, opts.progress)));
        parts.push(`<rect y="${SIZE - 6}" width="${SIZE}" height="6" fill="#000" opacity="0.5"/>`);
        parts.push(`<rect y="${SIZE - 6}" width="${w}" height="6" fill="${opts.progressColor ?? color}"/>`);
    }

    if (placed.corner) parts.push(...markerParts(placed.corner, !!opts.cover, !!opts.ring, !!opts.dimmed));
    if (opts.cornerBadge) parts.push(opts.cornerBadge);
    if (opts.overlay) parts.push(opts.overlay);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join("")}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Where the marker goes: into a ring's free center, as the room icon of a key with a status dot, else the corner. */
function placeMarker(opts: KeyImageOptions, marker: string | undefined): { opts: KeyImageOptions; corner?: string } {
    if (!marker) return { opts };
    const center = opts.ring?.center;
    if (center?.markerSpot) return { opts: { ...opts, ring: { ...opts.ring!, center: { ...center, icon: marker } } } };
    if (opts.statusDot) return { opts: opts.cover ? opts : { ...opts, icon: marker } };
    return { opts, corner: marker };
}

/**
 * The marker in the top-right corner: the mirror image of the service badge in the top-left
 * (see providerBadge, a disc of r 18 around (24, 24) with a 22 px logo); on a cover the disc is
 * dark. Next to a ring or pie it moves further into the corner, clear of the gauge.
 */
function markerParts(marker: string, onCover: boolean, besideGauge: boolean, dimmed: boolean): string[] {
    const fill = dimmed ? UNAVAILABLE : "#b8b8be";
    if (besideGauge) return [icon(marker, 116, 6, 22, fill)];
    const parts = onCover ? [`<circle cx="${SIZE - 24}" cy="24" r="18" fill="#101010" opacity="0.8"/>`] : [];
    parts.push(icon(marker, SIZE - 35, 13, 22, fill));
    return parts;
}

/** Ring gauge like the Volume dial's, sized to the key; the center holds a number or an icon. */
function ringParts(ring: NonNullable<KeyImageOptions["ring"]>): string[] {
    const c = SIZE / 2;
    const center = ring.center;
    if (ring.style === "pie") {
        const parts = pie(c, c, 54, ring.value, ring.color);
        if (center?.icon) parts.push(icon(center.icon, c - 28, c - 28, 56, center.color));
        return parts;
    }
    const parts = arc(c, c, 54, ring.value, ring.color, { width: 14 });
    if (center?.text) {
        parts.push(`<text x="${c}" y="${c + Math.round((center.size ?? 42) * 0.36)}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${center.size ?? 42}" font-weight="700" fill="${center.color}">${escapeXml(center.text)}</text>`);
    } else if (center?.icon) {
        parts.push(icon(center.icon, c - 28, c - 28, 56, center.color));
    }
    return parts;
}

function icon(path: string, x: number, y: number, size: number, fill: string): string {
    const scale = size / 24;
    return `<path transform="translate(${x} ${y}) scale(${scale})" fill="${fill}" d="${path}"/>`;
}

function escapeXml(s: string): string {
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** How volume keys and dials draw the volume: MA-C's ring or Sonos Controller's pie. */
export type GaugeStyle = "ring" | "pie";
