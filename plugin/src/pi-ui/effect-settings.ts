// <mac-effect-settings [allow-none]> — choose a panorama effect (setting "background") and tune it.
// The fields come from the effect's own settingsSchema (range → <pi-range>, color → <pi-color>),
// so a new effect brings its controls along without PI changes.
import { escapeHtml, sd, t } from "streamdeck-core/pi";
import type { EffectInfo } from "streamdeck-core";
import { onPiState, piState } from "./state";

const NONE = "";

/** Translation with a fallback (effect names/labels come from the effect as English text). */
function tr(key: string, fallback: string): string {
    const v = t(key);
    return v === key ? fallback : v;
}

export class MacEffectSettings extends HTMLElement {
    private shownFor: string | undefined;
    private offs: (() => void)[] = [];

    private get allowNone(): boolean {
        return this.hasAttribute("allow-none");
    }

    private get value(): string {
        const v = sd.settings.background as string | undefined;
        return v ?? (this.allowNone ? NONE : (piState.effects[0]?.id ?? ""));
    }

    connectedCallback(): void {
        this.classList.add("mac-effect-settings");
        this.offs.push(
            onPiState(() => this.render()),
            sd.onSettings(() => this.render()),
        );
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private render(): void {
        const effects = piState.effects;
        const value = this.value;
        const key = `${value}|${effects.length}`;
        if (key === this.shownFor) return; // fields keep their own state; only rebuild on effect change
        this.shownFor = key;

        const options = [...(this.allowNone ? [{ id: NONE, name: t("pi.effect_none") }] : []), ...effects.map((e) => ({ id: e.id, name: tr(`effect.${e.id}.name`, e.displayName) }))];
        const effect = effects.find((e) => e.id === value);
        this.innerHTML = `
            <div class="pi-choice" style="--pi-choice-columns: ${Math.min(3, options.length)}">
                ${options.map((o) => `<button type="button" class="pi-choice-tile" data-id="${escapeHtml(o.id)}" aria-pressed="${o.id === value}"><span>${escapeHtml(o.name)}</span></button>`).join("")}
            </div>
            <div class="mac-effect-fields"></div>`;
        this.querySelectorAll<HTMLElement>(".pi-choice-tile").forEach((el) => el.addEventListener("click", () => sd.setSetting("background", el.dataset.id ?? NONE)));

        const fields = this.querySelector<HTMLElement>(".mac-effect-fields")!;
        if (!effect) return;
        fields.innerHTML = [
            `<pi-toggle setting="coverColor" label="pi.cover_color" hint="pi.cover_color_hint" data-default="true"></pi-toggle>`,
            ...effect.settingsSchema.map((f) => fieldHtml(effect, f)),
        ].join("");
    }
}

function fieldHtml(effect: EffectInfo, f: EffectInfo["settingsSchema"][number]): string {
    const label = escapeHtml(tr(`effect.${effect.id}.${f.key}`, f.label));
    switch (f.type) {
        case "range": {
            const span = f.max - f.min;
            const step = f.step ?? (span <= 2 ? 0.05 : span <= 10 ? 0.5 : 1);
            return `<pi-range setting="${escapeHtml(f.key)}" min="${f.min}" max="${f.max}" step="${step}" default="${f.default}" label="${label}"></pi-range>`;
        }
        case "color":
            return `<pi-color setting="${escapeHtml(f.key)}" default="${escapeHtml(f.default)}" label="${label}"></pi-color>`;
        case "checkbox":
            return `<pi-toggle setting="${escapeHtml(f.key)}" label="${label}" data-default="${f.default}"></pi-toggle>`;
        default:
            return "";
    }
}
