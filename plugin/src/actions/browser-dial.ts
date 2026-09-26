import { action } from "@elgato/streamdeck";
import { type BrowseEntry, BrowserModel, LIBRARY_ROOT, MaBrowseSource, PROVIDERS_ROOT } from "../ma/browser";
import { maConnection } from "../ma/connection";
import { getCachedCover, loadCover } from "../render/cover-cache";
import { browserIdleStrip, browserStrip } from "../render/browser-strip";
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
};

type State = {
    model: BrowserModel;
    browsing: boolean;
    idleTimer?: ReturnType<typeof setTimeout>;
    flash?: { text: string; color: string; until: number };
    startKey?: string;
};

const THUMB = 160;

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
        return { image: this.renderBrowse(ctx.id, st, flash, this.backdrop(ctx)), preview: { track: st.model.breadcrumb.join(" › ") } };
    }

    protected override async rotate(ctx: PlayerContext<BrowserDialSettings>, ticks: number): Promise<void> {
        const st = this.state(ctx.id);
        this.touchIdleTimer(ctx);
        if (!st.browsing) {
            await this.beginBrowsing(ctx);
            return;
        }
        st.model.rotate(ticks);
    }

    protected override async push(ctx: PlayerContext<BrowserDialSettings>): Promise<void> {
        const st = this.state(ctx.id);
        this.touchIdleTimer(ctx);
        if (!st.browsing) return this.beginBrowsing(ctx);
        const entry = st.model.current;
        if (!entry) return;
        const play = entry.playable && (!entry.isFolder || ctx.settings.folderAction === "play");
        if (entry.isFolder && !play) {
            await st.model.enter();
            if (st.model.error) this.showError(ctx.id, st);
            return;
        }
        if (!entry.uri) throw new Error("entry has no uri");
        await ctx.ma.playMedia(ctx.queue?.queue_id ?? ctx.player.player_id, entry.uri, ctx.settings.option ?? "replace");
        this.flash(ctx.id, `▶ ${entry.name}`, ACCENT);
        this.stopBrowsing(ctx.id, 1500);
    }

    protected override async touch(ctx: PlayerContext<BrowserDialSettings>, hold: boolean): Promise<void> {
        const st = this.state(ctx.id);
        this.touchIdleTimer(ctx);
        if (!st.browsing) return this.beginBrowsing(ctx);
        if (hold) {
            await this.beginBrowsing(ctx, true);
            return;
        }
        if (!st.model.back()) this.stopBrowsing(ctx.id);
    }

    // ---- state ----------------------------------------------------------------------------------

    private state(id: string): State {
        let st = this.states.get(id);
        if (!st) {
            st = { model: new BrowserModel(this.source, () => this.render(id)), browsing: false };
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
        const { id, ma, player } = ctx;
        const media = player.current_media;
        return browserIdleStrip({ cover: this.cover(id, ma, media), title: media?.title ?? this.t("key.nothing_playing"), flash, hint: this.t("key.browse_hint"), backdrop: this.backdrop(ctx) });
    }

    private renderBrowse(id: string, st: State, flash: State["flash"], backdrop: string): string {
        const m = st.model;
        const entry = m.current;
        const typeLabel = entry && !entry.isFolder ? this.t(`pi.type_${entry.mediaType}`) : "";
        return browserStrip({
            breadcrumb: m.breadcrumb,
            flash,
            loading: m.loading,
            entry,
            thumb: entry ? this.thumb(id, entry) : undefined,
            position: m.position,
            // Unknown media types have no translation — then show nothing rather than the raw key
            subtitle: typeLabel.startsWith("pi.") ? undefined : typeLabel,
            texts: { loading: this.t("key.browse_loading"), empty: this.t("key.browse_empty") },
            backdrop,
        });
    }

    private thumb(id: string, entry: BrowseEntry): string | undefined {
        const ma = maConnection.ma;
        if (!entry.imageProxyId || !ma) return undefined;
        const url = ma.imageProxyUrl(entry.imageProxyId, THUMB);
        const hit = getCachedCover(url);
        if (!hit) void loadCover(url).then((c) => c && this.render(id));
        return hit;
    }
}
