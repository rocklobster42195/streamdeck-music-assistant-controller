import { describe, expect, it } from "vitest";
import { PagedList } from "./paged-list";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("PagedList", () => {
    it("loads pages on demand and serves cached items", async () => {
        const calls: number[] = [];
        let loaded = 0;
        const list = new PagedList<number>(async (offset, limit) => {
            calls.push(offset);
            return Array.from({ length: limit }, (_, i) => offset + i);
        }, () => loaded++, 10);
        expect(list.get(15)).toBeUndefined(); // middle of page 1: no neighbour prefetch
        await flush();
        expect(list.get(15)).toBe(15);
        expect(calls).toEqual([10]);
        expect(loaded).toBe(1);
    });

    it("prefetches the neighbour page near an edge and drops stale results after invalidate", async () => {
        const calls: number[] = [];
        const list = new PagedList<number>(async (offset) => (calls.push(offset), [offset]), () => {}, 10);
        list.get(0);
        await flush();
        list.get(8); // near the end of page 0 → prefetch page 1 (served from cache for page 0)
        await flush();
        expect(calls).toEqual([0, 10]);
        list.get(30);
        list.invalidate();
        await flush();
        expect(list.get(30)).toBeUndefined(); // the old result was dropped, a new load started
    });
});
