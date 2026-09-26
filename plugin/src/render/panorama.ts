import streamDeck from "@elgato/streamdeck";
import { effectRegistry, PanoramaEngine, setPanoramaLogger } from "streamdeck-core";
import type { PlayerMedia } from "music-assistant-client";
import { ACCENT, coverAccent, rgb } from "./key-image";

setPanoramaLogger(streamDeck.logger);

/** The plugin's one panorama engine: effects spanning neighbouring dials. */
export const panorama = new PanoramaEngine({ defaultColor: ACCENT });

/** Dial settings that choose and tune an effect (stored flat, like sonos-controller). */
export type EffectSettings = {
    /**
     * Effect id. "" = no effect, chosen on purpose: the dial stays a (blank) member of its group,
     * so it takes up an effect chosen on a connected display later. Unset = no effect, not connected.
     */
    background?: string;
    /** Tint the effect with the cover's accent color (default on). */
    coverColor?: boolean;
    /** Changing the effect here switches the whole group of connected displays (default on). */
    syncEffect?: boolean;
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

const effectTargets = new Map<string, (effectId: string) => void>();

/** Lets a dial take over an effect chosen on a connected display (see {@link spreadEffect}). */
export function registerEffectTarget(context: string, apply: (effectId: string) => void): void {
    effectTargets.set(context, apply);
}

export function unregisterEffectTarget(context: string): void {
    effectTargets.delete(context);
}

/**
 * A dial's effect choice changed. Connected displays only form one panorama while they share an
 * effect, so without this a change split the dial off from its group. With `syncEffect` on
 * (default) the other displays of the group follow instead — "no effect" ("") included; turning
 * the switch off is how a single display leaves. Call it before the dial re-joins the engine,
 * while {@link PanoramaEngine.members} still returns the old group.
 */
export function spreadEffect(context: string, before: string | undefined, after: string | undefined, sync: boolean | undefined): void {
    // "" = no effect; undefined = never set (nothing to spread from or to)
    if (sync === false || before === undefined || after === undefined || before === after) return;
    for (const m of panorama.members(context)) {
        if (m.context !== context) effectTargets.get(m.context)?.(after);
    }
}

/** Darkening layer over an effect, so text on top stays readable. */
export const SCRIM = `<rect width="200" height="100" fill="#000" opacity="0.45"/>`;

export { rgb };
