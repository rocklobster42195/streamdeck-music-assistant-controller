// <mac-flow-mode> — shows and switches Music Assistant's flow mode of the action's player (a
// player setting in MA, not a key setting). Crossfade on Sonos needs it; see ma/flow-mode.ts.
import { escapeHtml, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { PiPush } from "../pi/protocol";
import { onPiState, piState, nextRequestId } from "./state";

export class MacFlowMode extends HTMLElement {
    private requestId = 0;
    private enabled: boolean | undefined;
    private playerName: string | undefined;
    private error = false;
    private busy = false;
    private playerKey = "";
    private offs: (() => void)[] = [];

    connectedCallback(): void {
        this.classList.add("pi-row");
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event !== "flow-mode-result" || msg.requestId !== this.requestId) return;
                this.busy = false;
                this.error = !!msg.error;
                this.enabled = msg.enabled;
                this.playerName = msg.playerName;
                this.render();
            }),
            sd.onSettings(() => this.refresh()),
            onPiState(() => this.refresh()),
        );
        this.refresh();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private get playerId(): string {
        return String(sd.settings.playerId || "");
    }

    /** Ask again when the player (or the active player it follows) changed. */
    private refresh(): void {
        const key = `${this.playerId}|${piState.activePlayerId ?? ""}`;
        if (key === this.playerKey && this.requestId) return this.render();
        this.playerKey = key;
        this.request();
    }

    private request(set?: boolean): void {
        this.requestId = nextRequestId();
        this.busy = set !== undefined;
        sd.sendToPlugin({ event: "flow-mode", requestId: this.requestId, playerId: this.playerId || undefined, set });
        this.render();
    }

    private render(): void {
        const known = this.enabled !== undefined && !this.error;
        const state = this.error ? t("pi.flow_mode_unknown") : this.enabled === undefined ? t("pi.flow_mode_unsupported") : t(this.enabled ? "pi.flow_mode_on" : "pi.flow_mode_off");
        const hint = this.playerName ? `${escapeHtml(this.playerName)} · ${escapeHtml(state)}` : escapeHtml(state);
        this.innerHTML = `
            <div class="pi-row-text">
                <span class="pi-label">${escapeHtml(t("pi.flow_mode"))}</span>
                <span class="pi-hint">${hint}</span>
            </div>
            <button type="button" class="pi-switch" aria-label="${escapeHtml(t("pi.flow_mode"))}" aria-pressed="${this.enabled === true}" ${known && !this.busy ? "" : "disabled"}><span class="pi-switch-knob"></span></button>`;
        this.querySelector("button")!.addEventListener("click", () => {
            if (this.enabled !== undefined && !this.busy) this.request(!this.enabled);
        });
    }
}
