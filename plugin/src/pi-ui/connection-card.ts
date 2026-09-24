// <mac-connection-card> — Music Assistant connection, shared by all MAC actions (global settings).
// Modes: setup (not configured) · connected (collapsed summary, "Change" expands) ·
//        auth error (server ok, token rejected) · offline (server not reachable) · connecting.
import { escapeHtml, icon, sd, t, type PiField } from "streamdeck-core/pi";
import { onPiState, piState } from "./state";

type Mode = "setup" | "connected" | "auth" | "offline" | "connecting";

export class MacConnectionCard extends HTMLElement {
    private expanded = false;
    private off?: () => void;

    connectedCallback(): void {
        this.innerHTML = `
            <div class="pi-section-title">${escapeHtml(t("pi.connection"))}</div>
            <div class="pi-card mac-conn">
                <div class="pi-padded">
                    <div class="mac-conn-head">
                        <span class="pi-dot pi-dot-lg"></span>
                        <div class="pi-select-text"><span class="pi-strong mac-conn-title"></span><span class="pi-hint mac-conn-sub"></span></div>
                        <button type="button" class="pi-button pi-button-small mac-conn-toggle"></button>
                    </div>
                    <div class="mac-conn-checks"></div>
                </div>
                <div class="mac-conn-body">
                    <div class="mac-step"><span class="mac-step-num">1</span>
                        <pi-field setting="maUrl" global label="pi.server_url" placeholder="pi.server_url_placeholder" hint="pi.server_url_hint"></pi-field></div>
                    <div class="mac-step"><span class="mac-step-num">2</span>
                        <pi-field setting="maToken" global type="password" label="pi.token" placeholder="pi.token_placeholder" hint="pi.token_hint"></pi-field></div>
                    <div class="mac-conn-active">
                        <span class="pi-field-label">${escapeHtml(t("pi.active_player"))}</span>
                        <mac-player-picker setting="activePlayerId" global no-follow></mac-player-picker>
                        <span class="pi-hint">${escapeHtml(t("pi.active_player_hint"))}</span>
                    </div>
                    <div class="mac-conn-actions"><button type="button" class="pi-button pi-button-primary mac-conn-connect"></button></div>
                </div>
            </div>`;
        this.querySelector(".mac-conn-toggle")!.addEventListener("click", () => {
            this.expanded = !this.expanded;
            this.render();
        });
        this.querySelector(".mac-conn-connect")!.addEventListener("click", () => {
            // Commit a field that still has focus, then reconnect with the saved values.
            (document.activeElement as HTMLElement | null)?.blur();
            setTimeout(() => sd.sendToPlugin({ event: "reconnect" }), 50);
        });
        this.off = onPiState(() => this.render());
        sd.onGlobalSettings(() => this.render());
        this.render();
    }

    disconnectedCallback(): void {
        this.off?.();
    }

    private mode(): Mode {
        const s = piState.status;
        if (!s) return "connecting";
        if (!s.configured) return "setup";
        if (s.state === "connected") return "connected";
        if (s.state === "auth_failed") return "auth";
        if (s.state === "reconnecting" && !s.reachable) return "offline";
        return "connecting";
    }

    private render(): void {
        const s = piState.status;
        const mode = this.mode();
        document.body.dataset.connection = mode === "connected" ? "up" : "down";

        const card = this.querySelector<HTMLElement>(".mac-conn")!;
        card.dataset.mode = mode;
        const dot = this.querySelector<HTMLElement>(".pi-dot")!;
        const title = this.querySelector<HTMLElement>(".mac-conn-title")!;
        const sub = this.querySelector<HTMLElement>(".mac-conn-sub")!;
        const toggle = this.querySelector<HTMLElement>(".mac-conn-toggle")!;
        const checks = this.querySelector<HTMLElement>(".mac-conn-checks")!;
        const body = this.querySelector<HTMLElement>(".mac-conn-body")!;
        const connect = this.querySelector<HTMLElement>(".mac-conn-connect")!;
        const tokenField = this.querySelector<PiField>('pi-field[setting="maToken"]');
        const host = s?.url?.replace(/^https?:\/\//, "") ?? String(sd.globalSettings.maUrl ?? "");

        const showBody = mode !== "connected" || this.expanded;
        body.hidden = !showBody;
        toggle.hidden = mode !== "connected";
        toggle.textContent = this.expanded ? t("pi.done") : t("pi.change");
        this.querySelector<HTMLElement>(".mac-conn-active")!.hidden = mode !== "connected";
        this.querySelectorAll<HTMLElement>(".mac-step-num").forEach((el) => (el.hidden = mode !== "setup"));
        connect.hidden = mode === "connected";
        connect.textContent = mode === "setup" ? t("pi.connect") : t("pi.reconnect");
        tokenField?.setError(mode === "auth" ? t("pi.token_rejected_hint") : null);

        checks.innerHTML = "";
        switch (mode) {
            case "setup":
                dot.dataset.status = "";
                title.textContent = t("pi.setup_title");
                sub.textContent = t("pi.setup_sub");
                break;
            case "connected":
                dot.dataset.status = "ok";
                title.textContent = t("pi.connected");
                sub.textContent = [host, s?.serverVersion ? `MA ${s.serverVersion}` : "", t("pi.player_count", { count: s?.playerCount ?? 0 })]
                    .filter(Boolean)
                    .join(" · ");
                break;
            case "auth":
                dot.dataset.status = "error";
                title.textContent = t("pi.auth_failed");
                sub.textContent = "";
                checks.innerHTML =
                    check(true, t("pi.server_reachable", { version: s?.serverVersion ?? "?" })) + check(false, t("pi.token_rejected"));
                break;
            case "offline":
                dot.dataset.status = "error";
                title.textContent = t("pi.offline");
                sub.textContent = "";
                checks.innerHTML = check(false, t("pi.server_unreachable", { url: host }));
                break;
            case "connecting":
                dot.dataset.status = "warn";
                title.textContent = t("pi.connecting");
                sub.textContent = host;
                break;
        }
    }
}

function check(ok: boolean, text: string): string {
    return `<div class="mac-check" data-ok="${ok}">${icon(ok ? "check" : "cross", 14)}<span>${escapeHtml(text)}</span></div>`;
}
