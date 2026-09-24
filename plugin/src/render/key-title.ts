import { marqueeNeeded, marqueeSvg } from "streamdeck-core";
import { frames } from "./frames";

const TITLE_W = 128;
const TITLE_SIZE = 19;

/**
 * A title in a dark band at the bottom of a key, scrolling when it doesn't fit (Stream Deck's own
 * key titles are cut off instead). Keeps the scroll start per key and drives redraws while it moves.
 */
export class KeyTitleMarquee {
    private readonly state = new Map<string, { key: string; startedAt: number }>();

    /**
     * SVG overlay for `renderKeyImage({ overlay })`. `stillShown` is asked before every animation
     * frame; returning false (key gone, title turned off) stops the redraws.
     */
    overlay(id: string, value: string, withProgress: boolean, stillShown: () => boolean, redraw: () => void): string {
        if (!value) return "";
        let m = this.state.get(id);
        if (m?.key !== value) {
            m = { key: value, startedAt: Date.now() };
            this.state.set(id, m);
        }
        const bottom = withProgress ? 138 : 144;
        const band = `<rect y="${bottom - 34}" width="144" height="34" fill="#000" opacity="0.6"/>`;
        const line = marqueeSvg({ id: `k${id}`, text: value, x: 8, y: bottom - 11, width: TITLE_W, fontSize: TITLE_SIZE, weight: "bold", startedAt: m.startedAt, now: Date.now(), speed: 35 });
        if (marqueeNeeded(value, TITLE_SIZE, TITLE_W)) {
            const key = m.key;
            frames.run(`key-${id}`, () => {
                if (this.state.get(id)?.key !== key || !stillShown()) return false;
                redraw();
                return true;
            });
        }
        return band + line;
    }

    forget(id: string): void {
        this.state.delete(id);
    }
}
