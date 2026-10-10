import { PanoramaEngine, PanoramaRows, ROW_COLOR_KEY, SharedPanorama, TextRuns } from "@rocklobster42195/streamdeck-kit";
import { macActions } from "../bus/mac-actions";
import { macCovers } from "../bus/mac-players";
import { ACCENT } from "./key-image";
import { rgb } from "./cover-color";

/**
 * The plugin's one panorama: effects spanning neighbouring dials, shared over deckbus with other
 * plugins' dials next to them (the plugin with the leftmost dial runs the effect; see the kit's
 * SharedPanorama). It announces each dial's effect in the "actions" state. Connected in bus/mac-bus.ts.
 */
export const panorama = new SharedPanorama(new PanoramaEngine({ defaultColor: ACCENT }), macActions);

/**
 * One effect per row of dials, agreed with the other plugins (the kit's panorama/rows.ts): the
 * dials register here, the PI's Panorama section chooses the effect, the dials taking part and the
 * row's colour (the cover of a player from MA-C's or another plugin's "covers" on deckbus).
 */
/** Text over the Panorama across plugin borders (one run of canvas dials, whichever plugin they belong to). */
export const textRuns = new TextRuns(macActions);

export const panoramaRows = new PanoramaRows(panorama, { name: "MA-C", actions: macActions, covers: macCovers });

/**
 * Before the row had a colour, each dial had "Cover color" (default on) and followed its own
 * player. Taken over once into the row (it is the latest choice then): off → the effect's own
 * colour; a Panorama dial's fixed player (`withPlayer`) → that player's cover (other dials have a
 * player of their own, which isn't a choice for the row). Returns the settings without the old key.
 */
export function migrateCoverColor<S extends Record<string, unknown>>(settings: S, device: string, withPlayer = false): S | undefined {
    if (settings.rowColorTaken === true || Object.keys(settings).length === 0) return undefined;
    const player = typeof settings.playerId === "string" ? settings.playerId : "";
    if (settings.coverColor === false) panoramaRows.setRow(device, { settings: { [ROW_COLOR_KEY]: "default" } });
    else if (withPlayer && player) panoramaRows.setRow(device, { settings: { [ROW_COLOR_KEY]: `cover:MA-C/${player}` } });
    const rest: Record<string, unknown> = { ...settings };
    delete rest.coverColor;
    return { ...rest, rowColorTaken: true } as unknown as S;
}

/** Stream Deck sends {} for a dial that was just placed and never configured. */
export function isFresh(settings: object): boolean {
    return Object.keys(settings).length === 0;
}

/** Darkening layer over an effect, so text on top stays readable. */
export const SCRIM = `<rect width="200" height="100" fill="#000" opacity="0.45"/>`;

export { rgb };
