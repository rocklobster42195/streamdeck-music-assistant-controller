import streamDeck, { action } from "@elgato/streamdeck";
import { mdiCast, mdiCastConnected } from "@mdi/js";
import type { DashboardType } from "music-assistant-client";
import { maConnection } from "../ma/connection";
import { ACCENT, renderKeyImage } from "../render/key-image";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type DashboardSettings = MaKeySettings & {
    dashboardId?: string;
    dashboardName?: string;
    dashboard?: DashboardType;
};

const SESSION_POLL_MS = 30_000;

/**
 * Cast a Music Assistant dashboard (now playing, party, music quiz) to a screen such as a
 * Chromecast TV — press again to take it down. Lit while that screen shows a MAC/MA dashboard.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.dashboard-key" })
export class DashboardKey extends MaKeyAction<DashboardSettings> {
    /** Endpoints that currently show a dashboard. */
    private active = new Set<string>();

    constructor() {
        super();
        setInterval(() => this.instances.size && void this.refreshSessions(), SESSION_POLL_MS);
        maConnection.onChange(() => {
            if (maConnection.ma?.isConnected && !this.polledOnce) void this.refreshSessions();
        });
    }

    private polledOnce = false;

    protected override renderPlayer({ settings }: PlayerContext<DashboardSettings>): KeyRender {
        if (!settings.dashboardId) return { image: renderKeyImage({ icon: mdiCast, dimmed: true }), title: this.t("key.choose_screen") };
        const on = this.active.has(settings.dashboardId);
        return { image: renderKeyImage({ icon: on ? mdiCastConnected : mdiCast, color: on ? ACCENT : "#c8c8cc", active: on ? ACCENT : undefined }), title: settings.dashboardName ?? "" };
    }

    protected override async press({ ma, player, settings }: PlayerContext<DashboardSettings>): Promise<"ok"> {
        const id = settings.dashboardId;
        if (!id) throw new Error("no screen chosen");
        if (this.active.has(id)) {
            await ma.hideDashboard(id);
            this.active.delete(id);
        } else {
            const type = settings.dashboard ?? "now_playing";
            await ma.showDashboard(id, type, type === "now_playing" ? player.player_id : undefined);
            this.active.add(id);
        }
        this.renderAll();
        return "ok";
    }

    private async refreshSessions(): Promise<void> {
        const ma = maConnection.ma;
        if (!ma?.isConnected) return;
        this.polledOnce = true;
        try {
            const sessions = await ma.dashboardSessions();
            this.active = new Set((sessions ?? []).map((s) => s.dashboard_id));
            this.renderAll();
        } catch (e) {
            streamDeck.logger.debug("[dashboard] sessions failed", e);
        }
    }
}
