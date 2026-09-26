import type { MediaItem, MusicAssistantClient } from "music-assistant-client";
import type { LibraryMediaType } from "../../pi/protocol";
import { type BrowseEntry, type BrowseSource, LIBRARY_ROOT, PROVIDERS_ROOT, type ProviderFilter } from "./types";

/** Library folder labels (translated by the caller). */
export type LibraryLabels = Record<"favorites" | "inProgress" | Exclude<LibraryMediaType, "artist">, string>;

/** Virtual folder with started, unfinished audiobooks and podcast episodes. */
export const IN_PROGRESS = "mac:in_progress";

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
 * Providers that can't be browsed (e.g. NotImplementedError) are remembered and hidden. With a
 * provider filter, the provider list and the library listings only show those providers.
 */
export class MaBrowseSource {
    private readonly unbrowsable = new Set<string>();

    constructor(
        private readonly ma: () => MusicAssistantClient | undefined,
        private readonly labels: () => LibraryLabels,
    ) {}

    /** A view of this source that only shows `filter`'s providers (for one dial's settings). */
    filtered(filter: () => ProviderFilter): BrowseSource {
        return { list: (path) => this.list(path, filter()) };
    }

    async list(path: string, filter?: ProviderFilter): Promise<BrowseEntry[]> {
        const ma = this.ma();
        if (!ma?.isConnected) throw new Error("not connected");
        if (path === LIBRARY_ROOT) return this.libraryRoot();
        if (path === "mac:favorites") return this.favorites(ma, filter);
        if (path === IN_PROGRESS) return ((await ma.send<MediaItem[]>("music/in_progress_items", { limit: 50 })) ?? []).map(toEntry);
        if (path.startsWith("mac:lib:")) return this.libraryItems(ma, path.slice("mac:lib:".length) as LibraryMediaType, false, filter);

        const real = path === PROVIDERS_ROOT ? undefined : path;
        try {
            const items = await ma.send<MediaItem[]>("music/browse", real ? { path: real } : {});
            const entries = (items ?? [])
                .filter((i) => i.name !== "..")
                .map(toEntry)
                .filter((e) => !(path === PROVIDERS_ROOT && e.path && (this.unbrowsable.has(providerOf(e.path)) || (filter && !filter.has(providerOf(e.path))))));
            return path === PROVIDERS_ROOT ? [this.inProgressFolder(), ...entries] : entries;
        } catch (e) {
            if (real) this.unbrowsable.add(providerOf(real));
            throw e;
        }
    }

    private libraryRoot(): BrowseEntry[] {
        const l = this.labels();
        const folder = (name: string, path: string, mediaType: string): BrowseEntry => ({ name, path, mediaType, isFolder: true, playable: false });
        return [
            this.inProgressFolder(),
            folder(l.favorites, "mac:favorites", "favorites"),
            ...(["playlist", "album", "radio", "podcast", "audiobook", "track"] as const).map((t) => folder(l[t], `mac:lib:${t}`, t)),
        ];
    }

    private inProgressFolder(): BrowseEntry {
        return { name: this.labels().inProgress, path: IN_PROGRESS, mediaType: "in_progress", isFolder: true, playable: false };
    }

    private async favorites(ma: MusicAssistantClient, filter: ProviderFilter): Promise<BrowseEntry[]> {
        const types: LibraryMediaType[] = ["playlist", "album", "radio", "podcast", "audiobook", "track"];
        const lists = await Promise.all(types.map((t) => this.libraryItems(ma, t, true, filter).catch(() => [])));
        return lists.flat();
    }

    private async libraryItems(ma: MusicAssistantClient, type: LibraryMediaType, favoritesOnly: boolean, filter: ProviderFilter): Promise<BrowseEntry[]> {
        const command = LIBRARY_COMMANDS[type];
        if (!command) return [];
        const items = await ma.send<MediaItem[]>(command, { limit: 250, ...(favoritesOnly ? { favorite: true } : {}) });
        return (items ?? []).filter((i) => fromProviders(i, filter)).map(toEntry);
    }
}

/** A library item counts when any of its provider mappings is an allowed provider instance. */
function fromProviders(item: MediaItem, filter: ProviderFilter): boolean {
    if (!filter) return true;
    const mappings = (item.provider_mappings as { provider_instance?: string }[] | undefined) ?? [];
    return mappings.some((m) => !!m.provider_instance && filter.has(m.provider_instance));
}

function providerOf(path: string): string {
    return path.split("://")[0];
}

export function toEntry(item: MediaItem): BrowseEntry {
    const isFolder = item.media_type === "folder";
    // Full items carry metadata.images; item mappings (e.g. in-progress lists) a single `image`
    const image = item.metadata?.images?.find((i) => i.type === "thumb") ?? item.metadata?.images?.[0] ?? (item.image as { proxy_id?: string } | null | undefined);
    const artists = (item.artists as { name: string }[] | undefined)?.map((a) => a.name).filter(Boolean);
    return {
        name: item.name.trim(),
        path: isFolder ? ((item.path as string | undefined) ?? item.uri) : undefined,
        uri: item.uri,
        mediaType: item.media_type,
        isFolder,
        playable: item.media_type === "folder" ? item.is_playable === true : item.is_playable !== false,
        imageProxyId: image?.proxy_id,
        // Artists for albums and tracks; who made it for playlists (e.g. "Spotify" or a user)
        subtitle: artists?.length ? artists.join(", ") : typeof item.owner === "string" && item.owner ? item.owner : undefined,
    };
}
