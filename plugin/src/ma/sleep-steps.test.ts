import { describe, expect, it } from "vitest";
import { parseSteps } from "./sleep-steps";

describe("parseSteps", () => {
    it("parses, sorts and de-duplicates minutes", () => {
        expect(parseSteps("60, 15;30 15")).toEqual([15, 30, 60]);
    });
    it("falls back to the defaults for empty or invalid input", () => {
        expect(parseSteps("")).toEqual([15, 30, 60, 90]);
        expect(parseSteps("abc, -5")).toEqual([15, 30, 60, 90]);
    });
});
