import { action } from "@elgato/streamdeck";
import { mdiPlaylistPlay } from "@mdi/js";
import type { QueueItem } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { PagedList } from "../ma/paged-list";
import { getCachedCover, loadCover } from "../render/cover-cache";
import { ACCENT, ICONS } from "../render/key-image";
import { image, mdi, stripImage, text, wrap } from "../render/strip";
import { MaDialAction, type StripRender } from "./ma-dial-action";
import type { MaKeySettings, PlayerContext } from "./ma-key-action";

type QueueDialSettings = MaKeySettings & {
    /** Seconds without input until the dial returns to the current track. */
    timeout?: number;
};

type State = {
    browsing: boolean;
    cursor: number;
    queueId?: string;
    list?: PagedList<QueueItem>;
    idleTimer?: ReturnType<typeof setTimeout>;
    flash?: { text: string; until: number };
};

const THUMB = 160;

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
            for (const st of this.states.values()) if (st.queueId === ev.object_id) st.list?.invalidate();
        });
    }

    protected override renderPlayer(ctx: PlayerContext<QueueDialSettings>): StripRender {
        const st = this.state(ctx);
        const queue = ctx.queue;
        const total = queue?.items ?? 0;
        const current = queue?.current_index ?? 0;
        const flash = st.flash && st.flash.until > Date.now() ? st.flash : undefined;
        const index = st.browsing ? st.cursor : current;
        const item = total ? st.list?.get(index) : undefined;
        const parts: string[] = [];

        // Header: "Queue · 5 / 12"
        parts.push(text(8, 14, `${this.t("key.queue")} · ${total ? `${index + 1} / ${total}` : "0"}`, { size: 10, color: "#8a8a90", maxWidth: 184 }));

        if (flash) {
            parts.push(text(100, 60, flash.text, { size: 13, weight: "bold", color: ACCENT, anchor: "middle", maxWidth: 184 }));
            return { image: stripImage(parts) };
        }
        if (!total) {
            parts.push(mdi(mdiPlaylistPlay, 20, 32, 40, "#5a5a60"), text(72, 58, this.t("key.queue_empty"), { size: 13, color: "#a4a4aa", maxWidth: 120 }));
            return { image: stripImage(parts) };
        }
        if (!item) {
            parts.push(text(100, 60, this.t("key.browse_loading"), { size: 13, color: "#a4a4aa", anchor: "middle" }));
            return { image: stripImage(parts) };
        }

        const played = index < current;
        const thumb = this.thumb(ctx.id, item);
        if (thumb) parts.push(image(thumb, 8, 24, 56, 56));
        else parts.push(`<rect x="8" y="24" width="56" height="56" rx="6" fill="#1d1d20"/>`, mdi(ICONS.note, 20, 36, 32, "#6c6c72"));
        if (played) parts.push(`<rect x="8" y="24" width="56" height="56" fill="#000" opacity="0.5"/>`);

        const lines = wrap(item.name, 112, 13, 2);
        lines.forEach((line, i) => parts.push(text(72, 38 + i * 15, line, { size: 13, weight: "bold", color: played ? "#8a8a90" : "#ffffff" })));
        const artists = (item.media_item?.artists as { name: string }[] | undefined)?.map((a) => a.name).join(", ");
        if (artists) parts.push(text(72, 38 + lines.length * 15 + 1, artists, { size: 11, color: "#a4a4aa", maxWidth: 112 }));

        // Where this item sits relative to what is playing
        const tag = index === current ? `▶ ${this.t("key.queue_now")}` : index === current + 1 ? this.t("key.queue_next") : played ? this.t("key.queue_played") : "";
        if (tag) parts.push(text(72, 92, tag, { size: 10, weight: "bold", color: index === current ? ACCENT : "#8a8a90", maxWidth: 112 }));

        if (total > 1) {
            const h = Math.max(6, 70 / total);
            const y = 22 + ((70 - h) * index) / (total - 1);
            parts.push(`<rect x="196" y="22" width="2" height="70" rx="1" fill="#2c2c30"/>`, `<rect x="196" y="${y.toFixed(1)}" width="2" height="${h.toFixed(1)}" rx="1" fill="#6c6c72"/>`);
        }
        return { image: stripImage(parts), preview: { track: item.name } };
    }

    protected override async rotate(ctx: PlayerContext<QueueDialSettings>, ticks: number): Promise<void> {
        const st = this.state(ctx);
        const total = ctx.queue?.items ?? 0;
        if (!total) return;
        if (!st.browsing) {
            st.browsing = true;
            st.cursor = ctx.queue?.current_index ?? 0;
        }
        st.cursor = Math.min(total - 1, Math.max(0, st.cursor + ticks));
        this.armIdle(ctx);
        this.render(ctx.id);
    }

    protected override async push(ctx: PlayerContext<QueueDialSettings>): Promise<void> {
        const st = this.state(ctx);
        if (!st.browsing || !ctx.queue) return;
        const item = st.list?.get(st.cursor);
        await ctx.ma.playIndex(ctx.queue.queue_id, st.cursor);
        st.flash = { text: `▶ ${item?.name ?? st.cursor + 1}`, until: Date.now() + 1500 };
        st.browsing = false;
        clearTimeout(st.idleTimer);
        this.render(ctx.id);
        setTimeout(() => this.render(ctx.id), 1550);
    }

    protected override async touch(ctx: PlayerContext<QueueDialSettings>): Promise<void> {
        const st = this.state(ctx);
        st.browsing = false;
        clearTimeout(st.idleTimer);
        this.render(ctx.id);
    }

    private state(ctx: PlayerContext<QueueDialSettings>): State {
        let st = this.states.get(ctx.id);
        if (!st) {
            st = { browsing: false, cursor: 0 };
            this.states.set(ctx.id, st);
        }
        // (Re)bind to the queue the player uses right now
        const queueId = ctx.queue?.queue_id;
        if (queueId && st.queueId !== queueId) {
            st.queueId = queueId;
            st.browsing = false;
            st.list = new PagedList<QueueItem>((offset, limit) => ctx.ma.queueItems(queueId, limit, offset), () => this.render(ctx.id));
        }
        return st;
    }

    private armIdle(ctx: PlayerContext<QueueDialSettings>): void {
        const st = this.state(ctx);
        clearTimeout(st.idleTimer);
        const seconds = Math.max(3, Math.min(60, ctx.settings.timeout ?? 10));
        st.idleTimer = setTimeout(() => {
            st.browsing = false;
            this.render(ctx.id);
        }, seconds * 1000);
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
