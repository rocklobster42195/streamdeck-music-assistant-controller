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
