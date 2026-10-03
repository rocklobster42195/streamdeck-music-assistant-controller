import { action } from "@elgato/streamdeck";
import type { MA } from "music-assistant-client";

type QueueItem = MA.QueueItem;
import { maConnection } from "../ma/connection";
import { PagedList } from "../ma/paged-list";
import { getCachedCover, ListController, type ListRow, loadCover } from "@rocklobster42195/streamdeck-kit";
import { ACCENT, ICONS } from "../render/key-image";
import { MaDialAction, type StripRender } from "./ma-dial-action";
import type { MaKeySettings, PlayerContext } from "./ma-key-action";

type QueueDialSettings = MaKeySettings & {
    /** Seconds without input until the dial returns to the current track. */
    timeout?: number;
    /** false: icons only in the list. */
    showCovers?: boolean;
};

type State = {
    browsing: boolean;
    queueId?: string;
    items?: PagedList<QueueItem>;
    /** The scrolling list (kit); rests on the current track unless the user scrolls. */
    list: ListController;
    /** The current index the list last followed. */
    followed?: number;
    idleTimer?: ReturnType<typeof setTimeout>;
};

/** List rows draw covers at 32 px; 80 is MA's smallest proxy size above that. */
const THUMB = 80;

/**
 * Scroll through the queue and jump to any track.
 * Rotate: scroll (starting at the current track) · Push: play the selected track · Touch: back to the current track.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.queue-dial" })
export class QueueDial extends MaDialAction<QueueDialSettings> {
    private readonly states = new Map<string, State>();

    constructor() {
        super();
        // The queue changed (items added, reordered, replaced) → reload what we show
        maConnection.onServerEvent((ev) => {
            if (ev.event !== "queue_items_updated" && ev.event !== "queue_added") return;
            for (const st of this.states.values()) if (st.queueId === ev.object_id) st.items?.invalidate();
        });
    }

    protected override renderPlayer(ctx: PlayerContext<QueueDialSettings>): StripRender {
        const st = this.state(ctx);
        const total = ctx.queue?.items ?? 0;
        const current = ctx.queue?.current_index ?? 0;
        const base = { row: () => undefined, accent: ACCENT, backdrop: this.backdrop(ctx) };
        if (!total) {
            if (st.list.length) st.list.reset(0);
            return { image: st.list.render({ ...base, state: { message: this.t("key.queue_empty") } }) };
        }
        if (!st.list.length) {
            st.list.reset(total, current, this.t("key.queue"));
            st.followed = current;
        } else if (st.list.length !== total) {
            st.list.setLength(total);
        }
        // The track changed while nobody scrolls: glide along (after this render, not inside it)
        if (!st.browsing && st.followed !== current) {
            st.followed = current;
            queueMicrotask(() => st.list.moveTo(current));
        }
        const showImages = ctx.settings.showCovers !== false;
        const image = st.list.render({ ...base, showImages, row: (i) => this.row(ctx.id, st, i, current) });
        return { image, preview: { track: st.items?.get(st.list.marked)?.name } };
    }

    protected override async rotate(ctx: PlayerContext<QueueDialSettings>, ticks: number): Promise<void> {
        const st = this.state(ctx);
        if (!ctx.queue?.items) return;
        st.browsing = true;
        st.list.rotate(ticks);
        this.armIdle(ctx);
    }

    protected override async push(ctx: PlayerContext<QueueDialSettings>): Promise<void> {
        const st = this.state(ctx);
        if (!st.browsing || !ctx.queue) return;
        const index = st.list.marked;
        await ctx.ma.playIndex(ctx.queue.queue_id, index);
        // The list stays where it is; the playing colour moves there once MA reports the new track
        st.browsing = false;
        st.followed = index;
        clearTimeout(st.idleTimer);
    }

    protected override async touch(ctx: PlayerContext<QueueDialSettings>): Promise<void> {
        this.backToCurrent(ctx);
    }

    private backToCurrent(ctx: PlayerContext<QueueDialSettings>): void {
        const st = this.state(ctx);
        st.browsing = false;
        clearTimeout(st.idleTimer);
        st.list.moveTo(ctx.queue?.current_index ?? 0);
    }

    private row(id: string, st: State, i: number, current: number): ListRow {
        const item = st.items?.get(i);
        if (!item) return { title: "…", icon: ICONS.note };
        const artists = (item.media_item?.artists as { name: string }[] | undefined)?.map((a) => a.name).join(", ");
        // A queue item's name is "Artist - Title"; with the artists below, show the track's own name
        const title = artists && item.media_item?.name ? item.media_item.name : item.name;
        return { title, subtitle: artists || undefined, image: this.thumb(id, item), icon: ICONS.note, active: i === current };
    }

    private state(ctx: PlayerContext<QueueDialSettings>): State {
        let st = this.states.get(ctx.id);
        if (!st) {
            const id = ctx.id;
            st = { browsing: false, list: new ListController({ id, redraw: () => this.render(id) }) };
            this.states.set(ctx.id, st);
        }
        // (Re)bind to the queue the player uses right now
        const queueId = ctx.queue?.queue_id;
        if (queueId && st.queueId !== queueId) {
            st.queueId = queueId;
            st.browsing = false;
            st.list.reset(0);
            st.items = new PagedList<QueueItem>((offset, limit) => ctx.ma.queueItems(queueId, limit, offset), () => this.render(ctx.id));
        }
        return st;
    }

    private armIdle(ctx: PlayerContext<QueueDialSettings>): void {
        const st = this.state(ctx);
        clearTimeout(st.idleTimer);
        const seconds = Math.max(3, Math.min(60, ctx.settings.timeout ?? 10));
        st.idleTimer = setTimeout(() => this.backToCurrent(ctx), seconds * 1000);
    }

    private thumb(id: string, item: QueueItem): string | undefined {
        const ma = maConnection.ma;
        const proxyId = item.image?.proxy_id;
        if (!proxyId || !ma) return undefined;
        const url = ma.imageProxyUrl(proxyId, THUMB);
        const hit = getCachedCover(url);
        if (!hit) void loadCover(url).then((c) => c && this.render(id));
        return hit;
    }
}
