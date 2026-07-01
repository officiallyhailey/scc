// User-dismissed price flags, persisted in localStorage. A flag is keyed by the inventory item id
// AND the date of the purchase that triggered it — so dismissing "silences" the current jump, but a
// NEWER purchase (a different date) re-raises the flag. Purely client-side; no schema field needed.

const KEY = 'silk.dismissedFlags.v1';

export function flagKey(itemId: string, latestDate: string): string {
    return `${itemId}::${latestDate}`;
}

export function loadDismissed(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = window.localStorage.getItem(KEY);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
}

export function saveDismissed(set: Set<string>): void {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* quota / privacy mode — ignore */ }
}
