// <mac-icon-picker setting="icon" [default-icon="mdiBullhorn"] [none-label="…"] [reset-label="…"] [hint="…"]>
// — pick a Material Design Icon for a key: a search field with
// suggestions as icon tiles (the search runs in the plugin, see render/mdi-catalog), the current
// choice with its preview, and a button back to the key's default icon.
import { escapeHtml, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import { nextRequestId } from "./state";
import type { OptionItem, PiPush } from "../pi/protocol";

const svg = (path: string, size: number) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="${escapeHtml(path)}"/></svg>`;

export class MacIconPicker extends HTMLElement {
    private requestId = 0;
    private results: OptionItem[] = [];
    private current: OptionItem | undefined;
    private query = "";
    private timer: ReturnType<typeof setTimeout> | undefined;
    private offs: (() => void)[] = [];

    private get key(): string {
        return this.getAttribute("setting") ?? "icon";
    }

    private get value(): string {
        return String(sd.settings[this.key] ?? "");
    }

    connectedCallback(): void {
        this.classList.add("mac-icon-picker");
        this.innerHTML = `
            <div class="pi-row">
                <span class="mac-icon-current"></span>
                <div class="pi-row-text"><span class="pi-label mac-icon-name"></span>${this.hasAttribute("hint") ? `<span class="pi-hint">${escapeHtml(t(this.getAttribute("hint")!))}</span>` : ""}</div>
                <button type="button" class="pi-button mac-icon-reset">${escapeHtml(t(this.getAttribute("reset-label") ?? "pi.icon_default"))}</button>
            </div>
            <div class="pi-row"><input class="pi-input mac-icon-search" type="search" placeholder="${escapeHtml(t("pi.icon_search"))}"/></div>
            <div class="mac-icon-grid"></div>`;
        const input = this.querySelector<HTMLInputElement>(".mac-icon-search")!;
        input.addEventListener("input", () => {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.search(input.value.trim()), 250);
        });
        this.querySelector(".mac-icon-reset")!.addEventListener("click", () => sd.setSetting(this.key, undefined));
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event !== "options-result" || msg.requestId !== this.requestId) return;
                if (this.query) this.results = msg.items;
                else this.current = msg.items[0];
                this.render();
            }),
            sd.onSettings(() => this.lookupCurrent()),
        );
        this.lookupCurrent();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
        clearTimeout(this.timer);
    }

    /** The icon the key shows: the chosen one, else the key's default. */
    private get shown(): string {
        return this.value || (this.getAttribute("default-icon") ?? "");
    }

    /** Fetch the shown icon's path for its preview. */
    private lookupCurrent(): void {
        if (this.current?.value === this.shown) return this.render();
        this.current = undefined;
        this.query = "";
        if (!this.shown) return this.render();
        this.request(this.shown);
    }

    private search(query: string): void {
        this.query = query;
        if (!query) {
            this.results = [];
            return this.render();
        }
        this.request(query);
    }

    private request(q: string): void {
        this.requestId = nextRequestId();
        sd.sendToPlugin({ event: "options", requestId: this.requestId, source: "mdi-icons", params: { q } });
    }

    private render(): void {
        const cur = this.current && this.current.value === this.shown ? this.current : undefined;
        this.querySelector(".mac-icon-current")!.innerHTML = cur?.icon ? svg(cur.icon, 28) : "";
        this.querySelector(".mac-icon-name")!.textContent = this.value && cur ? cur.label : t(this.getAttribute("none-label") ?? "pi.icon_default_name");
        this.querySelector<HTMLButtonElement>(".mac-icon-reset")!.hidden = !this.value;
        const grid = this.querySelector<HTMLElement>(".mac-icon-grid")!;
        if (this.query && !this.results.length) {
            grid.innerHTML = `<div class="pi-hint">${escapeHtml(t("pi.icon_none_found"))}</div>`;
            return;
        }
        grid.innerHTML = this.results
            .map((r) => `<button type="button" class="mac-icon-tile" data-name="${escapeHtml(r.value)}" title="${escapeHtml(r.label)}" aria-pressed="${r.value === this.value}">${r.icon ? svg(r.icon, 24) : ""}</button>`)
            .join("");
        grid.querySelectorAll<HTMLButtonElement>(".mac-icon-tile").forEach((b) =>
            b.addEventListener("click", () => {
                const hit = this.results.find((r) => r.value === b.dataset.name);
                this.current = hit;
                sd.setSetting(this.key, b.dataset.name);
            }),
        );
    }
}
