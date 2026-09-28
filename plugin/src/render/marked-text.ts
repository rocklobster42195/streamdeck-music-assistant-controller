import { mdi, text, textWidth } from "@rocklobster42195/streamdeck-kit";

const GAP = 4;
const MARKER_COLOR = "#b8b8be";

type TextOptions = { size: number; maxWidth: number; anchor?: "start" | "end"; weight?: "bold" | "normal"; color?: string };

/**
 * A line of text on a dial strip with the key's marker icon in front of it (see withKeyMarker for
 * keys). Dials put it on their short second line, so the room name above keeps its full width.
 * `x` is where the text starts ("start") or ends ("end"); the marker takes part of `maxWidth`.
 * Returns the parts and the total width, for the scrim behind the text.
 */
export function markedText(x: number, y: number, value: string, marker: string | undefined, opts: TextOptions): { parts: string[]; width: number } {
    const anchor = opts.anchor ?? "start";
    const bold = opts.weight === "bold";
    const style = { size: opts.size, weight: opts.weight, color: opts.color, anchor };
    if (!marker) return { parts: [text(x, y, value, { ...style, maxWidth: opts.maxWidth })], width: textWidth(value, opts.size, { bold, maxWidth: opts.maxWidth }) };
    const icon = opts.size + 2;
    const maxWidth = opts.maxWidth - icon - GAP;
    const valueWidth = textWidth(value, opts.size, { bold, maxWidth });
    const iconX = anchor === "start" ? x : x - valueWidth - GAP - icon;
    const textX = anchor === "start" ? x + icon + GAP : x;
    return {
        parts: [mdi(marker, iconX, y - opts.size + 1, icon, MARKER_COLOR), text(textX, y, value, { ...style, maxWidth })],
        width: valueWidth + icon + GAP,
    };
}
