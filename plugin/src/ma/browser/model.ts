import type { BrowseEntry, BrowseSource } from "./types";

type Level = { path: string; name: string; items: BrowseEntry[]; index: number };

/**
 * Navigation state of the browser dial: a stack of levels, each with its items and a cursor.
 * Pure logic (no Stream Deck), driven by a {@link BrowseSource}.
 */
export class BrowserModel {
    private stack: Level[] = [];
    loading = false;
    error: string | undefined;
    private loadToken = 0;

    constructor(
        private readonly source: BrowseSource,
        private readonly onChange: () => void = () => {},
    ) {}

    get depth(): number {
        return this.stack.length;
    }

    get level(): Level | undefined {
        return this.stack.at(-1);
    }

    get current(): BrowseEntry | undefined {
        const l = this.level;
        return l?.items[l.index];
    }

    /** "3 / 24" style position (1-based). */
    get position(): { index: number; total: number } {
        const l = this.level;
        return { index: l ? l.index + 1 : 0, total: l?.items.length ?? 0 };
    }

    /** Names from the start level to the current one. */
    get breadcrumb(): string[] {
        return this.stack.map((l) => l.name);
    }

    async start(path: string, name: string): Promise<void> {
        this.stack = [];
        await this.open(path, name);
    }

    /** Move the cursor; clamps at both ends. */
    rotate(ticks: number): void {
        const l = this.level;
        if (!l || !l.items.length) return;
        l.index = Math.min(l.items.length - 1, Math.max(0, l.index + ticks));
        this.onChange();
    }

    /** Open the current entry if it is a folder. Returns false if it is not. */
    async enter(): Promise<boolean> {
        const entry = this.current;
        if (!entry?.isFolder || !entry.path) return false;
        await this.open(entry.path, entry.name);
        return true;
    }

    /** One level up. Returns false when already at the start level. */
    back(): boolean {
        if (this.stack.length <= 1) return false;
        this.stack.pop();
        this.error = undefined;
        this.loadToken++; // ignore a load that is still running for the level we left
        this.loading = false;
        this.onChange();
        return true;
    }

    private async open(path: string, name: string): Promise<void> {
        const token = ++this.loadToken;
        this.loading = true;
        this.error = undefined;
        this.onChange();
        try {
            const items = await this.source.list(path);
            if (token !== this.loadToken) return;
            this.stack.push({ path, name, items, index: 0 });
        } catch (e) {
            if (token !== this.loadToken) return;
            this.error = String((e as Error)?.message ?? e);
        } finally {
            if (token === this.loadToken) {
                this.loading = false;
                this.onChange();
            }
        }
    }
}
