// <mac-select setting="source" source="player-sources" [label-setting="sourceName"] [with-player]
//             [placeholder="pi.choose"] [empty="pi.no_sources"] [global]>
// A dropdown whose options come from the plugin (see PiBridge.registerOptions). With `with-player`
// the request carries the action's player (its own setting, else the active player), and the list
// reloads when that changes. `label-setting` also stores the chosen label (e.g. to show it on the key).
import { escapeHtml, icon, sd, t } from "streamdeck-core/pi";
import type { OptionItem, PiPush } from "../pi/protocol";
import { onPiState, piState } from "./state";

let nextRequestId = 1;

export class MacSelect extends HTMLElement {
    private open = false;
    private items: OptionItem[] | undefined;
    private error: string | undefined;
    private requestId = 0;
    private paramsKey = "";
    private offs: (() => void)[] = [];
    private readonly onDocClick = (e: MouseEvent) => {
        // composedPath is fixed at dispatch: opening re-renders the button, so e.target may already be
        // detached and contains() would wrongly report an outside click (the list closed again at once)
        if (this.open && !e.composedPath().includes(this)) this.setOpen(false);
    };

    private get key(): string {
        return this.getAttribute("setting") ?? "";
    }
    private get store() {
        return this.hasAttribute("global") ? sd.globalSettings : sd.settings;
    }

    connectedCallback(): void {
        this.classList.add("pi-select");
        this.innerHTML = `<button type="button" class="pi-select-button" aria-haspopup="listbox" aria-expanded="false"></button><div class="pi-select-list" role="listbox" hidden></div>`;
        this.querySelector(".pi-select-button")!.addEventListener("click", () => this.setOpen(!this.open));
        this.addEventListener("keydown", (e) => e.key === "Escape" && this.setOpen(false));
        document.addEventListener("click", this.onDocClick);
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event !== "options-result" || msg.requestId !== this.requestId) return;
                this.items = msg.items;
                this.error = msg.error;
                this.render();
            }),
            sd.onSettings(() => this.refresh()),
            sd.onGlobalSettings(() => this.refresh()),
            onPiState(() => this.refresh()),
        );
        this.refresh();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
        document.removeEventListener("click", this.onDocClick);
    }

    /** (Re)load the options when the request parameters changed; re-render otherwise. */
    private refresh(): void {
        const params: Record<string, string> = {};
        if (this.hasAttribute("with-player")) params.playerId = String(sd.settings.playerId || sd.globalSettings.activePlayerId || piState.activePlayerId || "");
        const key = JSON.stringify(params) + (piState.status?.state ?? "");
        if (key !== this.paramsKey) {
            this.paramsKey = key;
            this.requestId = nextRequestId++;
            this.items = undefined;
            sd.sendToPlugin({ event: "options", requestId: this.requestId, source: this.getAttribute("source") ?? "", params });
        }
        this.render();
    }

    private setOpen(open: boolean): void {
        this.open = open;
        this.render();
    }

    private choose(item: OptionItem): void {
        const labelKey = this.getAttribute("label-setting");
        const patch: Record<string, unknown> = { [this.key]: item.value, ...(labelKey ? { [labelKey]: item.label } : {}) };
        if (this.hasAttribute("global")) for (const [k, v] of Object.entries(patch)) sd.setGlobalSetting(k, v);
        else sd.setSettings(patch);
        this.setOpen(false);
    }

    private render(): void {
        const value = String(this.store[this.key] ?? "");
        const current = this.items?.find((i) => i.value === value);
        const labelKey = this.getAttribute("label-setting");
        const label = current?.label ?? (labelKey ? (this.store[labelKey] as string | undefined) : undefined) ?? (value || t(this.getAttribute("placeholder") ?? "pi.choose"));
        const button = this.querySelector<HTMLElement>(".pi-select-button")!;
        button.setAttribute("aria-expanded", String(this.open));
        button.innerHTML = `<span class="pi-select-text"><span class="pi-strong">${escapeHtml(label)}</span>${current?.sub ? `<span class="pi-option-sub">${escapeHtml(current.sub)}</span>` : ""}</span>${icon("chevronDown", 16)}`;

        const list = this.querySelector<HTMLElement>(".pi-select-list")!;
        list.hidden = !this.open;
        if (!this.open) return;
        if (!this.items) {
            list.innerHTML = `<div class="pi-hint" style="padding: 6px 8px">${escapeHtml(t("pi.item_loading"))}</div>`;
            return;
        }
        if (!this.items.length) {
            list.innerHTML = `<div class="pi-hint" style="padding: 6px 8px">${escapeHtml(this.error ?? t(this.getAttribute("empty") ?? "pi.no_options"))}</div>`;
            return;
        }
        list.innerHTML = this.items
            .map(
                (i, n) => `<button type="button" class="pi-option" role="option" data-n="${n}" aria-selected="${i.value === value}">
                    <span class="pi-select-text"><span class="pi-label">${escapeHtml(i.label)}</span>${i.sub ? `<span class="pi-option-sub">${escapeHtml(i.sub)}</span>` : ""}</span>
                    <span class="pi-option-check">${i.value === value ? icon("check", 14) : ""}</span></button>`,
            )
            .join("");
        list.querySelectorAll<HTMLElement>(".pi-option").forEach((el) => el.addEventListener("click", () => this.choose(this.items![Number(el.dataset.n)])));
    }
}
