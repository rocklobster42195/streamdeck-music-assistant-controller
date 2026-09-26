/** One entry the browser dial can show. */
export type BrowseEntry = {
    name: string;
    /** Folder path to open (folders only). */
    path?: string;
    /** URI to play (playable entries only). */
    uri?: string;
    mediaType: string;
    isFolder: boolean;
    playable: boolean;
    imageProxyId?: string;
    subtitle?: string;
};

/** Where browsing starts. */
export type BrowseStart = "providers" | "library";

export const PROVIDERS_ROOT = "mac:providers";
export const LIBRARY_ROOT = "mac:library";

export interface BrowseSource {
    list(path: string): Promise<BrowseEntry[]>;
}

/** Music provider instances to show (e.g. only Spotify); undefined = all. */
export type ProviderFilter = ReadonlySet<string> | undefined;
