import streamDeck from "@elgato/streamdeck";
import { effectRegistry, PanoramaEngine, setPanoramaLogger } from "streamdeck-core";
import type { PlayerMedia } from "music-assistant-client";
import { ACCENT, coverAccent, rgb } from "./key-image";

setPanoramaLogger(streamDeck.logger);

/** The plugin's one panorama engine: effects spanning neighbouring dials. */
export const panorama = new PanoramaEngine({ defaultColor: ACCENT });

/** Dial settings that choose and tune an effect (stored flat, like sonos-controller). */
export type EffectSettings = {
    /** Effect id; "" / undefined = none. */
    background?: string;
    /** Tint the effect with the cover's accent color (default on). */
    coverColor?: boolean;
    [field: string]: unknown;
};

/**
 * The effect settings to hand to the engine: the chosen effect's schema fields (value or default),
 * plus `color` from the cover when `coverColor` is on.
 */
export function effectSettingsFor(settings: EffectSettings, effectId: string, media: PlayerMedia | null | undefined): Record<string, unknown> {
    const def = effectRegistry.get(effectId);
    const out: Record<string, unknown> = {};
    for (const field of def?.settingsSchema ?? []) out[field.key] = settings[field.key] ?? field.default;
    const accent = coverAccent(media);
    if (settings.coverColor !== false && accent) {
        const color = rgbToHex(accent);
        out.color = color;
        // Effects with their own color fields follow the cover too
        if ("primaryColor" in out) out.primaryColor = color;
        if ("landColor" in out) out.landColor = color;
    }
    return out;
}

function rgbToHex([r, g, b]: [number, number, number]): string {
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Darkening layer over an effect, so text on top stays readable. */
export const SCRIM = `<rect width="200" height="100" fill="#000" opacity="0.45"/>`;

export { rgb };
