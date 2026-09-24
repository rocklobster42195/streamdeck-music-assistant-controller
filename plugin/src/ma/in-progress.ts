import streamDeck from "@elgato/streamdeck";
import type { MediaItem } from "music-assistant-client";
import { maConnection } from "./connection";

/** An audiobook or podcast episode that was started but not finished. */
export type InProgressItem = {
    uri: string;
    name: string;
    mediaType: "audiobook" | "podcast_episode";
    imageProxyId?: string;
    /** 0..1 when MA knows the resume position (library items; not e.g. Internet Archive). */
    progress?: number;
};

export type InProgressKind = "any" | "audiobook" | "podcast_episode";

const REFRESH_AFTER_PLAY_MS = 3000;
const POLL_MS = 5 * 60_000;
const DETAILS_FOR = 5;

/**
 * MA's "continue listening" list (`music/in_progress_items`), newest first. Refreshed on connect,
 * shortly after playback reports (`media_item_played`), and every few minutes as a fallback.
 */
class InProgressList {
    private list: InProgressItem[] = [];
    private readonly listeners = new Set<() => void>();
    private loadedFor: unknown;
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private loading = false;

    constructor() {
        maConnection.onServerEvent((ev) => {
            if (ev.event === "media_item_played") this.refreshSoon(REFRESH_AFTER_PLAY_MS);
        });
        maConnection.onChange(() => {
            // New connection (or first one): load once it is up
            const ma = maConnection.ma;
            if (ma?.isConnected && this.loadedFor !== ma) {
                this.loadedFor = ma;
                this.refreshSoon(0);
            }
        });
        setInterval(() => this.listeners.size && this.refreshSoon(0), POLL_MS).unref?.();
    }

    /** Most recent item of this kind, if any. */
    latest(kind: InProgressKind = "any"): InProgressItem | undefined {
        return this.list.find((i) => kind === "any" || i.mediaType === kind);
    }

    all(): readonly InProgressItem[] {
        return this.list;
    }

    onUpdate(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    refreshSoon(ms: number): void {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => void this.refresh(), ms);
    }

    private async refresh(): Promise<void> {
        const ma = maConnection.ma;
        if (!ma?.isConnected || this.loading) return;
        this.loading = true;
        try {
            const items = (await ma.send<MediaItem[]>("music/in_progress_items", { limit: 20 })) ?? [];
            const list = items.filter((i) => i.media_type === "audiobook" || i.media_type === "podcast_episode").map(toItem);
            // The list has no positions: look them up for the first few (null for non-library items)
            await Promise.all(
                list.slice(0, DETAILS_FOR).map(async (item) => {
                    const full = await ma.itemByUri(item.uri).catch(() => undefined);
                    const pos = full && "resume_position_ms" in full ? full.resume_position_ms : undefined;
                    const duration = full && "duration" in full ? full.duration : undefined;
                    if (pos && duration) item.progress = Math.min(1, pos / 1000 / duration);
                }),
            );
            if (JSON.stringify(list) !== JSON.stringify(this.list)) {
                this.list = list;
                this.listeners.forEach((l) => l());
            }
        } catch (e) {
            streamDeck.logger.warn("[in-progress] refresh failed", e);
        } finally {
            this.loading = false;
        }
    }
}

function toItem(i: MediaItem): InProgressItem {
    const image = (i.image as { proxy_id?: string } | null | undefined) ?? i.metadata?.images?.[0];
    return { uri: i.uri, name: i.name, mediaType: i.media_type as InProgressItem["mediaType"], imageProxyId: image?.proxy_id };
}

export const inProgress = new InProgressList();
