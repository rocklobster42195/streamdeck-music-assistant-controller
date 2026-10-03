// <mac-key-preview label="Play/Pause"> — compact header: action name, player status and what plays.
// No key image: the Stream Deck app already shows keys and dial displays live (hardware test
// 2026-09-24), and the image took up a lot of room — dials most of all.
import { escapeHtml, icon, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import { onPiState, piState } from "./state";

export class MacKeyPreview extends HTMLElement {
    private off?: () => void;

    connectedCallback(): void {
        this.classList.add("mac-preview");
        this.innerHTML = `
            <div class="mac-preview-head">
                <span class="mac-preview-title">${escapeHtml(t(this.getAttribute("label") ?? ""))}</span>
                <span class="mac-preview-state"></span>
            </div>
            <div class="mac-preview-line"></div>
            <div class="mac-preview-pick"></div>`;
        this.off = onPiState(() => this.render());
        this.render();
    }

    disconnectedCallback(): void {
        this.off?.();
    }

    private render(): void {
        const p = piState.preview;
        const line = this.querySelector<HTMLElement>(".mac-preview-line")!;
        const state = this.querySelector<HTMLElement>(".mac-preview-state")!;

        this.renderPicker(p?.state === "no_player");
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

    /**
     * No player: offer a player choice right here. An action that follows the active player gets the
     * global active-player choice (one pick serves every following action); an action bound to a
     * player that is gone gets a twin of its own picker further down (same setting, stays in sync).
     */
    private renderPicker(show: boolean): void {
        const slot = this.querySelector<HTMLElement>(".mac-preview-pick")!;
        const source = document.querySelector("mac-player-picker:not([global])");
        if (!show || !source) {
            slot.replaceChildren();
            return;
        }
        const key = source.getAttribute("setting") ?? "playerId";
        const following = !source.hasAttribute("no-follow") && !sd.settings[key];
        const mode = following ? "global" : "own";
        if (slot.dataset.mode === mode && slot.firstElementChild) return;
        slot.dataset.mode = mode;
        const picker = document.createElement("mac-player-picker");
        if (following) {
            picker.setAttribute("setting", "activePlayerId");
            picker.setAttribute("global", "");
            picker.setAttribute("no-follow", "");
        } else {
            for (const a of source.getAttributeNames()) picker.setAttribute(a, source.getAttribute(a) ?? "");
        }
        slot.replaceChildren(picker);
    }
}
