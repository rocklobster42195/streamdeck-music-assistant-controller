import { BACKGROUND_AUTO, BACKGROUND_NONE, BLANK_EFFECT_ID, effectRegistry, PanoramaEngine, resolveBackgrounds, SharedPanorama } from "@rocklobster42195/streamdeck-kit";
import type { PeerInfo } from "@rocklobster42195/streamdeck-kit/bus";
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

/** Dial settings that choose and tune an effect (stored flat, like sonos-controller). */
export type EffectSettings = {
    /**
     * Effect id. "" = no effect, chosen on purpose: the dial stays a (blank) member of its group,
     * so it takes up an effect chosen on a connected display later. Unset = no effect, not connected.
     * "auto" = like the neighbour: the effect of the dial next to it, also another plugin's (the
     * family's rule, see the kit's resolveBackgrounds).
     */
    background?: string;
    /** Tint the effect with the cover's accent color (default on). */
    coverColor?: boolean;
    /** Changing the effect here switches the whole group of connected displays (default on). */
    syncEffect?: boolean;
    [field: string]: unknown;
};

/** The chosen effect's schema fields (value or default): the dial's picked settings. */
export function effectSettingsFor(settings: EffectSettings, effectId: string): Record<string, unknown> {
    const def = effectRegistry.get(effectId);
    const out: Record<string, unknown> = {};
    for (const field of def?.settingsSchema ?? []) out[field.key] = settings[field.key] ?? field.default;
    return out;
}

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

/**
 * A dial that can show an effect: where it sits, its settings, how it takes over an effect, and
 * what it shows when nothing is chosen (the Panorama dial: its default effect).
 */
export type EffectDial = { deviceId: string; column: number; settings: () => EffectSettings; apply: (effectId: string) => void; unsetEffect?: string };

const effectDials = new Map<string, EffectDial>();

/** Lets a dial take over an effect chosen on a connected display (see {@link spreadEffect}). */
export function registerEffectTarget(context: string, dial: EffectDial): void {
    effectDials.set(context, dial);
}

export function unregisterEffectTarget(context: string): void {
    effectDials.delete(context);
}

let peers: () => PeerInfo[] = () => [];
const changeListeners = new Set<() => void>();

/** Where the other plugins' dials are (set once the bus runs). */
export function setEffectPeers(fn: () => PeerInfo[]): void {
    peers = fn;
}

/** Called when a dial's effect may have changed (a choice, a dial placed or gone, other plugins' dials). */
export function onEffectsChanged(fn: () => void): void {
    changeListeners.add(fn);
}

export function effectsChanged(): void {
    for (const fn of changeListeners) fn();
}

/**
 * The effect a dial shows: its choice, or for "like the neighbour" the effect of the dial next to
 * it (another plugin's or one of MA-C's; undefined when there is none).
 */
export function resolveEffect(context: string): string | undefined {
    const spots = [...effectDials].map(([ctx, d]) => ({ context: ctx, device: d.deviceId, column: d.column, background: familyBackground(d) }));
    return resolveBackgrounds(spots, peers()).get(context);
}

/** MA-C's setting in the family's terms: "" is the blank effect, unset "none" (or the dial's default). */
function familyBackground(d: EffectDial): string {
    const bg = d.settings().background;
    if (bg === BACKGROUND_AUTO) return BACKGROUND_AUTO;
    if (bg === "") return BLANK_EFFECT_ID;
    return bg || d.unsetEffect || BACKGROUND_NONE;
}

/**
 * Settings of the dial next to `context` (left first) that has an effect chosen, for a freshly
 * placed dial to join the scene it lands in. Without this a new dial started with the default and
 * stayed apart — no shared effect, no title or lyrics running across it.
 */
export function neighbourEffectSettings(context: string): EffectSettings | undefined {
    const me = effectDials.get(context);
    if (!me) return undefined;
    for (const side of [-1, 1]) {
        for (const [other, d] of effectDials) {
            if (other === context || d.deviceId !== me.deviceId || d.column !== me.column + side) continue;
            const s = d.settings();
            if (s.background !== undefined && s.syncEffect !== false) return s;
        }
    }
    return undefined;
}

/** Stream Deck sends {} for a dial that was just placed and never configured. */
export function isFresh(settings: object): boolean {
    return Object.keys(settings).length === 0;
}

/**
 * A dial's effect choice changed. Connected displays only form one panorama while they share an
 * effect, so without this a change split the dial off from its group. With `syncEffect` on
 * (default) the other displays of the group follow instead — "no effect" ("") included; turning
 * the switch off is how a single display leaves. "Like the neighbour" doesn't spread (it takes,
 * it doesn't give). Call it before the dial re-joins the engine, while
 * {@link PanoramaEngine.members} still returns the old group.
 */
export function spreadEffect(context: string, before: string | undefined, after: string | undefined, sync: boolean | undefined): void {
    // "" = no effect; undefined = never set (nothing to spread from or to)
    if (sync === false || before === undefined || after === undefined || before === after || after === BACKGROUND_AUTO) return;
    for (const m of panorama.members(context)) {
        if (m.context !== context) effectDials.get(m.context)?.apply(after);
    }
}

/** Darkening layer over an effect, so text on top stays readable. */
export const SCRIM = `<rect width="200" height="100" fill="#000" opacity="0.45"/>`;

export { rgb };
