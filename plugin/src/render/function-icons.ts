import { mdiScatterPlotOutline, mdiSpeedometer, mdiTimerSyncOutline, mdiWeatherPouring } from "@mdi/js";

/** Icons of what turning a Panorama dial changes (badge on the display, labels in the PI). */
const ICONS: Record<string, string> = { timing: mdiTimerSyncOutline, count: mdiScatterPlotOutline, speed: mdiSpeedometer, density: mdiWeatherPouring };

export function functionIcon(id: string): string {
    return ICONS[id] ?? mdiSpeedometer;
}
