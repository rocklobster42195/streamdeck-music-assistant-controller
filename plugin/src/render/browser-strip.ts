// Touch-strip layouts of the Browser dial (pure: data in, SVG data URI out). The browsing list
// itself is the kit's list (ListController); this file has the idle screen and the row icons.
import { mdiBookOpenPageVariant, mdiFolderMusic, mdiFolderOutline, mdiHeart, mdiHistory, mdiWaveform } from "@mdi/js";
import type { BrowseEntry } from "../ma/browser";
import { ICONS } from "./key-image";
import { image, mdi, stripImage, text, wrap } from "@rocklobster42195/streamdeck-kit";

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

/** One centred sentence (e.g. "unavailable") over the backdrop. */
export function messageStrip(value: string, color: string, backdrop?: string): string {
    return stripImage([text(100, 55, value, { size: 13, weight: "bold", color, anchor: "middle", maxWidth: 184 })], undefined, backdrop);
}

/** Type icon of an entry without a cover (list rows). */
export function entryIcon(entry: BrowseEntry): string {
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
