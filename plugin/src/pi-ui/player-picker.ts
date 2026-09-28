// <mac-player-picker setting="playerId"> — per-action player, with "Active player" as the first choice.
// <mac-player-picker setting="activePlayerId" global no-follow> — the global active player.
import { escapeHtml, icon, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { PlayerOption } from "../pi/protocol";
import { onPiState, piState, playerName } from "./state";

const FOLLOW = "";

export class MacPlayerPicker extends HTMLElement {
    private open = false;
    private offState?: () => void;
    private offSettings?: () => void;
    private readonly onDocClick = (e: MouseEvent) => {
        // composedPath is fixed at dispatch: opening re-renders the button, so e.target may already be
        // detached and contains() would wrongly report an outside click (the list closed again at once)
        if (this.open && !e.composedPath().includes(this)) this.setOpen(false);
    };

    private get key(): string {
        return this.getAttribute("setting") ?? "playerId";
    }
    private get global(): boolean {
        return this.hasAttribute("global");
    }
    private get allowFollow(): boolean {
        return !this.hasAttribute("no-follow");
    }
    private get value(): string {
        return String((this.global ? sd.globalSettings : sd.settings)[this.key] ?? FOLLOW);
    }

    connectedCallback(): void {
        this.classList.add("pi-select");
        this.innerHTML = `<button type="button" class="pi-select-button" aria-haspopup="listbox" aria-expanded="false"></button><div class="pi-select-list" role="listbox" hidden></div>`;
        this.querySelector(".pi-select-button")!.addEventListener("click", () => this.setOpen(!this.open));
        this.addEventListener("keydown", (e) => e.key === "Escape" && this.setOpen(false));
        document.addEventListener("click", this.onDocClick);
        this.offState = onPiState(() => this.render());
        this.offSettings = this.global ? sd.onGlobalSettings(() => this.render()) : sd.onSettings(() => this.render());
        this.render();
    }

    disconnectedCallback(): void {
        this.offState?.();
        this.offSettings?.();
        document.removeEventListener("click", this.onDocClick);
    }

    private setOpen(open: boolean): void {
        this.open = open;
        this.render();
        if (open) this.querySelector<HTMLElement>('.pi-option[aria-selected="true"], .pi-option')?.focus();
    }

    private choose(id: string): void {
        if (this.global) sd.setGlobalSetting(this.key, id);
        else sd.setSetting(this.key, id);
        this.setOpen(false);
        this.querySelector<HTMLElement>(".pi-select-button")?.focus();
    }

    private render(): void {
        const value = this.value;
        const follows = this.allowFollow && value === FOLLOW;
        const activeId = piState.activePlayerId;
        const current = piState.players.find((p) => p.id === (follows ? activeId : value));

        // Closed state: what is selected, and what that means right now
        const button = this.querySelector<HTMLElement>(".pi-select-button")!;
        button.setAttribute("aria-expanded", String(this.open));
        let label: string;
        let sub: string;
        if (follows) {
            label = t("pi.active_player_option");
            sub = activeId ? t("pi.follows_now", { player: playerName(activeId) ?? activeId, state: stateLabel(current) }) : t("pi.no_active_player");
        } else if (value) {
            label = current?.name ?? value;
            sub = current ? stateLabel(current) : t("pi.player_unavailable");
        } else {
            label = t("pi.choose_player");
            sub = "";
        }
        button.innerHTML = `
            ${icon(follows ? "target" : "speaker", 20, "pi-icon-accent")}
            <span class="pi-select-text"><span class="pi-strong">${escapeHtml(label)}</span>${sub ? `<span class="pi-option-sub">${escapeHtml(sub)}</span>` : ""}</span>
            ${icon("chevronDown", 16)}`;

        // Open state: grouped options
        const list = this.querySelector<HTMLElement>(".pi-select-list")!;
        list.hidden = !this.open;
        if (!this.open) return;
        const option = (id: string, name: string, sub: string, lead: string) => `
            <button type="button" class="pi-option" role="option" data-id="${escapeHtml(id)}" aria-selected="${id === value}">
                ${lead}
                <span class="pi-select-text"><span class="pi-label">${escapeHtml(name)}</span></span>
                <span class="pi-option-sub">${escapeHtml(sub)}</span>
                <span class="pi-option-check">${id === value ? icon("check", 14) : ""}</span>
            </button>`;
        let html = "";
        if (this.allowFollow) {
            const activeName = playerName(activeId);
            html += `<div class="pi-select-group">${escapeHtml(t("pi.group_follow"))}</div>`;
            html += option(FOLLOW, t("pi.active_player_option"), activeName ? t("pi.currently", { player: activeName }) : "", icon("target", 16, "pi-icon-accent"));
            html += `<div class="pi-select-divider"></div>`;
        }
        html += `<div class="pi-select-group">${escapeHtml(t("pi.group_players"))}</div>`;
        html += piState.players.length
            ? piState.players.map((p) => option(p.id, p.name, stateLabel(p), `<span class="pi-dot" data-status="${p.state}"></span>`)).join("")
            : `<div class="pi-hint" style="padding: 6px 8px">${escapeHtml(t("pi.no_players"))}</div>`;
        list.innerHTML = html;
        list.querySelectorAll<HTMLElement>(".pi-option").forEach((el) => el.addEventListener("click", () => this.choose(el.dataset.id ?? "")));
    }
}

function stateLabel(p: PlayerOption | undefined): string {
    return p ? t(`pi.state_${p.state}`) : "";
}
