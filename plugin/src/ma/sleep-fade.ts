import streamDeck from "@elgato/streamdeck";
import type { MusicAssistantClient, Player } from "music-assistant-client";
import { maConnection } from "./connection";
import { groupLeader, groupMembers } from "./groups";
import { computeFadeSteps } from "./volume-fade";

/** Stop this long before MA's own timer runs out, so MA never cuts in mid-fade. */
const STOP_LEAD_S = 2;

type Member = { id: string; preVolume: number };
type Fade = { expiresAt: number; members: Member[]; cancelled: boolean; stopping: boolean };

/**
 * Fade-out for the sleep timer: shortly before the timer runs out, every member of the group is
 * faded to 0 on its own, playback stops, and each member goes back to ITS OWN volume (like
 * sonos-controller's GroupFadeCoordinator). MA's timer stays set as the fallback — without the
 * plugin running it still stops, just without the fade.
 */
class SleepFader {
    /** Running fades by the player the timer belongs to. */
    private readonly fades = new Map<string, Fade>();

    isFading(playerId: string): boolean {
        return this.fades.has(playerId);
    }

    /**
     * Called about once a second for every sleep timer on a key. Starts the fade once the timer is
     * within `fadeS` of running out; a fade whose timer was changed or cleared is called off and the
     * volumes go back.
     */
    update(ma: MusicAssistantClient, player: Player, fadeS: number): void {
        const id = player.player_id;
        const expiresAt = player.sleep_timer_expires_at ?? undefined;
        const running = this.fades.get(id);
        if (running) {
            if (!running.stopping && (!expiresAt || Math.abs(expiresAt - running.expiresAt) > 2)) void this.cancel(ma, id, running);
            return;
        }
        if (!expiresAt || fadeS <= 0) return;
        const left = expiresAt - ma.serverNow();
        if (left > fadeS || left <= STOP_LEAD_S + 1) return;
        const queue = maConnection.queueFor(player);
        if ((queue?.state ?? player.playback_state) !== "playing") return;
        void this.run(ma, player, expiresAt, (left - STOP_LEAD_S) * 1000);
    }

    private async run(ma: MusicAssistantClient, player: Player, expiresAt: number, durationMs: number): Promise<void> {
        const id = player.player_id;
        const leader = groupLeader(player);
        const members = groupMembers(leader)
            .filter((m) => (m.volume_level ?? 0) > 0 && !m.volume_muted)
            .map((m) => ({ id: m.player_id, preVolume: m.volume_level ?? 0 }));
        const fade: Fade = { expiresAt, members, cancelled: false, stopping: false };
        this.fades.set(id, fade);
        streamDeck.logger.info(`[sleep] fading out ${members.length} player(s) over ${Math.round(durationMs / 1000)} s`);
        maConnection.notify();
        try {
            await Promise.allSettled(members.map((m) => this.ramp(ma, m, durationMs, fade)));
            if (fade.cancelled) return;
            fade.stopping = true;
            // The same stop MA's own timer would send when it runs out
            await ma.stopPlayer(id);
            await ma.clearSleepTimer(id);
        } catch (e) {
            streamDeck.logger.warn("[sleep] stopping after the fade failed", e);
        } finally {
            // A cancelled fade already restored the volumes (see cancel)
            if (!fade.cancelled) {
                this.fades.delete(id);
                await this.restore(ma, fade);
            }
        }
    }

    private async cancel(ma: MusicAssistantClient, id: string, fade: Fade): Promise<void> {
        fade.cancelled = true;
        this.fades.delete(id);
        streamDeck.logger.info("[sleep] timer changed during the fade — volumes restored");
        await this.restore(ma, fade);
    }

    private async restore(ma: MusicAssistantClient, fade: Fade): Promise<void> {
        await Promise.allSettled(fade.members.map((m) => ma.setVolume(m.id, m.preVolume)));
        maConnection.notify();
    }

    /**
     * Steps are scheduled against the ramp's own start time, so slow volume commands shorten the
     * next wait instead of stretching the fade (as in sonos-controller).
     */
    private async ramp(ma: MusicAssistantClient, member: Member, durationMs: number, fade: Fade): Promise<void> {
        const start = Date.now();
        let target = 0;
        for (const step of computeFadeSteps(member.preVolume, 0, durationMs)) {
            target += step.delayMs;
            const wait = start + target - Date.now();
            if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
            if (fade.cancelled) return;
            await ma.setVolume(member.id, step.volume).catch(() => {});
        }
    }
}

export const sleepFader = new SleepFader();
