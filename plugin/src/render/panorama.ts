import { effectRegistry, PanoramaEngine, PanoramaRows, SharedPanorama } from "@rocklobster42195/streamdeck-kit";
import type { PlayerMedia } from "music-assistant-client";
import { macActions } from "../bus/mac-actions";
import { ACCENT } from "./key-image";
import { coverAccent, rgb } from "./cover-color";

/**
 * The plugin's one panorama: effects spanning neighbouring dials, shared over deckbus with other
 * plugins' dials next to them (the plugin with the leftmost dial runs the effect; see the kit's
 * SharedPanorama). It announces each dial's effect in the "actions" state. Connected in bus/mac-bus.ts.
 */
export const panorama = new SharedPanorama(new PanoramaEngine({ defaultColor: ACCENT }), macActions);

/**
 * One effect per row of dials, agreed with the other plugins (the kit's panorama/rows.ts): the
 * dials register here, the PI's Panorama section chooses the effect and the dials taking part.
 */
export const panoramaRows = new PanoramaRows(panorama, { name: "MA-C", actions: macActions });

/** Dial settings around the Panorama (the row itself is stored by the kit: `panorama`, `panoramaMember`). */
export type EffectSettings = {
    /** Tint the effect with the cover's accent color (default on). */
    coverColor?: boolean;
    [field: string]: unknown;
};

/**
 * The cover's colour while `coverColor` is on: a live setting, so it wins over picked colours in
 * the whole group, also on other plugins' dials (as HA-C's colour from a lamp does).
 */
export function effectLiveFor(settings: EffectSettings, effectId: string, media: PlayerMedia | null | undefined): Record<string, unknown> {
    const accent = coverAccent(media);
    if (settings.coverColor === false || !accent) return {};
    const color = rgbToHex(accent);
    const fields = new Set((effectRegistry.get(effectId)?.settingsSchema ?? []).map((f) => f.key));
    // Effects with their own color fields follow the cover too
    return { color, ...(fields.has("primaryColor") ? { primaryColor: color } : {}), ...(fields.has("landColor") ? { landColor: color } : {}) };
}

function rgbToHex([r, g, b]: [number, number, number]): string {
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Stream Deck sends {} for a dial that was just placed and never configured. */
export function isFresh(settings: object): boolean {
    return Object.keys(settings).length === 0;
}

/** Darkening layer over an effect, so text on top stays readable. */
export const SCRIM = `<rect width="200" height="100" fill="#000" opacity="0.45"/>`;

export { rgb };
