import { describe, expect, it } from "vitest";
import { formatRemaining, parseSteps } from "./sleep-steps";

describe("parseSteps", () => {
    it("parses, sorts and de-duplicates minutes", () => {
        expect(parseSteps("60, 15;30 15")).toEqual([15, 30, 60]);
    });
    it("falls back to the defaults for empty or invalid input", () => {
        expect(parseSteps("")).toEqual([15, 30, 60, 90]);
        expect(parseSteps("abc, -5")).toEqual([15, 30, 60, 90]);
    });
});

describe("formatRemaining", () => {
    it("shows minutes and seconds below an hour", () => {
        expect(formatRemaining(1799.2)).toBe("30:00");
        expect(formatRemaining(65)).toBe("1:05");
        expect(formatRemaining(0.4)).toBe("0:01");
    });
    it("shows hours and minutes from an hour on", () => {
        expect(formatRemaining(3600)).toBe("1h00");
        expect(formatRemaining(5400)).toBe("1h30");
    });
});
