// MDI paths for <pi-choice data-options='[{"icon":"next",…}]'> tiles (same icons as on the keys).
import { mdiAllInclusive, mdiBookOpenPageVariant, mdiBookshelf, mdiCardTextOutline, mdiChartDonut, mdiCircleSlice3, mdiEyeOffOutline, mdiFolderOpenOutline, mdiFormatAlignCenter, mdiFormatAlignLeft, mdiFormatAlignRight, mdiGauge, mdiHeart, mdiHelpCircleOutline, mdiHistory, mdiMicrophoneVariant, mdiPlay, mdiPlaylistPlus, mdiPodcast, mdiRepeat, mdiServerNetwork, mdiShuffleVariant, mdiSkipNext, mdiSkipNextCircleOutline, mdiSkipPrevious, mdiSpeaker, mdiSpeakerMultiple, mdiSpeakerWireless, mdiTimerOutline, mdiTransition, mdiVolumeMedium, mdiVolumeMinus, mdiVolumeOff, mdiVolumePlus } from "@mdi/js";
import { initChoiceOptions as kitInitChoiceOptions } from "@rocklobster42195/streamdeck-kit/pi";

const ICONS: Record<string, string> = {
    timer: mdiTimerOutline,
    next: mdiSkipNext,
    previous: mdiSkipPrevious,
    shuffle: mdiShuffleVariant,
    repeat: mdiRepeat,
    crossfade: mdiTransition,
    dontStop: mdiAllInclusive,
    heart: mdiHeart,
    volumeUp: mdiVolumePlus,
    volumeDown: mdiVolumeMinus,
    volumeOff: mdiVolumeOff,
    volumeMedium: mdiVolumeMedium,
    playNow: mdiPlay,
    playNext: mdiSkipNextCircleOutline,
    addToQueue: mdiPlaylistPlus,
    gaugeRing: mdiChartDonut,
    gaugePie: mdiCircleSlice3,
    gaugeOpen: mdiGauge,
    alignLeft: mdiFormatAlignLeft,
    alignCenter: mdiFormatAlignCenter,
    alignRight: mdiFormatAlignRight,
    providers: mdiServerNetwork,
    library: mdiBookshelf,
    folderOpen: mdiFolderOpenOutline,
    speaker: mdiSpeaker,
    speakers: mdiSpeakerMultiple,
    speakerGroup: mdiSpeakerWireless,
    quiz: mdiHelpCircleOutline,
    textOff: mdiEyeOffOutline,
    trackInfo: mdiCardTextOutline,
    lyrics: mdiMicrophoneVariant,
    continueAny: mdiHistory,
    audiobook: mdiBookOpenPageVariant,
    podcast: mdiPodcast,
};

/** Hand the tiles' icons to the kit's <pi-choice data-options> reader. */
export function initChoiceOptions(): void {
    kitInitChoiceOptions(ICONS);
}
