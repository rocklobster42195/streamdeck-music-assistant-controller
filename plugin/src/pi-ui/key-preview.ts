// <mac-key-preview label="Play/Pause"> — header card with the key image as the plugin renders it.
import { escapeHtml, icon, t } from "streamdeck-core/pi";
import { onPiState, piState } from "./state";

export class MacKeyPreview extends HTMLElement {
    private off?: () => void;

    connectedCallback(): void {
        this.classList.add("mac-preview");
        this.innerHTML = `
            <div class="mac-preview-key"><img alt="" width="72" height="72"/></div>
            <div class="mac-preview-text">
                <div class="mac-preview-title">${escapeHtml(t(this.getAttribute("label") ?? ""))}</div>
                <div class="mac-preview-line"></div>
                <div class="mac-preview-state"></div>
            </div>`;
        this.off = onPiState(() => this.render());
        this.render();
    }

    disconnectedCallback(): void {
        this.off?.();
    }

    private render(): void {
        const p = piState.preview;
        const img = this.querySelector("img")!;
        const line = this.querySelector<HTMLElement>(".mac-preview-line")!;
        const state = this.querySelector<HTMLElement>(".mac-preview-state")!;
        img.hidden = !p;
        if (p) img.src = p.image;
        this.classList.toggle("mac-preview-dial", p?.kind === "dial");

        const name = p?.playerName ?? "";
        switch (p?.state) {
            case "playing":
                line.textContent = p.track ?? "";
                state.dataset.tone = "ok";
                state.innerHTML = `${icon("play", 10)}<span>${escapeHtml(t("pi.state_playing_on", { player: name }))}</span>`;
                break;
            case "paused":
            case "idle":
                line.textContent = p.track ?? t("pi.nothing_playing");
                state.dataset.tone = "idle";
                // No player (e.g. the Panorama dial): no "ready on …" line
                state.innerHTML = name ? `<span>${escapeHtml(t(p.state === "paused" ? "pi.state_paused_on" : "pi.state_idle_on", { player: name }))}</span>` : "";
                break;
            case "setup":
                line.textContent = t("pi.preview_setup");
                state.dataset.tone = "idle";
                state.textContent = "";
                break;
            case "auth_failed":
                line.textContent = t("pi.preview_auth_failed");
                state.dataset.tone = "error";
                state.textContent = "";
                break;
            case "offline":
                line.textContent = t("pi.preview_offline");
                state.dataset.tone = "error";
                state.textContent = "";
                break;
            case "no_player":
                line.textContent = t("pi.preview_no_player");
                state.dataset.tone = "idle";
                state.textContent = "";
                break;
            default:
                line.textContent = "";
                state.textContent = "";
        }
    }
}
