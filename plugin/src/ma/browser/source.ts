import type { MediaItem, MusicAssistantClient } from "music-assistant-client";
import type { LibraryMediaType } from "../../pi/protocol";
import { type BrowseEntry, type BrowseSource, LIBRARY_ROOT, PROVIDERS_ROOT } from "./types";

/** Library folder labels (translated by the caller). */
export type LibraryLabels = Record<"favorites" | Exclude<LibraryMediaType, "artist">, string>;

const LIBRARY_COMMANDS: Partial<Record<LibraryMediaType, string>> = {
    playlist: "music/playlists/library_items",
    album: "music/albums/library_items",
    radio: "music/radios/library_items",
    podcast: "music/podcasts/library_items",
    audiobook: "music/audiobooks/library_items",
    track: "music/tracks/library_items",
};

/**
 * Browse source backed by MA: the provider tree via `music/browse`, plus a virtual "library" tree
 * (favorites and library listings per media type), since `library://` itself can't be browsed.
 * Providers that can't be browsed (e.g. NotImplementedError) are remembered and hidden.
 */
export class MaBrowseSource implements BrowseSource {
    private readonly unbrowsable = new Set<string>();

    constructor(
        private readonly ma: () => MusicAssistantClient | undefined,
        private readonly labels: () => LibraryLabels,
    ) {}

    async list(path: string): Promise<BrowseEntry[]> {
        const ma = this.ma();
        if (!ma?.isConnected) throw new Error("not connected");
        if (path === LIBRARY_ROOT) return this.libraryRoot();
        if (path === "mac:favorites") return this.favorites(ma);
        if (path.startsWith("mac:lib:")) return this.libraryItems(ma, path.slice("mac:lib:".length) as LibraryMediaType, false);

        const real = path === PROVIDERS_ROOT ? undefined : path;
        try {
            const items = await ma.send<MediaItem[]>("music/browse", real ? { path: real } : {});
            return (items ?? [])
                .filter((i) => i.name !== "..")
                .map(toEntry)
                .filter((e) => !(path === PROVIDERS_ROOT && e.path && this.unbrowsable.has(providerOf(e.path))));
        } catch (e) {
            if (real) this.unbrowsable.add(providerOf(real));
            throw e;
        }
    }

    private libraryRoot(): BrowseEntry[] {
        const l = this.labels();
        const folder = (name: string, path: string, mediaType: string): BrowseEntry => ({ name, path, mediaType, isFolder: true, playable: false });
        return [
            folder(l.favorites, "mac:favorites", "favorites"),
            ...(["playlist", "album", "radio", "podcast", "audiobook", "track"] as const).map((t) => folder(l[t], `mac:lib:${t}`, t)),
        ];
    }

    private async favorites(ma: MusicAssistantClient): Promise<BrowseEntry[]> {
        const types: LibraryMediaType[] = ["playlist", "album", "radio", "podcast", "audiobook", "track"];
        const lists = await Promise.all(types.map((t) => this.libraryItems(ma, t, true).catch(() => [])));
        return lists.flat();
    }

    private async libraryItems(ma: MusicAssistantClient, type: LibraryMediaType, favoritesOnly: boolean): Promise<BrowseEntry[]> {
        const command = LIBRARY_COMMANDS[type];
        if (!command) return [];
        const items = await ma.send<MediaItem[]>(command, { limit: 250, ...(favoritesOnly ? { favorite: true } : {}) });
        return (items ?? []).map(toEntry);
    }
}

function providerOf(path: string): string {
    return path.split("://")[0];
}

export function toEntry(item: MediaItem): BrowseEntry {
    const isFolder = item.media_type === "folder";
    const image = item.metadata?.images?.find((i) => i.type === "thumb") ?? item.metadata?.images?.[0];
    const artists = (item.artists as { name: string }[] | undefined)?.map((a) => a.name).filter(Boolean);
    return {
        name: item.name.trim(),
        path: isFolder ? ((item.path as string | undefined) ?? item.uri) : undefined,
        uri: item.uri,
        mediaType: item.media_type,
        isFolder,
        playable: item.media_type === "folder" ? item.is_playable === true : item.is_playable !== false,
        imageProxyId: image?.proxy_id,
        subtitle: artists?.length ? artists.join(", ") : undefined,
    };
}
