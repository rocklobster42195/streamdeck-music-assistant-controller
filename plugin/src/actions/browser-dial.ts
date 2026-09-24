import { action } from "@elgato/streamdeck";
import { mdiChevronRight, mdiFolderMusic, mdiFolderOutline, mdiHeart, mdiWaveform } from "@mdi/js";
import { type BrowseEntry, BrowserModel, LIBRARY_ROOT, MaBrowseSource, PROVIDERS_ROOT } from "../ma/browser";
import { maConnection } from "../ma/connection";
import { getCachedCover, loadCover } from "../render/cover-cache";
import { ACCENT, ICONS } from "../render/key-image";
import { image, mdi, stripImage, text, wrap } from "../render/strip";
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
        return { image: this.renderBrowse(ctx.id, st, flash), preview: { track: st.model.breadcrumb.join(" › ") } };
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

    // ---- rendering ------------------------------------------------------------------------------

    private renderIdle({ id, ma, player }: PlayerContext<BrowserDialSettings>, flash: State["flash"]): string {
        const media = player.current_media;
        const cover = this.cover(id, ma, media);
        const parts: string[] = [];
        if (cover) parts.push(image(cover, 8, 18, 64, 64));
        else parts.push(`<rect x="8" y="18" width="64" height="64" rx="6" fill="#1d1d20"/>`, mdi(mdiFolderMusic, 20, 30, 40, "#6c6c72"));
        const title = flash?.text ?? media?.title ?? this.t("key.nothing_playing");
        wrap(title, 112, 13, 2).forEach((line, i) => parts.push(text(82, 40 + i * 16, line, { size: 13, weight: "bold", color: flash?.color ?? "#ffffff" })));
        parts.push(text(82, 78, this.t("key.browse_hint"), { size: 11, color: "#8a8a90", maxWidth: 112 }));
        return stripImage(parts);
    }

    private renderBrowse(id: string, st: State, flash: State["flash"]): string {
        const m = st.model;
        const parts: string[] = [];
        // Breadcrumb: the last two levels
        const crumbs = m.breadcrumb;
        const shown = crumbs.length > 2 ? ["…", ...crumbs.slice(-2)] : crumbs;
        parts.push(text(8, 14, shown.join(" › "), { size: 10, color: "#8a8a90", maxWidth: 184 }));

        if (flash) {
            parts.push(text(100, 60, flash.text, { size: 13, weight: "bold", color: flash.color, anchor: "middle", maxWidth: 184 }));
            return stripImage(parts);
        }
        if (m.loading) {
            parts.push(text(100, 60, this.t("key.browse_loading"), { size: 13, color: "#a4a4aa", anchor: "middle" }));
            return stripImage(parts);
        }
        const entry = m.current;
        if (!entry) {
            parts.push(text(100, 60, this.t("key.browse_empty"), { size: 13, color: "#a4a4aa", anchor: "middle" }));
            return stripImage(parts);
        }

        // Thumbnail or type icon
        const thumb = this.thumb(id, entry);
        if (thumb) parts.push(image(thumb, 8, 24, 56, 56));
        else parts.push(`<rect x="8" y="24" width="56" height="56" rx="6" fill="#1d1d20"/>`, mdi(entryIcon(entry), 20, 36, 32, entry.isFolder ? ACCENT : "#8a8a90"));

        // Name (2 lines) and subtitle
        const lines = wrap(entry.name, 112, 13, 2);
        lines.forEach((line, i) => parts.push(text(72, 40 + i * 15, line, { size: 13, weight: "bold" })));
        const sub = entry.subtitle ?? (entry.isFolder ? "" : this.t(`pi.type_${entry.mediaType}`).replace(/^pi\.type_.*/, ""));
        if (sub) parts.push(text(72, 40 + lines.length * 15 + 2, sub, { size: 11, color: "#a4a4aa", maxWidth: 104 }));

        // Position and "has more inside" chevron
        const { index, total } = m.position;
        parts.push(text(192, 94, `${index} / ${total}`, { size: 10, color: "#8a8a90", anchor: "end" }));
        if (entry.isFolder) parts.push(mdi(mdiChevronRight, 176, 42, 20, "#8a8a90"));
        // Scroll indicator on the right edge
        if (total > 1) {
            const h = Math.max(8, 70 / total);
            const y = 22 + ((70 - h) * (index - 1)) / (total - 1);
            parts.push(`<rect x="196" y="22" width="2" height="70" rx="1" fill="#2c2c30"/>`, `<rect x="196" y="${y.toFixed(1)}" width="2" height="${h.toFixed(1)}" rx="1" fill="#6c6c72"/>`);
        }
        return stripImage(parts);
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

function entryIcon(entry: BrowseEntry): string {
    if (entry.isFolder) return entry.mediaType === "favorites" ? mdiHeart : mdiFolderOutline;
    switch (entry.mediaType) {
        case "radio":
            return ICONS.radio;
        case "playlist":
            return ICONS.playlist;
        case "album":
            return ICONS.album;
        case "podcast":
        case "podcast_episode":
            return ICONS.podcast;
        case "sound_effect":
            return mdiWaveform;
        default:
            return ICONS.note;
    }
}
