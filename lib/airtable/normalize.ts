// Translate between Airtable REST values and the shapes the Blocks SDK returned,
// so the ported interface code (which expects SDK shapes) keeps working unchanged.

// Field types Airtable treats as computed / read-only.
const COMPUTED_TYPES = new Set([
    'formula', 'rollup', 'count', 'lookup', 'multipleLookupValues',
    'createdTime', 'createdBy', 'lastModifiedTime', 'lastModifiedBy',
    'autoNumber', 'aiText', 'externalSyncSource', 'button',
]);

export function isComputedType(type: string): boolean {
    return COMPUTED_TYPES.has(type);
}

// Types whose value is a list of option-like things; the SDK exposes these as
// arrays of { name } objects, while REST returns arrays of plain strings.
const NAMEY_LIST_TYPES = new Set(['multipleSelects', 'formula', 'rollup', 'multipleLookupValues']);

function asNameObjects(raw: unknown): unknown {
    if (!Array.isArray(raw)) return raw;
    return raw.map(v => (typeof v === 'string' ? { name: v } : v));
}

/** REST value → SDK-shaped value for `record.getCellValue(field)`. */
export function normalizeRead(type: string, raw: unknown): unknown {
    if (raw == null) return null;
    if (type === 'singleSelect') return typeof raw === 'string' ? { name: raw } : raw;
    if (type === 'multipleAttachments' || type === 'aiText') return raw;
    if (NAMEY_LIST_TYPES.has(type)) return asNameObjects(raw);
    return raw;
}

/** REST value → string for `record.getCellValueAsString(field)`. */
export function normalizeString(type: string, raw: unknown): string {
    if (raw == null) return '';
    switch (type) {
        case 'aiText':
            return typeof raw === 'object' ? String((raw as { value?: unknown }).value ?? '') : String(raw);
        case 'singleSelect':
            return typeof raw === 'object' ? String((raw as { name?: unknown }).name ?? '') : String(raw);
        case 'multipleSelects':
            return Array.isArray(raw)
                ? raw.map(v => (typeof v === 'string' ? v : (v as { name?: string })?.name)).filter(Boolean).join(', ')
                : '';
        case 'multipleAttachments':
            return Array.isArray(raw) ? raw.map(a => (a as { filename?: string })?.filename).filter(Boolean).join(', ') : '';
        case 'formula':
        case 'rollup':
        case 'multipleLookupValues':
            if (Array.isArray(raw)) {
                return raw
                    .map(v => (typeof v === 'string' ? v : (v as { name?: string; value?: unknown })?.name ?? (v as { value?: unknown })?.value ?? ''))
                    .filter(x => x !== '')
                    .join(', ');
            }
            return String(raw);
        default:
            return typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    }
}

/** SDK-shaped write value → REST write value (e.g. [{name}] → ["name"]). */
export function normalizeWrite(type: string, value: unknown): unknown {
    if (value === undefined) return undefined;
    if (type === 'multipleSelects' && Array.isArray(value)) {
        return value.map(v => (typeof v === 'string' ? v : (v as { name?: string })?.name));
    }
    if (type === 'singleSelect' && value && typeof value === 'object') {
        return (value as { name?: string }).name;
    }
    return value;
}
