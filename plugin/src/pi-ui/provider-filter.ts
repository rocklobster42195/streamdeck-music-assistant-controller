// <mac-provider-filter setting="providers"> — one switch per Music Assistant music provider. The
// setting holds the enabled provider instances; unset = all (so providers added later show up).
import { escapeHtml, sd, t } from "streamdeck-core/pi";
import type { OptionItem, PiPush } from "../pi/protocol";

let nextRequestId = 1;

export class MacProviderFilter extends HTMLElement {
    private items: OptionItem[] | undefined;
    private requestId = 0;
    private offs: (() => void)[] = [];

    private get key(): string {
        return this.getAttribute("setting") ?? "providers";
    }

    /** Enabled instance ids, or undefined = all. */
    private get enabled(): string[] | undefined {
        const v = sd.settings[this.key];
        return Array.isArray(v) ? (v as string[]) : undefined;
    }

    connectedCallback(): void {
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event !== "options-result" || msg.requestId !== this.requestId) return;
                this.items = msg.items;
                this.render();
            }),
            sd.onSettings(() => this.render()),
        );
        this.requestId = nextRequestId++;
        sd.sendToPlugin({ event: "options", requestId: this.requestId, source: "music-providers" });
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private render(): void {
        if (!this.items) {
            this.innerHTML = `<div class="pi-row"><span class="pi-hint">${escapeHtml(t("pi.loading"))}</span></div>`;
            return;
        }
        const enabled = this.enabled;
        const isOn = (id: string) => !enabled || enabled.includes(id);
        this.innerHTML = this.items
            .map(
                (p) => `
            <div class="pi-row">
                <div class="pi-row-text">
                    <span class="pi-label">${escapeHtml(p.label)}</span>
                    ${p.sub ? `<span class="pi-hint">${escapeHtml(p.sub)}</span>` : ""}
                </div>
                <button type="button" class="pi-switch" data-id="${escapeHtml(p.value)}" aria-label="${escapeHtml(p.label)}" aria-pressed="${isOn(p.value)}"><span class="pi-switch-knob"></span></button>
            </div>`,
            )
            .join("");
        this.querySelectorAll<HTMLButtonElement>(".pi-switch").forEach((b) => b.addEventListener("click", () => this.toggle(b.dataset.id ?? "")));
    }

    private toggle(id: string): void {
        const all = (this.items ?? []).map((p) => p.value);
        const current = this.enabled ?? all;
        const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
        // Everything on = no filter again, so new providers appear on their own
        sd.setSetting(this.key, all.every((x) => next.includes(x)) ? undefined : next);
    }
}
