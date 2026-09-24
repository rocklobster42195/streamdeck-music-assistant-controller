// MDI paths for <pi-choice data-options='[{"icon":"next",…}]'> tiles (same icons as on the keys).
import {
    mdiAllInclusive,
    mdiHelpCircleOutline,
    mdiSpeaker,
    mdiSpeakerMultiple,
    mdiBookOpenPageVariant,
    mdiBookshelf,
    mdiHistory,
    mdiPodcast,
    mdiCardTextOutline,
    mdiEyeOffOutline,
    mdiMicrophoneVariant,
    mdiFolderOpenOutline,
    mdiServerNetwork,
    mdiFormatAlignCenter,
    mdiFormatAlignLeft,
    mdiFormatAlignRight,
    mdiPlay,
    mdiPlaylistPlus,
    mdiSkipNextCircleOutline,
    mdiHeart,
    mdiRepeat,
    mdiShuffleVariant,
    mdiSkipNext,
    mdiSkipPrevious,
    mdiTransition,
    mdiVolumeMedium,
    mdiVolumeMinus,
    mdiVolumeOff,
    mdiVolumePlus,
} from "@mdi/js";
import type { PiChoice, PiChoiceOption } from "streamdeck-core/pi";

const ICONS: Record<string, string> = {
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
    alignLeft: mdiFormatAlignLeft,
    alignCenter: mdiFormatAlignCenter,
    alignRight: mdiFormatAlignRight,
    providers: mdiServerNetwork,
    library: mdiBookshelf,
    folderOpen: mdiFolderOpenOutline,
    speaker: mdiSpeaker,
    speakers: mdiSpeakerMultiple,
    quiz: mdiHelpCircleOutline,
    textOff: mdiEyeOffOutline,
    trackInfo: mdiCardTextOutline,
    lyrics: mdiMicrophoneVariant,
    continueAny: mdiHistory,
    audiobook: mdiBookOpenPageVariant,
    podcast: mdiPodcast,
};

/** Read each <pi-choice data-options> and hand the parsed options (with icon paths) to the element. */
export function initChoiceOptions(): void {
    document.querySelectorAll<PiChoice & HTMLElement>("pi-choice[data-options]").forEach((el) => {
        const raw = JSON.parse(el.dataset.options ?? "[]") as PiChoiceOption[];
        el.options = raw.map((o) => ({ ...o, icon: o.icon ? ICONS[o.icon] : undefined }));
    });
}
