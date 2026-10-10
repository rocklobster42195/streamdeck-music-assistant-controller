import { action } from "@elgato/streamdeck";
import { type BrowseEntry, BrowserModel, LIBRARY_ROOT, MaBrowseSource, PROVIDERS_ROOT } from "../ma/browser";
import { maConnection } from "../ma/connection";
import { getCachedCover, ListController, type ListRow, loadCover, nowPlayingCard } from "@rocklobster42195/streamdeck-kit";
import { entryIcon, messageStrip } from "../render/browser-strip";
import { ACCENT } from "../render/key-image";
import { MaDialAction, type StripRender } from "./ma-dial-action";
import type { MaKeySettings, PlayerContext } from "./ma-key-action";

type BrowserDialSettings = MaKeySettings & {
    start?: "providers" | "library";
    /** What pushing a folder that is also playable does. */
    folderAction?: "open" | "play";
    /** Seconds without input until the dial returns to "now playing". */
    timeout?: number;
    option?: "replace" | "next" | "add";
    /** Music provider instances to show (e.g. only Spotify); unset = all. */
    providers?: string[];
    /** false: icons only in the list. */
    showCovers?: boolean;
};

type State = {
    model: BrowserModel;
    browsing: boolean;
    idleTimer?: ReturnType<typeof setTimeout>;
    flash?: { text: string; color: string; until: number };
    startKey?: string;
    /** The scrolling list of the current level (kit). */
    list: ListController;
    /** The level the list was set up for (a new one resets it). */
    level?: unknown;
    /** Just started from the dial: shown as playing until MA reports it. */
    pending?: { uri: string; until: number };
};

const THUMB = 160;
/** List rows draw covers at 32 px; 80 is MA's smallest proxy size above that. */
const ROW_THUMB = 80;

