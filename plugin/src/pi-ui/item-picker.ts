// <mac-item-picker> — choose any MA item (playlist, album, radio, podcast, track, audiobook) for Play Item.
// Shows the chosen item as a card; "Change" opens a library browser with search, type filters and
// favorites as the starting point. Stores uri/name/subtitle/mediaType/imageProxyId in the action settings.
import { escapeHtml, icon, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { LibraryFilter, LibraryItem, PiPush } from "../pi/protocol";
import { onPiState, piState, nextRequestId } from "./state";

const FILTERS: LibraryFilter[] = ["all", "playlist", "album", "radio", "podcast", "track", "audiobook"];

export class MacItemPicker extends HTMLElement {
    private browsing = false;
    private query = "";
    private filter: LibraryFilter = "all";
    private requestId = 0;
    private results: { items: LibraryItem[]; favorites: boolean; error?: string } | undefined;
    private loading = false;
    private debounce: ReturnType<typeof setTimeout> | undefined;
    private offs: (() => void)[] = [];

    connectedCallback(): void {
        this.classList.add("mac-item-picker");
        this.innerHTML = `
            <div class="mac-item-selected"></div>
            <div class="mac-browser" hidden>
                <label class="mac-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
                    <input type="search" class="pi-input" spellcheck="false" autocomplete="off" placeholder="${escapeHtml(t("pi.item_search_placeholder"))}" aria-label="${escapeHtml(t("pi.item_search_placeholder"))}"/>
                </label>
                <div class="mac-chips" role="group" aria-label="${escapeHtml(t("pi.item_filter"))}">
                    ${FILTERS.map((f) => `<button type="button" class="mac-chip" data-filter="${f}">${escapeHtml(t(`pi.filter_${f}`))}</button>`).join("")}
                </div>
                <div class="mac-results-head"></div>
                <div class="mac-results" role="listbox"></div>
            </div>`;

        const input = this.querySelector<HTMLInputElement>(".mac-search input")!;
        input.addEventListener("input", () => {
            this.query = input.value;
            clearTimeout(this.debounce);
            this.debounce = setTimeout(() => this.search(), 300);
        });
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                clearTimeout(this.debounce);
                this.search();
            }
        });
        this.querySelectorAll<HTMLElement>(".mac-chip").forEach((chip) =>
            chip.addEventListener("click", () => {
                this.filter = chip.dataset.filter as LibraryFilter;
                this.search();
            }),
        );

        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event !== "library-results" || msg.requestId !== this.requestId) return;
                this.loading = false;
                this.results = msg;
                this.renderBrowser();
            }),
            sd.onSettings(() => this.renderSelected()),
            onPiState(() => {
                this.renderSelected();
                // First connection while the browser is open and empty → load favorites
                if (this.browsing && !this.results && !this.loading && piState.status?.state === "connected") this.search();
            }),
        );

        // Nothing chosen yet → start in the browser
        this.browsing = !sd.settings.uri;
        this.renderSelected();
        this.renderBrowser();
        if (this.browsing) this.search();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
        clearTimeout(this.debounce);
    }

    private search(): void {
        if (piState.status && piState.status.state !== "connected") return;
        this.requestId = nextRequestId();
        this.loading = true;
        this.renderBrowser();
        sd.sendToPlugin({ event: "library-search", requestId: this.requestId, query: this.query, filter: this.filter });
    }

    private choose(item: LibraryItem): void {
        sd.setSettings({ uri: item.uri, name: item.name, subtitle: item.subtitle ?? "", mediaType: item.mediaType, imageProxyId: item.imageProxyId ?? "" });
        this.browsing = false;
        this.renderSelected();
        this.renderBrowser();
    }

    private renderSelected(): void {
        const box = this.querySelector<HTMLElement>(".mac-item-selected")!;
        const s = sd.settings as Record<string, string | undefined>;
        if (!s.uri) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        const base = piState.status?.url;
        const thumb = s.imageProxyId && base ? `${base}/imageproxy/${s.imageProxyId}?size=160` : "";
        box.innerHTML = `
            <div class="mac-item-thumb mac-item-thumb-lg">${thumb ? `<img src="${escapeHtml(thumb)}" alt=""/>` : typeGlyph(s.mediaType)}</div>
            <div class="pi-select-text">
                <span class="pi-strong">${escapeHtml(s.name ?? s.uri)}</span>
                <span class="pi-option-sub">${escapeHtml([typeLabel(s.mediaType), s.subtitle].filter(Boolean).join(" · "))}</span>
            </div>
            <button type="button" class="pi-button pi-button-small">${escapeHtml(t(this.browsing ? "pi.done" : "pi.change"))}</button>`;
        box.querySelector("button")!.addEventListener("click", () => {
            this.browsing = !this.browsing;
            this.renderSelected();
            this.renderBrowser();
            if (this.browsing && !this.results) this.search();
            if (this.browsing) this.querySelector<HTMLInputElement>(".mac-search input")?.focus();
        });
    }

    private renderBrowser(): void {
        const browser = this.querySelector<HTMLElement>(".mac-browser")!;
        browser.hidden = !this.browsing;
        if (!this.browsing) return;
        this.querySelectorAll<HTMLElement>(".mac-chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === this.filter)));

        const head = this.querySelector<HTMLElement>(".mac-results-head")!;
        const list = this.querySelector<HTMLElement>(".mac-results")!;
        if (this.loading) {
            head.textContent = t("pi.item_loading");
            list.innerHTML = Array.from({ length: 4 }, () => `<div class="mac-result mac-result-skeleton"><div class="mac-item-thumb"></div><div class="pi-select-text"><span></span><span></span></div></div>`).join("");
            return;
        }
        const r = this.results;
        if (!r) {
            head.textContent = "";
            list.innerHTML = "";
            return;
        }
        head.textContent = r.error ? t("pi.item_error") : r.favorites ? t("pi.item_favorites") : t("pi.item_results");
        if (!r.items.length) {
            list.innerHTML = `<div class="pi-hint mac-results-empty">${escapeHtml(t(r.favorites ? "pi.item_no_favorites" : "pi.item_no_results"))}</div>`;
            return;
        }
        const current = String(sd.settings.uri ?? "");
        list.innerHTML = r.items
            .map(
                (item, i) => `
            <button type="button" class="mac-result" role="option" data-i="${i}" aria-selected="${item.uri === current}">
                <div class="mac-item-thumb">${item.thumbUrl ? `<img src="${escapeHtml(item.thumbUrl)}" alt="" loading="lazy"/>` : typeGlyph(item.mediaType)}</div>
                <div class="pi-select-text">
                    <span class="pi-label">${escapeHtml(item.name)}</span>
                    <span class="pi-option-sub">${escapeHtml([typeLabel(item.mediaType), item.subtitle].filter(Boolean).join(" · "))}</span>
                </div>
                <span class="pi-option-check">${item.uri === current ? icon("check", 14) : ""}</span>
            </button>`,
            )
            .join("");
        list.querySelectorAll<HTMLElement>(".mac-result").forEach((el) => el.addEventListener("click", () => this.choose(r.items[Number(el.dataset.i)])));
    }
}

function typeLabel(mediaType: string | undefined): string {
    return mediaType ? t(`pi.type_${mediaType}`) : "";
}

function typeGlyph(mediaType: string | undefined): string {
    const letter = (typeLabel(mediaType) || "?").charAt(0).toUpperCase();
    return `<span class="mac-item-glyph">${escapeHtml(letter)}</span>`;
}
