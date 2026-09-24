import streamDeck from "@elgato/streamdeck";
import type { MA } from "music-assistant-client";
import { maConnection } from "./connection";

type FavoriteInfo = { favorite: boolean; mediaType: MA.MediaType; libraryItemId?: string };

/**
 * Favorite status per media URI, looked up lazily via `music/item_by_uri` (provider URIs resolve to
 * the library item). Any library change event invalidates the cache; changes made by MAC are
 * reflected immediately.
 */
class FavoriteCache {
    private readonly cache = new Map<string, FavoriteInfo>();
    private readonly pending = new Set<string>();

    constructor() {
        maConnection.onServerEvent((ev) => {
            if (ev.event === "media_item_added" || ev.event === "media_item_updated" || ev.event === "media_item_deleted") this.cache.clear();
        });
    }

    /** Known status, or undefined while it is being looked up (a change notification follows). */
    get(uri: string): FavoriteInfo | undefined {
        const hit = this.cache.get(uri);
        if (!hit) void this.lookup(uri);
        return hit;
    }

    set(uri: string, info: FavoriteInfo): void {
        this.cache.set(uri, info);
    }

    private async lookup(uri: string): Promise<void> {
        const ma = maConnection.ma;
        if (!ma?.isConnected || this.pending.has(uri)) return;
        this.pending.add(uri);
        try {
            const item = await ma.itemByUri(uri);
            this.cache.set(uri, {
                favorite: !!item && "favorite" in item && !!item.favorite,
                mediaType: item?.media_type ?? "track",
                libraryItemId: item?.provider === "library" ? String(item.item_id) : undefined,
            });
            maConnection.notify();
        } catch (e) {
            streamDeck.logger.debug(`[favorites] lookup failed for ${uri}`, e);
        } finally {
            this.pending.delete(uri);
        }
    }
}

export const favorites = new FavoriteCache();
