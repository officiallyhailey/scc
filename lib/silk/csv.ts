// Tiny CSV helpers for the deterministic Sales upload (Square item-sales-summary).
// No dependencies; handles quoted fields, embedded commas/newlines, and a BOM.

export function parseCsv(input: string): string[][] {
    let text = input;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
            } else field += c;
            continue;
        }
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\r') { /* ignore */ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += c;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    // Drop fully-empty rows.
    return rows.filter(r => r.some(c => c.trim() !== ''));
}

export type CsvRecord = Record<string, string>;

/** Rows → records keyed by header. Finds the header row (the one naming the data columns). */
export function toRecords(rows: string[][]): { headers: string[]; records: CsvRecord[] } {
    if (rows.length === 0) return { headers: [], records: [] };
    let hIdx = rows.findIndex(r => {
        const joined = r.join(' ').toLowerCase();
        return joined.includes('item') && (joined.includes('net sales') || joined.includes('items sold'));
    });
    if (hIdx < 0) hIdx = 0;
    const headers = rows[hIdx].map(h => h.trim());
    const records = rows.slice(hIdx + 1).map(r => {
        const o: CsvRecord = {};
        headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
        return o;
    });
    return { headers, records };
}

/** Case-insensitive lookup across candidate header names. */
export function field(rec: CsvRecord, names: string[]): string {
    const keys = Object.keys(rec);
    for (const n of names) {
        const k = keys.find(key => key.toLowerCase() === n.toLowerCase());
        if (k) return rec[k];
    }
    return '';
}

/** "$1,234.50" / "(12.00)" → number (keeps sign; parens = negative). */
export function money(s: string): number | null {
    const t = (s ?? '').trim();
    if (t === '') return null;
    const neg = /^\(.*\)$/.test(t);
    const n = Number(t.replace(/[()$,\s]/g, ''));
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
}

/** First YYYY-MM-DD in a Square filename → the Sunday that starts that week (YYYY-MM-DD). */
export function sundayFromFilename(filename: string): string | null {
    const m = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // getUTCDay() 0=Sun → roll back to Sunday on/before
    return d.toISOString().slice(0, 10);
}
