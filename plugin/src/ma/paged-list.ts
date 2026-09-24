/**
 * Random access into a long server-side list, loaded page by page on demand.
 * `get(i)` returns the item if its page is loaded, otherwise starts loading it and returns undefined;
 * `onLoaded` fires when a page arrives. `invalidate()` drops everything (e.g. the queue changed).
 */
export class PagedList<T> {
    private readonly pages = new Map<number, T[]>();
    private readonly loading = new Set<number>();
    private generation = 0;

    constructor(
        private readonly fetchPage: (offset: number, limit: number) => Promise<T[]>,
        private readonly onLoaded: () => void = () => {},
        readonly pageSize = 25,
    ) {}

    get(index: number): T | undefined {
        if (index < 0) return undefined;
        const page = Math.floor(index / this.pageSize);
        const items = this.pages.get(page);
        if (items) {
            // Prefetch the neighbour page when close to its edge
            const pos = index % this.pageSize;
            if (pos > this.pageSize - 5) this.load(page + 1);
            if (pos < 5 && page > 0) this.load(page - 1);
            return items[index % this.pageSize];
        }
        this.load(page);
        return undefined;
    }

    invalidate(): void {
        this.generation++;
        this.pages.clear();
        this.loading.clear();
    }

    private load(page: number): void {
        if (this.pages.has(page) || this.loading.has(page)) return;
        const gen = this.generation;
        this.loading.add(page);
        this.fetchPage(page * this.pageSize, this.pageSize)
            .then((items) => {
                if (gen !== this.generation) return;
                this.pages.set(page, items ?? []);
                this.onLoaded();
            })
            .catch(() => {})
            .finally(() => {
                if (gen === this.generation) this.loading.delete(page);
            });
    }
}
