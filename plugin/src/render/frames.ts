import { FrameTicker, MARQUEE_TICK_MS } from "streamdeck-core";

/** One shared ticker for all animations (marquees, gliding volume). Runs only while something moves. */
export const frames = new FrameTicker(MARQUEE_TICK_MS);
