import { describe, expect, it } from "vitest";
import { type BrowseEntry, BrowserModel, type BrowseSource, toEntry } from "./browser";

const folder = (name: string, path: string): BrowseEntry => ({ name, path, mediaType: "folder", isFolder: true, playable: false });
const station = (name: string): BrowseEntry => ({ name, uri: `radio://${name}`, mediaType: "radio", isFolder: false, playable: true });

class FakeSource implements BrowseSource {
    calls: string[] = [];
    constructor(private readonly tree: Record<string, BrowseEntry[] | Error>) {}
    async list(path: string): Promise<BrowseEntry[]> {
        this.calls.push(path);
        const v = this.tree[path];
        if (v instanceof Error) throw v;
        return v ?? [];
    }
}

describe("BrowserModel", () => {
    const tree = {
        root: [folder("RadioBrowser", "rb://"), folder("Broken", "broken://")],
        "rb://": [folder("By tag", "rb://tag")],
        "rb://tag": [station("A"), station("B"), station("C")],
        "broken://": new Error("NotImplementedError"),
    };

    it("walks down into folders and back up, keeping the cursor per level", async () => {
        const m = new BrowserModel(new FakeSource(tree));
        await m.start("root", "All");
        expect(m.current?.name).toBe("RadioBrowser");
        expect(await m.enter()).toBe(true);
        expect(await m.enter()).toBe(true);
        expect(m.breadcrumb).toEqual(["All", "RadioBrowser", "By tag"]);
        m.rotate(2);
        expect(m.current?.name).toBe("C");
        expect(m.position).toEqual({ index: 3, total: 3 });
        expect(await m.enter()).toBe(false); // a station is not a folder
        expect(m.back()).toBe(true);
        expect(m.current?.name).toBe("By tag");
        expect(m.back()).toBe(true);
        expect(m.back()).toBe(false); // already at the start level
    });

    it("clamps the cursor at both ends", async () => {
        const m = new BrowserModel(new FakeSource(tree));
        await m.start("rb://tag", "Tag");
        m.rotate(-5);
        expect(m.position.index).toBe(1);
        m.rotate(50);
        expect(m.position.index).toBe(3);
    });

    it("reports errors without leaving the current level", async () => {
        const m = new BrowserModel(new FakeSource(tree));
        await m.start("root", "All");
        m.rotate(1);
        await m.enter();
        expect(m.error).toContain("NotImplemented");
        expect(m.breadcrumb).toEqual(["All"]);
    });
});

describe("toEntry", () => {
    it("maps MA folders and playable items", () => {
        const f = toEntry({ item_id: "x", provider: "rb", name: "By tag", uri: "rb://folder/tag", media_type: "folder", path: "rb://tag", is_playable: false } as never);
        expect(f).toMatchObject({ isFolder: true, playable: false, path: "rb://tag" });
        const r = toEntry({ item_id: "1", provider: "rb", name: " SWR3 ", uri: "rb://radio/1", media_type: "radio", metadata: { images: [{ type: "thumb", path: "x", provider: "rb", remotely_accessible: true, proxy_id: "abc" }] } } as never);
        expect(r).toMatchObject({ name: "SWR3", isFolder: false, playable: true, imageProxyId: "abc", uri: "rb://radio/1" });
    });
});
