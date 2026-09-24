import streamDeck from "@elgato/streamdeck";
import { LikeKey } from "./actions/like-key";
import { PlayPauseKey } from "./actions/play-pause-key";
import { PlaybackControlKey } from "./actions/playback-control-key";
import { VolumeKey } from "./actions/volume-key";
import { maConnection } from "./ma/connection";
import { piBridge } from "./pi/pi-bridge";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new PlayPauseKey());
streamDeck.actions.registerAction(new PlaybackControlKey());
streamDeck.actions.registerAction(new VolumeKey());
streamDeck.actions.registerAction(new LikeKey());
piBridge.init();

await streamDeck.connect();
await maConnection.init();
streamDeck.logger.info("MAC started");
