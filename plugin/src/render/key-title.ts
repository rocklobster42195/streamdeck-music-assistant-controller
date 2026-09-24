import { FrameTicker, TitleFader } from "streamdeck-core";

/** Key titles tick on their own 80 ms clock, like sonos-controller's play/pause key. */
const titleFrames = new FrameTicker(80);

/** Title color — brighter than sonos-controller's #cccccc, which read too dark on hardware. */
const TITLE_COLOR = "#f2f2f2";

/**
 * The title band at the bottom of a key (sonos-controller's TitleAnimator effect): the band fades
 * in, then the text, which scrolls through and fades out again in reverse, then a pause and the
 * next round. Stream Deck's own key titles would just be cut off instead.
 */
export class KeyTitleFader {
    private readonly faders = new Map<string, TitleFader>();

    /**
     * SVG overlay for `renderKeyImage({ overlay })`. `stillShown` is asked on every tick;
     * returning false (key gone, title turned off) stops the animation.
     */
    overlay(id: string, value: string, stillShown: () => boolean, redraw: () => void): string {
        if (!value) {
            this.forget(id);
            return "";
        }
        let fader = this.faders.get(id);
        if (fader) fader.setText(value);
        else this.faders.set(id, (fader = new TitleFader(value)));

        const current = fader;
        titleFrames.run(`title-${id}`, () => {
            if (this.faders.get(id) !== current || !stillShown()) {
                if (this.faders.get(id) === current) this.faders.delete(id);
                return false;
            }
            // Only push a new image when something visible changed (not during the pauses)
            if (current.step()) redraw();
            return true;
        });
        return current.svg(TITLE_COLOR);
    }

    forget(id: string): void {
        this.faders.delete(id);
        titleFrames.stop(`title-${id}`);
    }
}
