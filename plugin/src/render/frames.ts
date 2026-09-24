import { FrameTicker } from "streamdeck-core";

/** One shared ticker for all animations (marquees, gliding volume). Runs only while something moves. */
export const frames = new FrameTicker(120);
