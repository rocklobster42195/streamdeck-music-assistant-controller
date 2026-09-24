import streamDeck from "@elgato/streamdeck";
import { BrowserDial } from "./actions/browser-dial";
import { LikeKey } from "./actions/like-key";
import { PlayItemKey } from "./actions/play-item-key";
import { PlayerDial } from "./actions/player-dial";
import { PlayerKey } from "./actions/player-key";
import { PlayPauseKey } from "./actions/play-pause-key";
import { PlaybackControlKey } from "./actions/playback-control-key";
import { TrackDial } from "./actions/track-dial";
import { VolumeDial } from "./actions/volume-dial";
import { VolumeKey } from "./actions/volume-key";
import { maConnection } from "./ma/connection";
import { piBridge } from "./pi/pi-bridge";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new PlayPauseKey());
streamDeck.actions.registerAction(new PlaybackControlKey());
streamDeck.actions.registerAction(new VolumeKey());
streamDeck.actions.registerAction(new LikeKey());
streamDeck.actions.registerAction(new PlayItemKey());
streamDeck.actions.registerAction(new VolumeDial());
streamDeck.actions.registerAction(new TrackDial());
streamDeck.actions.registerAction(new BrowserDial());
streamDeck.actions.registerAction(new PlayerKey());
streamDeck.actions.registerAction(new PlayerDial());
piBridge.init();

await streamDeck.connect();
await maConnection.init();
streamDeck.logger.info("MAC started");
