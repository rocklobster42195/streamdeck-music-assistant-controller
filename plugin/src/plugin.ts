import streamDeck from "@elgato/streamdeck";
import { setKitLogger } from "@rocklobster42195/streamdeck-kit";
import { AnnounceKey } from "./actions/announce-key";
import { BrowserDial } from "./actions/browser-dial";
import { DashboardKey } from "./actions/dashboard-key";
import { GroupVolumeDial } from "./actions/group-volume-dial";
import { LikeKey } from "./actions/like-key";
import { PanoramaDial } from "./actions/panorama-dial";
import { ContinueKey } from "./actions/continue-key";
import { PlayItemKey } from "./actions/play-item-key";
import { PlayerDial } from "./actions/player-dial";
import { PlayerKey } from "./actions/player-key";
import { PlayPauseKey } from "./actions/play-pause-key";
import { PlaybackControlKey } from "./actions/playback-control-key";
import { QueueDial } from "./actions/queue-dial";
import { SleepTimerKey } from "./actions/sleep-timer-key";
import { SourceKey } from "./actions/source-key";
import { TrackDial } from "./actions/track-dial";
import { VolumeDial } from "./actions/volume-dial";
import { VolumeKey } from "./actions/volume-key";
import { startMacBus, trackMacActions } from "./bus/mac-bus";
import { maConnection } from "./ma/connection";
import { registerOptionSources } from "./pi/options";
import { initPiBridge } from "./pi/pi-handlers";

streamDeck.logger.setLevel("info");
// Kit problems (covers that fail to load, a throwing effect) go to the plugin log.
setKitLogger(streamDeck.logger);

streamDeck.actions.registerAction(new PlayPauseKey());
streamDeck.actions.registerAction(new PlaybackControlKey());
streamDeck.actions.registerAction(new VolumeKey());
streamDeck.actions.registerAction(new LikeKey());
streamDeck.actions.registerAction(new PlayItemKey());
streamDeck.actions.registerAction(new ContinueKey());
streamDeck.actions.registerAction(new VolumeDial());
streamDeck.actions.registerAction(new TrackDial());
streamDeck.actions.registerAction(new BrowserDial());
streamDeck.actions.registerAction(new PlayerKey());
streamDeck.actions.registerAction(new PlayerDial());
streamDeck.actions.registerAction(new QueueDial());
streamDeck.actions.registerAction(new GroupVolumeDial());
streamDeck.actions.registerAction(new PanoramaDial());
streamDeck.actions.registerAction(new SleepTimerKey());
streamDeck.actions.registerAction(new AnnounceKey());
streamDeck.actions.registerAction(new SourceKey());
streamDeck.actions.registerAction(new DashboardKey());
initPiBridge();
registerOptionSources();
trackMacActions();

await streamDeck.connect();
// deckbus: audio levels from other plugins for the Panorama (works without it if the bus can't start)
void startMacBus();
await maConnection.init();
streamDeck.logger.info("MAC started");
