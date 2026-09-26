const DEFAULT_STEPS = [15, 30, 60, 90];

/** Sleep timer steps in minutes from a setting like "15,30,60,90" (sorted, unique; defaults if empty/invalid). */
export function parseSteps(value: string | undefined): number[] {
    const steps = (value ?? "")
        .split(/[,;\s]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 24 * 60)
        .sort((a, b) => a - b);
    return steps.length ? [...new Set(steps)] : DEFAULT_STEPS;
}

/** Time left as the key shows it: "29:59" below an hour, "1h05" from an hour on. */
export function formatRemaining(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
