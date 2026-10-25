// MA-C's players on deckbus: state "players" (the kit's players.ts, grill 2026-10-04) and, for
// Panorama rows of older peers, "covers". Every selectable MA player, a group as one entry (its
// leader, "Küche + 2"; members are left out, they play their leader's media). Sonos speakers carry
// their RINCON id (MA's player_id for them) as device id, so a speaker SO-C also knows is one
// player on the deck; SO-C talks to it directly and gets its commands, MA-C supplies title and
// cover while MA's queue is what plays.
import { CoverBoard, PlayerBoard, positionNow, readableCoverColor, type CoverEntry, type PlayerEntry, type Transport, type TransportCommand } from "@rocklobster42195/streamdeck-kit";
import type { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import type { Player, PlayerQueue } from "music-assistant-client";
import { acknowledged } from "../ma/acknowledged";
import streamDeck from "@elgato/streamdeck";
import { maConnection } from "../ma/connection";
import { playingProvider, providerIconUri, providerName } from "../ma/provider-icons";
import type { PlayerMedia } from "music-assistant-client";

export const macCovers = new CoverBoard("MA-C");
export const macPlayers = new PlayerBoard("MA-C");

/** Players with a command that takes a while (a skip with Spotify): published as `busy`, shown on every key. */
const busyPlayers = new Set<string>();

/** The hooks that mark a player busy while a slow command runs. */
function busyWhile(id: string): { onSlow: () => void; onSettled: () => void } {
    return {
        onSlow: () => {
            busyPlayers.add(id);
            publish();
        },
        onSettled: () => {
            if (busyPlayers.delete(id)) publish();
        },
    };
}

/** When each player last started playing, and whether it played at the last look. */
const since = new Map<string, number>();
const playing = new Set<string>();
/** The position last published per player, kept while it still matches (no update per MA event). */
const lastPosition = new Map<string, { position: number; at: number; playing: boolean }>();

export function startMacPlayers(bus: DeckBus, o: { allow: () => boolean }): void {
    macCovers.connect(bus);
    macPlayers.connect(bus, { allow: o.allow });
    maConnection.onChange(publish);
    // The speaker's real play state from the plugin that talks to it (SO-C for Sonos): MA learns
    // of a pause there late or never (see MaConnection.real)
    // Only while it plays MA's stream: with its own media (a radio from the Sonos app) MA's queue isn't what plays
    const direct = (device: string) => {
        const route = macPlayers.players().find((p) => p.device === device)?.routes.find((r) => r.peer && r.entry.direct);
        return route && !route.entry.media ? route.entry.playing : undefined;
    };
    maConnection.setDirectPlaying(direct);
    let lastDirect = "";
    macPlayers.onChange(() => {
        const now = JSON.stringify(macPlayers.players().map((p) => [p.device, p.device && direct(p.device)]));
        if (now === lastDirect) return;
        lastDirect = now;
        maConnection.refresh();
    });
    publish();
}

/** Commands for MA-C's own players, from its own keys and from other plugins (deckbus "transport"). */
macPlayers.serve(async ({ player: id, command, value }: Transport) => {
    const ma = maConnection.ma;
    const player = maConnection.player(id);
    if (!ma || !player) throw new Error(`transport: ${id} is not available`);
    const queue = maConnection.queueFor(player);
    const q = queue?.queue_id;
    const group = (player.group_members?.length ?? 0) > 1;
    switch (command) {
        case "play-pause": {
            if (!q) return void (await ma.call("players/cmd/play_pause", { player_id: id }));
            // As the Play/Pause key: by what the keys show, not MA's late toggle
            const play = queue.state !== "playing";
            maConnection.showPlaying(q, play);
            return acknowledged(play ? ma.play(q) : ma.pause(q), play ? "play" : "pause", streamDeck.logger, 2500, busyWhile(id));
        }
        case "play":
            if (q) maConnection.showPlaying(q, true);
            return q ? acknowledged(ma.play(q), "play", streamDeck.logger, 2500, busyWhile(id)) : void (await ma.call("players/cmd/play", { player_id: id }));
        case "pause":
            if (q) maConnection.showPlaying(q, false);
            return q ? acknowledged(ma.pause(q), "pause", streamDeck.logger, 2500, busyWhile(id)) : void (await ma.call("players/cmd/pause", { player_id: id }));
        case "next": return q ? acknowledged(maConnection.skip(q, "next"), "next", streamDeck.logger, 2500, busyWhile(id)) : void (await ma.call("players/cmd/next", { player_id: id }));
        case "previous": return q ? acknowledged(maConnection.skip(q, "previous"), "previous", streamDeck.logger, 2500, busyWhile(id)) : void (await ma.call("players/cmd/previous", { player_id: id }));
        case "seek": {
            const target = Math.max(0, value as number);
            if (!q) return void (await ma.call("players/cmd/seek", { player_id: id, position: target }));
            // As the Track dial does: the new position at once (lyrics, progress), then measured
            // again once the speaker restarted MA's stream, so the lyrics stay in time
            maConnection.patchQueue(q, { elapsed_time: target, elapsed_time_last_updated: Date.now() / 1000 }, 2500);
            await acknowledged(ma.seek(q, target), "seek", streamDeck.logger, 2500, busyWhile(id));
            setTimeout(() => void maConnection.resync(id).catch(() => {}), 2000);
            return;
        }
        case "volume": return void (group ? await ma.setGroupVolume(id, value as number) : await ma.setVolume(id, value as number));
        case "volume-by": {
            const now = (group ? player.group_volume : player.volume_level) ?? 0;
            return void (group ? await ma.setGroupVolume(id, now + (value as number)) : await ma.setVolume(id, now + (value as number)));
        }
        case "mute": return void (group ? await ma.setGroupMute(id, value as boolean) : await ma.setMute(id, value as boolean));
        case "shuffle": return void (q ? await ma.setShuffle(q, value as boolean) : await ma.call("players/cmd/shuffle", { player_id: id, shuffle_enabled: value as boolean }));
        case "repeat": return void (q ? await ma.setRepeat(q, value as "off" | "all" | "one") : await ma.call("players/cmd/repeat", { player_id: id, repeat_mode: value as "off" | "all" | "one" }));
        case "crossfade":
            if (!q) throw new Error("transport: crossfade needs MA's queue");
            maConnection.patchQueue(q, { crossfade_enabled: value as boolean });
            return void (await ma.setCrossfade(q, value as boolean));
        case "autoplay":
            if (!q) throw new Error("transport: Don't stop the music needs MA's queue");
            maConnection.patchQueue(q, { autoplay_enabled: value as boolean });
            return void (await ma.setAutoplay(q, value as boolean));
    }
}, { failed: (t, e) => streamDeck.logger.warn(`[deckbus] ${t.command} on ${t.player} for another plugin failed`, e) });

function publish(): void {
    const covers: CoverEntry[] = [];
    const players: PlayerEntry[] = [];
    for (const p of maConnection.selectablePlayers()) {
        if (p.synced_to) continue;
        const queue = maConnection.queueFor(p);
        const now = (queue?.state ?? p.playback_state) === "playing";
        if (now && !playing.has(p.player_id)) since.set(p.player_id, Date.now());
        if (now) playing.add(p.player_id);
        else playing.delete(p.player_id);
        const vivid = vividPaletteColor(p.current_media);
        const color = vivid ? readableCoverColor(vivid) : undefined;
        const name = groupName(p);
        if (color) covers.push({ player: p.player_id, name, color, playing: now, since: since.get(p.player_id) ?? 0, ...(p.provider === "sonos" ? { device: p.player_id } : {}) });
        players.push(entryOf(p, queue, name, now, color));
    }
    macCovers.publish(covers);
    macPlayers.publish(players);
}

/**
 * The colour shared on deckbus: the most colourful of MA's palette colours, made readable by the
 * kit (brightened). Not MA-C's own ring colour (coverAccent: the accent when it is bright enough),
 * because a pale accent next to a coloured primary gave a washed-out colour, e.g. a light beige
 * for a dark teal cover, where SO-C shows the teal (seen 2026-10-04).
 */
function vividPaletteColor(media: PlayerMedia | null | undefined): [number, number, number] | undefined {
    const p = media?.palette;
    const saturation = ([r, g, b]: [number, number, number]) => {
        const max = Math.max(r, g, b);
        return max ? (max - Math.min(r, g, b)) / max : 0;
    };
    const all = [p?.accent, p?.primary, p?.on_dark, p?.background_dark].filter((c): c is [number, number, number] => Array.isArray(c) && c.length === 3);
    return all.reduce<[number, number, number] | undefined>((best, c) => (!best || saturation(c) > saturation(best) ? c : best), undefined);
}

/** "Küche", or "Küche + 2" for a group of three. */
function groupName(p: Player): string {
    const name = p.display_name ?? p.name;
    const members = p.group_members?.length ?? 0;
    return members > 1 ? `${name} + ${members - 1}` : name;
}

function entryOf(p: Player, queue: PlayerQueue | undefined, name: string, isPlaying: boolean, color: string | undefined): PlayerEntry {
    const media = p.current_media;
    // Not in the client's Player type (an extra field of MA's)
    const features = new Set(Array.isArray(p.supported_features) ? (p.supported_features as string[]) : []);
    const group = (p.group_members?.length ?? 0) > 1;
    const duration = media?.duration || queue?.current_item?.duration || undefined;
    const can: TransportCommand[] = ["play-pause", "play", "pause"];
    if (queue || features.has("next_previous")) can.push("next", "previous");
    if (duration && (queue || features.has("seek"))) can.push("seek");
    if (features.has("volume_set") || group) can.push("volume", "volume-by");
    if (features.has("volume_mute") || group) can.push("mute");
    if (queue) can.push("shuffle", "repeat", "crossfade", "autoplay");
    const repeat = queue?.repeat_mode;
    // Where it comes from (the universal keys' "source" corner): the music service and its logo
    const provider = media ? playingProvider(media, queue) : undefined;
    return clean({
        player: p.player_id,
        // MA uses the speaker's own id for Sonos (RINCON_…): the same device SO-C publishes
        device: p.provider === "sonos" ? p.player_id : undefined,
        // A Sonos group's speakers (RINCON_… as well): a key bound to one of them finds the group
        members: p.provider === "sonos" && group ? p.group_members : undefined,
        name,
        kind: "speaker",
        // What plays comes from MA's queue (not from the Sonos app, a radio, line-in)
        media: !!queue,
        busy: busyPlayers.has(p.player_id) || undefined,
        playing: isPlaying,
        since: since.get(p.player_id) ?? 0,
        color,
        title: media?.title ?? undefined,
        artist: media?.artist ?? undefined,
        album: media?.album ?? undefined,
        // Other plugins and the universal keys load it as it is: an address of its own, not "/imageproxy/…" of the server
        cover: media?.image_url ? maConnection.ma?.resolveImageUrl(media.image_url, 256) ?? media.image_url : undefined,
        ...position(p, queue, duration, isPlaying),
        duration,
        volume: (group ? p.group_volume : p.volume_level) ?? undefined,
        muted: (group ? p.group_volume_muted : p.volume_muted) ?? undefined,
        shuffle: queue?.shuffle_enabled,
        repeat: repeat === "off" || repeat === "all" || repeat === "one" ? repeat : undefined,
        crossfade: queue?.crossfade_enabled,
        autoplay: queue?.autoplay_enabled,
        can,
        source: provider ? providerName(provider) : undefined,
        sourceIcon: provider ? providerIconUri(provider, () => maConnection.refresh()) : undefined,
    });
}

/** The position, re-published only when it moved away from where the last one would be by now. */
function position(p: Player, queue: PlayerQueue | undefined, duration: number | undefined, isPlaying: boolean): { position?: number; at?: number } {
    const pos = queue ? maConnection.elapsed(queue) : p.current_media?.elapsed_time ?? undefined;
    if (pos === undefined || pos === null || !duration) {
        lastPosition.delete(p.player_id);
        return {};
    }
    const last = lastPosition.get(p.player_id);
    if (last && last.playing === isPlaying && Math.abs((positionNow({ ...last }) ?? 0) - pos) < 1.5) return { position: last.position, at: last.at };
    const next = { position: Math.round(pos * 10) / 10, at: Date.now(), playing: isPlaying };
    lastPosition.set(p.player_id, next);
    return { position: next.position, at: next.at };
}

/** Without undefined fields, so the published JSON only changes when something real does. */
function clean(e: PlayerEntry): PlayerEntry {
    return JSON.parse(JSON.stringify(e)) as PlayerEntry;
}
