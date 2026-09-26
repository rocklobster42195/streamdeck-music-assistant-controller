// Touch-strip layouts of the Browser dial (pure: data in, SVG data URI out).
import { mdiBookOpenPageVariant, mdiChevronRight, mdiFolderMusic, mdiFolderOutline, mdiHeart, mdiHistory, mdiWaveform } from "@mdi/js";
import type { BrowseEntry } from "../ma/browser";
import { ACCENT, ICONS } from "./key-image";
import { image, mdi, stripImage, text, wrap } from "./strip";

export type Flash = { text: string; color: string };

/** Idle while playing from a playlist/album: its kind and name, the current track, the hint. */
function sourceIdleStrip(cover: string | undefined, s: IdleSource, hint: string, backdrop?: string): string {
    const parts: string[] = [];
    if (cover) parts.push(image(cover, 8, 18, 64, 64));
    else parts.push(`<rect x="8" y="18" width="64" height="64" rx="6" fill="#1d1d20"/>`, mdi(mdiFolderMusic, 20, 30, 40, "#6c6c72"));
    parts.push(text(82, 26, s.kind, { size: 10, color: "#8a8a90", maxWidth: 112 }));
    parts.push(text(82, 44, s.name, { size: 13, weight: "bold", maxWidth: 112 }));
    parts.push(text(82, 62, s.track, { size: 11, color: "#c8c8cc", maxWidth: 112 }));
    parts.push(text(82, 82, hint, { size: 10, color: "#8a8a90", maxWidth: 112 }));
    return stripImage(parts, undefined, backdrop);
}

/** Idle: what is playing, and a hint to turn the dial. */
/** What is playing from, when the queue was started from a playlist, album, … (MA's queue.sources). */
export type IdleSource = { kind: string; name: string; track: string };

export function browserIdleStrip(o: { cover?: string; title: string; artist?: string; source?: IdleSource; flash?: Flash; hint: string; backdrop?: string }): string {
    if (o.source && !o.flash) return sourceIdleStrip(o.cover, o.source, o.hint, o.backdrop);
    const parts: string[] = [];
    if (o.cover) parts.push(image(o.cover, 8, 18, 64, 64));
    else parts.push(`<rect x="8" y="18" width="64" height="64" rx="6" fill="#1d1d20"/>`, mdi(mdiFolderMusic, 20, 30, 40, "#6c6c72"));
    // Title (up to two lines, one when there is an artist below), artist, then the hint
    const artist = o.flash ? undefined : o.artist;
    const lines = wrap(o.flash?.text ?? o.title, 112, 13, artist ? 1 : 2);
    lines.forEach((line, i) => parts.push(text(82, 36 + i * 16, line, { size: 13, weight: "bold", color: o.flash?.color ?? "#ffffff" })));
    if (artist) parts.push(text(82, 55, artist, { size: 11, color: "#c8c8cc", maxWidth: 112 }));
    parts.push(text(82, 80, o.hint, { size: 10, color: "#8a8a90", maxWidth: 112 }));
    return stripImage(parts, undefined, o.backdrop);
}

export type BrowseStripData = {
    breadcrumb: string[];
    flash?: Flash;
    loading: boolean;
    entry?: BrowseEntry;
    thumb?: string;
    position: { index: number; total: number };
    /** Subtitle for entries without one (e.g. the translated media type). */
    subtitle?: string;
    texts: { loading: string; empty: string };
    /** Panorama effect slice drawn under the content ('' / undefined: none). */
    backdrop?: string;
};

/** Browsing: breadcrumb, current entry with cover or type icon, position and scroll indicator. */
export function browserStrip(d: BrowseStripData): string {
    const parts: string[] = [];
    // Breadcrumb: the last two levels
    const shown = d.breadcrumb.length > 2 ? ["…", ...d.breadcrumb.slice(-2)] : d.breadcrumb;
    parts.push(text(8, 14, shown.join(" › "), { size: 10, color: "#8a8a90", maxWidth: 184 }));

    const centered = (value: string, color: string, weight: "bold" | "normal" = "normal") => {
        parts.push(text(100, 60, value, { size: 13, weight, color, anchor: "middle", maxWidth: 184 }));
        return stripImage(parts, undefined, d.backdrop);
    };
    if (d.flash) return centered(d.flash.text, d.flash.color, "bold");
    if (d.loading) return centered(d.texts.loading, "#a4a4aa");
    const entry = d.entry;
    if (!entry) return centered(d.texts.empty, "#a4a4aa");

    if (d.thumb) parts.push(image(d.thumb, 8, 24, 56, 56));
    else parts.push(`<rect x="8" y="24" width="56" height="56" rx="6" fill="#1d1d20"/>`, mdi(entryIcon(entry), 20, 36, 32, entry.isFolder ? ACCENT : "#8a8a90"));

    const lines = wrap(entry.name, 112, 13, 2);
    lines.forEach((line, i) => parts.push(text(72, 40 + i * 15, line, { size: 13, weight: "bold" })));
    const sub = entry.subtitle ?? d.subtitle;
    if (sub) parts.push(text(72, 40 + lines.length * 15 + 2, sub, { size: 11, color: "#a4a4aa", maxWidth: 104 }));

    const { index, total } = d.position;
    parts.push(text(192, 94, `${index} / ${total}`, { size: 10, color: "#8a8a90", anchor: "end" }));
    if (entry.isFolder) parts.push(mdi(mdiChevronRight, 176, 42, 20, "#8a8a90"));
    if (total > 1) {
        const h = Math.max(8, 70 / total);
        const y = 22 + ((70 - h) * (index - 1)) / (total - 1);
        parts.push(`<rect x="196" y="22" width="2" height="70" rx="1" fill="#2c2c30"/>`, `<rect x="196" y="${y.toFixed(1)}" width="2" height="${h.toFixed(1)}" rx="1" fill="#6c6c72"/>`);
    }
    return stripImage(parts, undefined, d.backdrop);
}

function entryIcon(entry: BrowseEntry): string {
    if (entry.isFolder) return entry.mediaType === "favorites" ? mdiHeart : entry.mediaType === "in_progress" ? mdiHistory : mdiFolderOutline;
    switch (entry.mediaType) {
        case "radio":
            return ICONS.radio;
        case "playlist":
            return ICONS.playlist;
        case "album":
            return ICONS.album;
        case "podcast":
        case "podcast_episode":
            return ICONS.podcast;
        case "audiobook":
            return mdiBookOpenPageVariant;
        case "sound_effect":
            return mdiWaveform;
        default:
            return ICONS.note;
    }
}
