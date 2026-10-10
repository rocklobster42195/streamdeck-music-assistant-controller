/**
 * Music Assistant answers a play, skip or seek when the speaker has what it plays next, and with a
 * slow provider (Spotify) that can take longer than a client waits (measured 2026-10-10: a Next
 * answered after more than 10 s, although it went through: the queue had moved on). So the caller
 * waits a short while, which still surfaces a quick refusal, and a slow answer is left to finish
 * in the background instead of showing an error for a command that works.
 */
export async function acknowledged(call: Promise<unknown>, what: string, log: { info(...a: unknown[]): void; warn(...a: unknown[]): void }, ms = 2500): Promise<void> {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<"slow">((resolve) => {
        timer = setTimeout(() => resolve("slow"), ms);
    });
    try {
        const first = await Promise.race([call.then(() => "done" as const), slow]);
        if (first === "slow") {
            call.then(
                () => log.info(`[MA] ${what} answered after ${Date.now() - started} ms`),
                (e) => log.warn(`[MA] ${what} failed after ${Date.now() - started} ms`, e),
            );
        }
    } finally {
        clearTimeout(timer);
    }
}