/**
 * Browse every provider (or your library) with the dial.
 * Rotate: scroll · Push: open folder / play · Touch: back (hold: back to start).
 * Idle, it shows what is playing; the first turn starts browsing where you left off.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.browser-dial" })
export class BrowserDial extends MaDialAction<BrowserDialSettings> {
    private readonly states = new Map<string, State>();
    private readonly source = new MaBrowseSource(
        () => maConnection.ma,
        () => ({
            favorites: this.t("key.browse_favorites"),
            inProgress: this.t("key.browse_in_progress"),
            playlist: this.t("pi.filter_playlist"),
            album: this.t("pi.filter_album"),
            radio: this.t("pi.filter_radio"),
            podcast: this.t("pi.filter_podcast"),
            audiobook: this.t("pi.filter_audiobook"),
            track: this.t("pi.filter_track"),
        }),
    );

    protected override renderPlayer(ctx: PlayerContext<BrowserDialSettings>): StripRender {
        const st = this.state(ctx.id);
        const flash = st.flash && st.flash.until > Date.now() ? st.flash : undefined;
        if (!st.browsing) return { image: this.renderIdle(ctx, flash) };
        return { image: this.renderBrowse(ctx, st, flash, this.backdrop(ctx)), preview: { track: st.model.breadcrumb.join(" › ") } };
    }

    protected override async rotate(ctx: PlayerContext<BrowserDialSettings>, ticks: number): Promise<void> {
        const st = this.state(ctx.id);
        this.touchIdleTimer(ctx);
        if (!st.browsing) {
            await this.beginBrowsing(ctx);
            return;
        }
        st.list.rotate(ticks);
    }

    protected override async push(ctx: PlayerContext<BrowserDialSettings>): Promise<void> {
        const st = this.state(ctx.id);
        this.touchIdleTimer(ctx);
        if (!st.browsing) return this.beginBrowsing(ctx);
        this.syncCursor(st);
        const entry = st.model.current;
        if (!entry) return;
        const play = entry.playable && (!entry.isFolder || ctx.settings.folderAction === "play");
        if (entry.isFolder && !play) {
            await st.model.enter();
            if (st.model.error) this.showError(ctx.id, st);
            return;
        }
        if (!entry.uri) throw new Error("entry has no uri");
        await ctx.ma.playMedia(ctx.queue?.queue_id ?? maConnection.leaderId(ctx.player), entry.uri, ctx.settings.option ?? "replace");
        // The list stays open; the row shows as playing right away (MA confirms it a moment later)
        st.pending = { uri: entry.uri, until: Date.now() + 8000 };
        this.render(ctx.id);
    }

    protected override async touch(ctx: PlayerContext<BrowserDialSettings>, hold: boolean): Promise<void> {
        const st = this.state(ctx.id);
        this.touchIdleTimer(ctx);
        if (!st.browsing) return this.beginBrowsing(ctx);
        if (hold) {
            await this.beginBrowsing(ctx, true);
            return;
        }
        this.syncCursor(st);
        if (!st.model.back()) this.stopBrowsing(ctx.id);
    }

    /** The model's cursor follows the list's marked row (push and back read it). */
    private syncCursor(st: State): void {
        const l = st.model.level;
        const marked = st.list.marked;
        if (l && marked >= 0 && marked !== l.index) st.model.rotate(marked - l.index);
    }

    // ---- state ----------------------------------------------------------------------------------

    private state(id: string): State {
        let st = this.states.get(id);
        if (!st) {
            const filter = () => {
                const list = this.instances.get(id)?.settings.providers;
                return Array.isArray(list) ? new Set(list) : undefined;
            };
            st = { model: new BrowserModel(this.source.filtered(filter), () => this.render(id)), browsing: false, list: new ListController({ id, redraw: () => this.render(id) }) };
            this.states.set(id, st);
        }
        return st;
    }

    private async beginBrowsing(ctx: PlayerContext<BrowserDialSettings>, restart = false): Promise<void> {
        const st = this.state(ctx.id);
        st.browsing = true;
        const start = ctx.settings.start ?? "providers";
        // Resume where the user left off, unless the start point changed or a restart was asked for
        if (restart || !st.model.depth || st.startKey !== start) {
            st.startKey = start;
            await st.model.start(start === "library" ? LIBRARY_ROOT : PROVIDERS_ROOT, this.t(start === "library" ? "key.browse_library" : "key.browse_providers"));
        } else {
            this.render(ctx.id);
        }
    }

    private stopBrowsing(id: string, afterMs = 0): void {
        const st = this.state(id);
        clearTimeout(st.idleTimer);
        const stop = () => {
            st.browsing = false;
            st.level = undefined;
            st.list.dispose();
            this.render(id);
        };
        if (afterMs) st.idleTimer = setTimeout(stop, afterMs);
        else stop();
    }

    private touchIdleTimer(ctx: PlayerContext<BrowserDialSettings>): void {
        const st = this.state(ctx.id);
        clearTimeout(st.idleTimer);
        const seconds = Math.max(5, Math.min(120, ctx.settings.timeout ?? 20));
        st.idleTimer = setTimeout(() => this.stopBrowsing(ctx.id), seconds * 1000);
    }

    private flash(id: string, value: string, color: string, ms = 1500): void {
        const st = this.state(id);
        st.flash = { text: value, color, until: Date.now() + ms };
        this.render(id);
        setTimeout(() => this.render(id), ms + 50);
    }

    private showError(id: string, st: State): void {
        this.flash(id, this.t("key.browse_unavailable"), "#ff8a8a");
        st.model.error = undefined;
    }

    // ---- rendering (layouts in render/browser-strip.ts) ----------------------------------------------

    private renderIdle(ctx: PlayerContext<BrowserDialSettings>, flash: State["flash"]): string {
        const { id, ma, player, queue } = ctx;
        const media = player.current_media;
        // Started from a playlist, album, …: show that (a browser is about where the music comes from)
        const from = (queue?.sources as { name?: string; media_type?: string; image?: { proxy_id?: string } | null }[] | undefined)?.[0];
        const kind = from?.media_type ? this.t(`pi.type_${from.media_type}`) : "";
        const source = from?.name && from.media_type !== "track" && !kind.startsWith("pi.")
            ? { kind, name: from.name, track: [media?.title, media?.artist].filter(Boolean).join(" · ") }
            : undefined;
        const sourceCover = source && from?.image?.proxy_id ? this.thumbFor(id, from.image.proxy_id) : undefined;
        return nowPlayingCard({
            cover: sourceCover ?? this.cover(id, ma, media),
            title: media?.title ?? this.t("key.nothing_playing"),
            artist: media?.artist ?? undefined,
            source,
            flash,
            hint: this.t("key.browse_hint"),
            backdrop: this.backdrop(ctx),
        });
    }

    private renderBrowse(ctx: PlayerContext<BrowserDialSettings>, st: State, flash: State["flash"], backdrop: string): string {
        const m = st.model;
        const level = m.level;
        if (flash) return messageStrip(flash.text, flash.color, backdrop);
        const base = { row: () => undefined, accent: ACCENT, backdrop };
        if (m.loading || !level) return st.list.render({ ...base, state: "loading" });
        const playing = this.playingUris(ctx, st);
        if (st.level !== level) {
            st.level = level;
            st.list.reset(level.items.length, this.startIndex(level, playing), m.breadcrumb.join(" › "));
        }
        if (!level.items.length) return st.list.render({ ...base, state: { message: this.t("key.browse_empty") } });
        return st.list.render({ ...base, row: (i) => this.row(ctx.id, level.items[i], playing), showImages: ctx.settings.showCovers !== false });
    }

    private row(id: string, entry: BrowseEntry | undefined, playing: Set<string>): ListRow | undefined {
        if (!entry) return undefined;
        // Unknown media types have no translation — then show nothing rather than the raw key
        const type = entry.isFolder ? "" : this.t(`pi.type_${entry.mediaType}`);
        return {
            title: entry.name,
            subtitle: entry.subtitle ?? (type && !type.startsWith("pi.") ? type : undefined),
            image: entry.imageProxyId ? this.thumbFor(id, entry.imageProxyId, ROW_THUMB) : undefined,
            icon: entryIcon(entry),
            folder: entry.isFolder,
            // Playable entries only (a playlist, an album); plain navigation folders never count
            active: entry.playable && !!entry.uri && playing.has(entry.uri),
        };
    }

    /** What counts as playing: the current track, the source the queue was started from, a fresh push. */
    private playingUris(ctx: PlayerContext<BrowserDialSettings>, st: State): Set<string> {
        const uris = new Set<string>();
        const add = (uri: unknown) => typeof uri === "string" && uri && uris.add(uri);
        add(ctx.player.current_media?.uri);
        add((ctx.queue?.sources as { uri?: string }[] | undefined)?.[0]?.uri);
        if (st.pending && st.pending.until > Date.now()) add(st.pending.uri);
        return uris;
    }

    /** A level opens on its playing entry; going back keeps where you were. */
    private startIndex(level: { items: BrowseEntry[]; index: number }, playing: Set<string>): number {
        if (level.index > 0) return level.index;
        const i = level.items.findIndex((e) => e.playable && !!e.uri && playing.has(e.uri));
        return Math.max(0, i);
    }

    private thumbFor(id: string, proxyId: string, size = THUMB): string | undefined {
        const ma = maConnection.ma;
        if (!ma) return undefined;
        const url = ma.imageProxyUrl(proxyId, size);
        const hit = getCachedCover(url);
        if (!hit) void loadCover(url).then((c) => c && this.render(id));
        return hit;
    }
}
