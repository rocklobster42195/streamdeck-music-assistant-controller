// Touch-strip layouts of the Browser dial (pure: data in, SVG data URI out). The browsing list
// itself is the kit's list (ListController), the idle screen the kit's nowPlayingCard; this file
// has the row icons and the message strip.
import { mdiBookOpenPageVariant, mdiFolderOutline, mdiHeart, mdiHistory, mdiWaveform } from "@mdi/js";
import type { BrowseEntry } from "../ma/browser";
import { ICONS } from "./key-image";
import { stripImage, text } from "@rocklobster42195/streamdeck-kit";

export type Flash = { text: string; color: string };

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
