// Shared, pure helpers for reading Airtable cell values and formatting numbers.
//
// Every page used to define its own copies of these (num/str/linkIds/…); they now
// live here so the behaviour is identical everywhere. All readers take a RecordModel
// and a *field ID* (from `lib/silk/schema.ts`) — never a field name.

import type { RecordModel, TableModel } from '@/lib/airtable/models';

// ── formatting ──────────────────────────────────────────────────────────────
/** Currency with cents, e.g. $1,234.50. */
export const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
/** Currency rounded to the dollar, e.g. $1,235 (used in the dense scorecard grid). */
export const usd0 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
/** A 0–1 ratio as a whole-number percent, e.g. 0.34 → "34%". */
export const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

// ── cell readers ────────────────────────────────────────────────────────────
/** Numeric cell value (0 when empty/non-numeric). */
export function num(rec: RecordModel, fid: string): number {
    const v = rec.getCellValue(fid);
    return typeof v === 'number' ? v : Number(v) || 0;
}

/** Cell value as a display string. */
export function str(rec: RecordModel, fid: string): string {
    return rec.getCellValueAsString(fid) || '';
}

/** Numeric cell value as an edit-field string ('' when empty), preserving precision. */
export function numStr(rec: RecordModel, fid: string): string {
    const v = rec.getCellValue(fid);
    return v == null || v === '' ? '' : String(v);
}

/** A linked-record cell → array of record-ID strings (REST returns ids; tolerate {id} objects). */
export function linkIds(rec: RecordModel, fid: string): string[] {
    const v = rec.getCellValue(fid);
    if (!Array.isArray(v)) return [];
    return v.map(x => (typeof x === 'string' ? x : (x as { id?: string })?.id ?? '')).filter(Boolean);
}

/** Select / lookup cell → array of option names. Handles multipleSelects, lookups
 *  (arrays of strings or {name}), single select ({name}), and bare strings. */
export function selectNames(rec: RecordModel, fid: string): string[] {
    const v = rec.getCellValue(fid);
    if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : (x as { name?: string })?.name ?? String(x ?? ''))).filter(Boolean);
    if (v && typeof v === 'object' && 'name' in v) return [(v as { name: string }).name];
    return typeof v === 'string' && v ? [v] : [];
}

/** First option name of a select/lookup cell (or ''). */
export const selectName = (rec: RecordModel, fid: string): string => selectNames(rec, fid)[0] ?? '';

/** The choice names of a single/multiple-select field, read from the table schema. */
export function fieldChoices(table: TableModel, fid: string): string[] {
    const f = table.getFieldIfExists(fid);
    const ch = (f?.options as { choices?: { name: string }[] } | undefined)?.choices;
    return Array.isArray(ch) ? ch.map(c => c.name) : [];
}

/** record id → primary-field display name, for resolving linked records. */
export function nameMap(records: RecordModel[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const r of records) m.set(r.id, r.name || '(untitled)');
    return m;
}

// ── misc ────────────────────────────────────────────────────────────────────
/** A "MM/DD/YYYY" week label → sortable "YYYYMMDD" key (empty sorts last). */
export function weekKey(s: string): string {
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}` : '0';
}

/** Parse an edit-field string into a number for writing (null when blank/invalid). */
export function parseNum(s: string): number | null {
    if (s.trim() === '') return null;
    const n = Number(s.replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : null;
}
