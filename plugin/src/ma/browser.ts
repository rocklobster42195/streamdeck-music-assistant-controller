import type { MediaItem, MusicAssistantClient } from "music-assistant-client";
import type { LibraryMediaType } from "../pi/protocol";

/** One entry the browser dial can show. */
export type BrowseEntry = {
    name: string;
    /** Folder path to open (folders only). */
    path?: string;
    /** URI to play (playable entries only). */
    uri?: string;
    mediaType: string;
    isFolder: boolean;
    playable: boolean;
    imageProxyId?: string;
    subtitle?: string;
};

/** Where browsing starts. */
export type BrowseStart = "providers" | "library";

export const PROVIDERS_ROOT = "mac:providers";
export const LIBRARY_ROOT = "mac:library";

export interface BrowseSource {
    list(path: string): Promise<BrowseEntry[]>;
}

type Level = { path: string; name: string; items: BrowseEntry[]; index: number };

/**
 * Navigation state of the browser dial: a stack of levels, each with its items and a cursor.
 * Pure logic (no Stream Deck), driven by a {@link BrowseSource}.
 */
export class BrowserModel {
    private stack: Level[] = [];
    loading = false;
    error: string | undefined;
    private loadToken = 0;

    constructor(
        private readonly source: BrowseSource,
        private readonly onChange: () => void = () => {},
    ) {}

    get depth(): number {
        return this.stack.length;
    }

    get level(): Level | undefined {
        return this.stack.at(-1);
    }

    get current(): BrowseEntry | undefined {
        const l = this.level;
        return l?.items[l.index];
    }

    /** "3 / 24" style position (1-based). */
    get position(): { index: number; total: number } {
        const l = this.level;
        return { index: l ? l.index + 1 : 0, total: l?.items.length ?? 0 };
    }

    /** Names from the start level to the current one. */
    get breadcrumb(): string[] {
        return this.stack.map((l) => l.name);
    }

    async start(path: string, name: string): Promise<void> {
        this.stack = [];
        await this.open(path, name);
    }

    /** Move the cursor; clamps at both ends. */
    rotate(ticks: number): void {
        const l = this.level;
        if (!l || !l.items.length) return;
        l.index = Math.min(l.items.length - 1, Math.max(0, l.index + ticks));
        this.onChange();
    }

    /** Open the current entry if it is a folder. Returns false if it is not. */
    async enter(): Promise<boolean> {
        const entry = this.current;
        if (!entry?.isFolder || !entry.path) return false;
        await this.open(entry.path, entry.name);
        return true;
    }

    /** One level up. Returns false when already at the start level. */
    back(): boolean {
        if (this.stack.length <= 1) return false;
        this.stack.pop();
        this.error = undefined;
        this.loadToken++; // ignore a load that is still running for the level we left
        this.loading = false;
        this.onChange();
        return true;
    }

    private async open(path: string, name: string): Promise<void> {
        const token = ++this.loadToken;
        this.loading = true;
        this.error = undefined;
        this.onChange();
        try {
            const items = await this.source.list(path);
            if (token !== this.loadToken) return;
            this.stack.push({ path, name, items, index: 0 });
        } catch (e) {
            if (token !== this.loadToken) return;
            this.error = String((e as Error)?.message ?? e);
        } finally {
            if (token === this.loadToken) {
                this.loading = false;
                this.onChange();
            }
        }
    }
}

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
