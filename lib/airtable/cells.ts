// ── Cell-value helpers ────────────────────────────────────────────────────────
// Small readers shared by the interface pages for pulling typed values out of a
// RecordModel. They tolerate the slightly different shapes normalize.ts can hand
// back (objects vs. strings vs. arrays) so callers don't repeat the guards.

// First attachment's thumbnail (or full) URL, for favicons / logos.
export function getFaviconUrl(record: any, faviconField: any): string | null {
    if (!faviconField) return null;
    const v = record.getCellValue(faviconField);
    if (!Array.isArray(v) || v.length === 0) return null;
    const att = v[0];
    return att?.thumbnails?.small?.url ?? att?.url ?? null;
}

// A createdTime field as an epoch-ms number, with a string-parse fallback so
// records still sort sensibly when the raw value comes back unreadable.
export function getCreatedTime(record: any, createdField: any): number {
    if (!createdField) return 0;
    const raw = record.getCellValue(createdField);
    if (typeof raw === 'number') return raw;
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'string') { const t = Date.parse(raw); if (!Number.isNaN(t)) return t; }
    const s = record.getCellValueAsString(createdField);
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
}

// A single-select field's chosen option name (or '').
export function getSingleSelectName(record: any, field: any): string {
    if (!field) return '';
    const v = record.getCellValue(field);
    return v && typeof v === 'object' && 'name' in v ? (v as { name: string }).name : '';
}

// A select field's option names as an array — handles multipleSelects (array of
// { name }) and gracefully degrades for a single-select or bare string.
export function getSelectNames(record: any, field: any): string[] {
    if (!field) return [];
    const v = record.getCellValue(field);
    if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : (x && typeof x === 'object' && 'name' in x ? (x as { name: string }).name : ''))).filter(Boolean);
    if (v && typeof v === 'object' && 'name' in v) return [(v as { name: string }).name];
    if (typeof v === 'string' && v) return [v];
    return [];
}
