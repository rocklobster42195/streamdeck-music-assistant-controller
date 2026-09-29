import { describe, expect, it } from "vitest";
import { AutoRange } from "./auto-range";

describe("AutoRange", () => {
    it("reacts the same to a quiet and a hot source, relative to their peaks", () => {
        const quiet = new AutoRange();
        const hot = new AutoRange();
        quiet.strength(-42, 0);
        hot.strength(-12, 0);
        expect(quiet.strength(-42, 50)).toBe(1);
        expect(hot.strength(-12, 50)).toBe(1);
        expect(quiet.strength(-57, 100)).toBeCloseTo(hot.strength(-27, 100), 1);
    });
    it("lets the top sink slowly after a loud moment", () => {
        const r = new AutoRange();
        r.strength(-10, 0);
        const soon = r.strength(-30, 1000);
        const later = r.strength(-30, 11_000);
        expect(later).toBeGreaterThan(soon);
    });
    it("stays at 0 for silence and noise", () => {
        const r = new AutoRange();
        expect(r.strength(-90, 0)).toBe(0);
        expect(r.strength(-128, 50)).toBe(0);
        expect(r.strength(Number.NaN, 100)).toBe(0);
    });
});
