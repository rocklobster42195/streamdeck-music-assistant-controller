import streamDeck, { action, type WillDisappearEvent } from "@elgato/streamdeck";
import { mdiBullhorn } from "@mdi/js";
import { maConnection } from "../ma/connection";
import { groupLeader, groupMembers } from "../ma/groups";
import { ACCENT, OFF, renderKeyImage } from "../render/key-image";
import { mdiPath } from "../render/mdi-catalog";
import { type KeyRender, MaKeyAction, type MaKeySettings, type PlayerContext } from "./ma-key-action";

type AnnounceSettings = MaKeySettings & {
    message?: string;
    ttsEngine?: string;
    /** "player" = the chosen/active player, "group" = it and every player grouped with it, "all" = every available player. */
    target?: "player" | "group" | "all";
    /** 0 = keep each player's volume. */
    volume?: number;
    /** Chime before the message (default on). */
    preAnnounce?: boolean;
    /** Speak at once (default) or after a countdown. */
    when?: "now" | "timer";
    /** Countdown length for "timer". */
    minutes?: number;
    /** MDI icon name for the key (e.g. "mdiPasta"); default: a bullhorn. */
    icon?: string;
    /** While a countdown runs: when it ends (ms since epoch), saved so a restart keeps it. */
    timerEnd?: number;
};

/** A countdown that ran out while the plugin was down is still announced if this recent. */
const LATE_GRACE_MS = 60_000;
/** After an announcement the key lights up in its "on" look for a moment (instead of Stream Deck's green tick). */
const DONE_FLASH_MS = 1500;

/**
 * Speaks a text on one or all players — "Dinner is ready!" — via a TTS engine from Home Assistant/MA.
 * With "timer" a press starts a countdown (ring and time on the key) and the message comes when it
 * ends ("The pasta is ready!"); pressing again cancels it.
 */
@action({ UUID: "de.boriskemper.music-assistant-controller.announce-key" })
export class AnnounceKey extends MaKeyAction<AnnounceSettings> {
    private readonly tickers = new Map<string, ReturnType<typeof setInterval>>();
    private readonly doneUntil = new Map<string, number>();

    protected override renderPlayer({ id, settings }: PlayerContext<AnnounceSettings>): KeyRender {
        const ready = !!settings.message?.trim();
        const icon = mdiPath(settings.icon) ?? mdiBullhorn;
        if (!ready) return { image: renderKeyImage({ icon, color: OFF }), title: this.t("key.announce_setup") };
        if ((this.doneUntil.get(id) ?? 0) > Date.now()) return { image: renderKeyImage({ icon, color: ACCENT, active: ACCENT }) };

        if (settings.when === "timer") {
            const total = minutesOf(settings) * 60_000;
            const left = settings.timerEnd ? settings.timerEnd - Date.now() : 0;
            if (left > 0) {
                this.tick(id);
                return { image: renderKeyImage({ ring: { value: left / total, color: ACCENT, center: { text: clock(left), color: "#ffffff", size: left >= 3_600_000 ? 30 : left >= 600_000 ? 32 : 36 } } }) };
            }
            // At rest like every key: light grey, or the cover color with that option
            return { image: renderKeyImage({ icon, badge: `${minutesOf(settings)} min` }) };
        }
        return { image: renderKeyImage({ icon }) };
    }

    protected override async press(ctx: PlayerContext<AnnounceSettings>): Promise<void> {
        const { id, settings } = ctx;
        if (!settings.message?.trim()) throw new Error("no message");
        if (settings.when !== "timer") return this.announce(ctx);

        // Timer: start it, or cancel the running one
        const running = !!settings.timerEnd && settings.timerEnd > Date.now();
        this.save(id, { timerEnd: running ? undefined : Date.now() + minutesOf(settings) * 60_000 });
        this.render(id);
    }

    /** "All players" needs no particular player: any available one serves as the key's context. */
    protected override playerContext(id: string, settings: AnnounceSettings): PlayerContext<AnnounceSettings> | undefined {
        const ctx = super.playerContext(id, settings);
        if (ctx || settings.target !== "all") return ctx;
        const ma = maConnection.ma;
        const player = maConnection.selectablePlayers().find((p) => p.available);
        if (!ma?.isConnected || !player) return undefined;
        return { id, settings, ma, player, queue: maConnection.queueFor(player), playerName: player.display_name ?? player.name };
    }

    override onWillDisappear(ev: WillDisappearEvent<AnnounceSettings>): void {
        this.stopTick(ev.action.id);
        super.onWillDisappear(ev);
    }

    private async announce({ id, ma, player, settings }: PlayerContext<AnnounceSettings>): Promise<void> {
        const message = settings.message!.trim();
        const targets =
            settings.target === "all"
                ? maConnection.selectablePlayers().filter((p) => p.available)
                : settings.target === "group"
                  ? groupMembers(groupLeader(player)).filter((p) => p.available)
                  : [player];
        const volume = settings.volume && settings.volume > 0 ? settings.volume : undefined;
        await Promise.all(
            targets.map((p) =>
                ma.playAnnouncement(p.player_id, { message, ttsEngine: settings.ttsEngine || undefined, volume, preAnnounce: settings.preAnnounce !== false }),
            ),
        );
        this.doneUntil.set(id, Date.now() + DONE_FLASH_MS);
        this.render(id);
        setTimeout(() => this.render(id), DONE_FLASH_MS + 50);
    }

    /** Once a second while a countdown runs: redraw, and announce when it ends. */
    private tick(id: string): void {
        if (this.tickers.has(id)) return;
        this.tickers.set(
            id,
            setInterval(() => {
                const inst = this.instances.get(id);
                const end = inst?.settings.timerEnd;
                if (!inst || !end) return this.stopTick(id);
                const now = Date.now();
                if (now < end) return this.render(id);
                this.stopTick(id);
                this.save(id, { timerEnd: undefined });
                this.render(id);
                if (now - end > LATE_GRACE_MS) return; // ran out long ago (plugin was down)
                const ctx = this.playerContext(id, inst.settings);
                if (!ctx) return;
                this.announce(ctx).catch((e) => {
                    streamDeck.logger.warn("[announce] timer announcement failed", e);
                    void inst.action.showAlert();
                });
            }, 1000),
        );
    }

    private stopTick(id: string): void {
        clearInterval(this.tickers.get(id));
        this.tickers.delete(id);
    }

    private save(id: string, patch: Partial<AnnounceSettings>): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        const next = { ...inst.settings, ...patch } as AnnounceSettings;
        if (patch.timerEnd === undefined) delete next.timerEnd;
        inst.settings = next;
        inst.lastRender = undefined;
        void inst.action.setSettings(next);
    }
}

function minutesOf(s: AnnounceSettings): number {
    return Math.min(180, Math.max(1, Math.round(s.minutes ?? 10)));
}

/** 8:42 — or, from an hour on, hours and minutes without seconds: "1:59 h". */
function clock(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    if (h) return `${h}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")} h`;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
