import { arc, mdi, pie, scrimDisc } from "@rocklobster42195/streamdeck-kit";
import { ICONS, type GaugeStyle } from "./key-image";

const MUTED = "#ff8a8a";
const MUTED_GAUGE = "#5a5a60";

/**
 * The volume on a dial strip, centered at (cx, 50): MA-C's ring (r 34; the caller puts the number or an
 * icon inside) or Sonos Controller's pie (r 38, nothing fits inside). Muted, both turn grey
 * with the red muted speaker inside; the pie is then empty.
 */
export function volumeGauge(style: GaugeStyle | undefined, cx: number, value: number, color: string, muted: boolean): { parts: string[]; scrim: string } {
    if (style === "pie") {
        const parts = pie(cx, 50, 38, muted ? 0 : value, muted ? MUTED_GAUGE : color);
        if (muted) parts.push(mdi(ICONS.volumeOff, cx - 16, 34, 32, MUTED));
        return { parts, scrim: scrimDisc(cx, 50, 42) };
    }
    const parts = arc(cx, 50, 34, value, muted ? MUTED_GAUGE : color);
    if (muted) parts.push(mdi(ICONS.volumeOff, cx - 16, 34, 32, MUTED));
    return { parts, scrim: scrimDisc(cx, 50, 30) };
}
