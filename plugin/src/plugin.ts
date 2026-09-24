import streamDeck from "@elgato/streamdeck";
import { PlayPauseKey } from "./actions/play-pause-key";
import { maConnection } from "./ma/connection";
import { piBridge } from "./pi/pi-bridge";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new PlayPauseKey());
piBridge.init();

await streamDeck.connect();
await maConnection.init();
streamDeck.logger.info("MAC started");
