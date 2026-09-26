import type { PlayerMedia, PlayerQueue } from "music-assistant-client";
import { maConnection } from "./connection";

// Logos of the music services (MA's `providers/icon`, monochrome variant: white on transparent,
// meant for dark backgrounds), for a small badge on the cover showing where the music comes from.
// Loaded once per provider; null = the provider has none.
type Logo = { viewBox: [number, number, number, number]; attrs: string; inner: string };

const cache = new Map<string, Logo | null>();
const loading = new Set<string>();

/** The provider instance or domain that is playing (e.g. "spotify--k5kUkxwG"); undefined = unknown. */
export function playingProvider(media: PlayerMedia | null | undefined, queue: PlayerQueue | undefined): string | undefined {
    const stream = (queue?.current_item as { streamdetails?: { provider?: string } } | null | undefined)?.streamdetails?.provider;
    if (stream) return stream;
    const scheme = media?.uri?.split("://")[0];
    return scheme && scheme !== "library" && scheme !== media?.uri ? scheme : undefined;
}

/**
 * The provider's logo as an SVG fragment placed at (x, y) with the given size, or undefined while
 * it loads (then `redraw` is called) or when there is none.
 */
export function providerLogo(provider: string, x: number, y: number, size: number, redraw: () => void): string | undefined {
    const logo = cache.get(provider);
    if (logo === undefined) {
        void load(provider, redraw);
        return undefined;
    }
    if (!logo) return undefined;
    // A plain group, not a nested <svg>: Stream Deck's renderer draws nothing for nested ones
    const [vx, vy, vw, vh] = logo.viewBox;
    const scale = size / Math.max(vw, vh);
    const dx = x + (size - vw * scale) / 2;
    const dy = y + (size - vh * scale) / 2;
    return `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale.toFixed(5)}) translate(${-vx} ${-vy})"${logo.attrs}>${logo.inner}</g>`;
}

async function load(provider: string, redraw: () => void): Promise<void> {
    const ma = maConnection.ma;
    if (loading.has(provider) || !ma?.isConnected) return;
    loading.add(provider);
    try {
        const uri = await ma.call("providers/icon", { provider, variant: "monochrome" });
        cache.set(provider, typeof uri === "string" && uri.startsWith("data:image/svg+xml") ? parseLogo(uri) : null);
        redraw();
    } catch {
        cache.set(provider, null);
    } finally {
        loading.delete(provider);
    }
}

// Editor leftovers (Inkscape/Sodipodi): their namespaces are declared on the root we drop
const EDITOR_ELEMENTS = /<(sodipodi|inkscape):[a-zA-Z]+[\s\S]*?(\/>|<\/(sodipodi|inkscape):[a-zA-Z]+>)/g;
const EDITOR_ATTRS = /\s(sodipodi|inkscape):[a-zA-Z-]+="[^"]*"/g;

/** Split a data-URI SVG into its viewBox, the root's paint attributes and its content. */
export function parseLogo(dataUri: string): Logo | null {
    const match = /^data:image\/svg\+xml(;base64)?,(.*)$/s.exec(dataUri);
    if (!match) return null;
    const svg = (match[1] ? Buffer.from(match[2], "base64").toString("utf8") : decodeURIComponent(match[2]))
        .replace(/<\?xml[^>]*\?>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<metadata[\s\S]*?<\/metadata>/g, "")
        .replace(EDITOR_ELEMENTS, "")
        .replace(EDITOR_ATTRS, "");
    const root = /<svg([^>]*)>([\s\S]*)<\/svg>/.exec(svg);
    if (!root) return null;
    const rootAttrs = root[1];
    const vb = /viewBox="([^"]+)"/.exec(rootAttrs)?.[1].trim().split(/[\s,]+/).map(Number);
    const w = Number(/\swidth="([\d.]+)/.exec(rootAttrs)?.[1] ?? 0);
    const h = Number(/\sheight="([\d.]+)/.exec(rootAttrs)?.[1] ?? 0);
    const viewBox = (vb && vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, w || 24, h || 24]) as Logo["viewBox"];
    // Keep only what paints: fill/stroke settings and a style
    const attrs = [...rootAttrs.matchAll(/\s(fill|fill-rule|clip-rule|stroke|style)="[^"]*"/g)].map((m) => m[0]).join("");
    return { viewBox, attrs, inner: root[2] };
}
