// Where MA-C's actions are visible (deckbus "actions" state), collected from the start and shared
// once the bus exists. In its own module so the Panorama can announce its dials' effects without
// importing the bus.
import { ActionsState } from "@rocklobster42195/streamdeck-kit/bus";

let sink: ((key: string, value: unknown) => void) | undefined;

export const macActions = new ActionsState({ setState: (key, value) => sink?.(key, value) });

/** The bus takes over the state (called once it exists). */
export function shareActionsTo(fn: (key: string, value: unknown) => void): void {
    sink = fn;
}
