import type { MediaItem, MusicAssistantClient } from "music-assistant-client";
import type { LibraryFilter, LibraryItem, LibraryMediaType } from "../pi/protocol";

const THUMB_SIZE = 80;

/** MA's search result keys per media type (note: radio is singular there). */
const SEARCH_KEYS: Record<LibraryMediaType, string> = {
    playlist: "playlists",
    album: "albums",
    radio: "radio",
    podcast: "podcasts",
    track: "tracks",
    artist: "artists",
    audiobook: "audiobooks",
};

/** Library listing commands per media type (for favorites). */
const LIBRARY_COMMANDS: Partial<Record<LibraryMediaType, string>> = {
    playlist: "music/playlists/library_items",
    album: "music/albums/library_items",
    radio: "music/radios/library_items",
    podcast: "music/podcasts/library_items",
    track: "music/tracks/library_items",
    audiobook: "music/audiobooks/library_items",
};

const BROWSABLE: LibraryMediaType[] = ["playlist", "album", "radio", "podcast", "track", "audiobook"];

/** Search all providers, or list favorites when the query is empty. */
export async function searchLibrary(ma: MusicAssistantClient, query: string, filter: LibraryFilter): Promise<{ items: LibraryItem[]; favorites: boolean }> {
    const types = filter === "all" ? BROWSABLE : [filter];
    const q = query.trim();
    if (!q) {
        const perType = filter === "all" ? 8 : 40;
        const lists = await Promise.all(
            types.map((t) => {
                const command = LIBRARY_COMMANDS[t];
                return command ? ma.send<MediaItem[]>(command, { favorite: true, limit: perType }).catch(() => []) : Promise.resolve([]);
            }),
        );
        return { items: lists.flat().map((i) => toLibraryItem(ma, i)), favorites: true };
    }
    const result = await ma.send<Record<string, MediaItem[]>>("music/search", { search_query: q, media_types: types, limit: filter === "all" ? 6 : 25 });
    const items = types.flatMap((t) => result?.[SEARCH_KEYS[t]] ?? []).map((i) => toLibraryItem(ma, i));
    return { items, favorites: false };
}

export function toLibraryItem(ma: MusicAssistantClient, item: MediaItem): LibraryItem {
    const image = item.metadata?.images?.find((i) => i.type === "thumb") ?? item.metadata?.images?.[0];
    const artists = (item.artists as { name: string }[] | undefined)?.map((a) => a.name).filter(Boolean);
    const subtitle = artists?.length ? artists.join(", ") : ((item.owner as string | undefined) ?? (item.publisher as string | undefined) ?? undefined);
    return {
        uri: item.uri,
        name: item.name.trim(),
        subtitle: subtitle || undefined,
        mediaType: item.media_type,
        imageProxyId: image?.proxy_id,
        thumbUrl: image?.proxy_id ? ma.imageProxyUrl(image.proxy_id, THUMB_SIZE) : image?.remotely_accessible ? image.path : undefined,
    };
}
