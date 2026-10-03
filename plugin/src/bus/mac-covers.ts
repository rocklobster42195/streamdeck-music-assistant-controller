// MA-C's players on deckbus (state "covers", the kit's covers.ts): the colour of what each player
// plays, so a Panorama row (and later keys) of any plugin can follow the cover, also without an
// MA-C dial in it. Group members are left out (they play their leader's cover).
import { CoverBoard, readableCoverColor, type CoverEntry } from "@rocklobster42195/streamdeck-kit";
import type { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { maConnection } from "../ma/connection";
import { coverAccent } from "../render/cover-color";

export const macCovers = new CoverBoard("MA-C");

/** When each player last started playing, and whether it played at the last look. */
const since = new Map<string, number>();
const playing = new Set<string>();

export function startMacCovers(bus: DeckBus): void {
    macCovers.connect(bus);
    maConnection.onChange(publish);
    publish();
}

function publish(): void {
    const entries: CoverEntry[] = [];
    for (const p of maConnection.selectablePlayers()) {
        if (p.synced_to) continue;
        const accent = coverAccent(p.current_media);
        const state = maConnection.queueFor(p)?.state ?? p.playback_state;
        const now = state === "playing";
        if (now && !playing.has(p.player_id)) since.set(p.player_id, Date.now());
        if (now) playing.add(p.player_id);
        else playing.delete(p.player_id);
        if (!accent) continue;
        entries.push({ player: p.player_id, name: p.display_name ?? p.name, color: readableCoverColor(accent), playing: now, since: since.get(p.player_id) ?? 0 });
    }
    macCovers.publish(entries);
}
