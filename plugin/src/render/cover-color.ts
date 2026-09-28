import type { PlayerMedia } from "music-assistant-client";
import { ACCENT } from "./key-image";

/** "rgb(r,g,b)" from an MA palette triplet. */
type Rgb = [number, number, number];

/** Relative luminance 0..1 (WCAG). */
function luminance([r, g, b]: Rgb): number {
    const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The cover color to draw with on MAC's black keys and strips: MA's palette accent when it is
 * bright enough to be seen, otherwise the palette's primary or on-dark color (grey-scale covers
 * have a near-black accent), otherwise undefined.
 */
export function coverAccent(media: PlayerMedia | null | undefined): Rgb | undefined {
    const p = media?.palette;
    return [p?.accent, p?.primary, p?.on_dark].find((c): c is Rgb => !!c && luminance(c) >= 0.1);
}

/** The cover color when `useCover` is on, otherwise MAC's blue. */
export function ringColor(useCover: boolean | undefined, media: PlayerMedia | null | undefined): string {
    return useCover ? rgb(coverAccent(media), ACCENT) : ACCENT;
}

export function rgb(triplet: [number, number, number] | undefined, fallback: string): string {
    return triplet ? `rgb(${triplet[0]},${triplet[1]},${triplet[2]})` : fallback;
}
