// Pure parsing + domain logic for the Payroll Upload wizard (app/upload/PayrollWizard.tsx).
// No React here — mirrors the shape of lib/silk/csv.ts / lib/silk/history.ts.
//
// Two real input formats, both verified against actual sample exports:
//   - Homebase timesheet CSV (one file per location): a repeating per-employee block of
//     shift rows (see parseHomebaseCsv).
//   - Square tips CSV (one file per location): a wide report with dates as columns across
//     concatenated sections (see parseSquareTipsCsv).
// The wizard does NOT compute wages or overtime — both are handled elsewhere (see
// PayrollWizard.tsx for the full rationale); this file only ever passes through Homebase's
// own "OT hours" column and never touches Staff Payroll's Rate fields.

import type { RecordModel } from '@/lib/airtable/models';
import { str, linkIds, selectName } from '@/lib/silk/cells';
import { parseCsv, money } from '@/lib/silk/csv';
import { TS, STAFF, TIPS, PAYROLL, ROLES } from '@/lib/silk/schema';

// ── shared date/number helpers ───────────────────────────────────────────────
const MONTHS: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** "June 9 2026" -> "2026-06-09". Empty string if unparseable. */
function parseHomebaseDate(s: string): string {
    const m = s.trim().match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
    if (!m) return '';
    const mm = MONTHS[m[1].toLowerCase()];
    if (!mm) return '';
    return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`;
}

/** "06/08/2026" -> "2026-06-08". Empty string if unparseable. */
function mdyToIso(s: string): string {
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** "28 min" -> 28. Null when blank (no break taken). */
function parseBreakMinutes(s: string): number | null {
    const m = (s || '').match(/(\d+)\s*min/i);
    return m ? Number(m[1]) : null;
}

/** "5.05" -> 5.05. Null when blank. */
function parseHours(s: string): number | null {
    const t = (s || '').trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Homebase timesheet parser ────────────────────────────────────────────────
export type ShiftRecord = {
    employeeName: string;
    clockInDate: string; // ISO
    role: string;
    breakMinutes: number | null;
    scheduledHours: number | null;
    actualHours: number;
    otHours: number;
    holidayPay: number;
    pto: number;
};

export type HomebaseParseResult = {
    locationLabel: string;
    payPeriodStart: string; // ISO
    payPeriodEnd: string;   // ISO
    shifts: ShiftRecord[];
};

/**
 * Parses a Homebase timesheet export. Structure: a location-label row, a "Payroll Period"
 * row (the authoritative date range — never derive dates from the filename), then repeating
 * per-employee blocks — a header row, one data row per shift, a "Totals for <Name>" row
 * (skipped), and a dashed separator row (skipped). The employee's Name repeats on every shift
 * row, so no block-tracking is needed beyond remembering the last-seen header.
 */
export function parseHomebaseCsv(text: string): HomebaseParseResult {
    const rows = parseCsv(text);
    if (rows.length === 0) throw new Error('Empty timesheet file.');
    const locationLabel = (rows[0][0] || '').trim();

    const periodRow = rows.find(r => (r[0] || '').trim().toLowerCase() === 'payroll period');
    if (!periodRow) throw new Error('Could not find a "Payroll Period" row in this file.');
    const periodMatch = (periodRow[1] || '').match(/(\d{2}\/\d{2}\/\d{4})\s*To\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!periodMatch) throw new Error(`Could not parse the payroll period from "${periodRow[1]}".`);
    const payPeriodStart = mdyToIso(periodMatch[1]);
    const payPeriodEnd = mdyToIso(periodMatch[2]);

    const shifts: ShiftRecord[] = [];
    let header: string[] | null = null;
    for (const row of rows) {
        const first = (row[0] || '').trim();
        if (first.toLowerCase() === 'name' && (row[1] || '').trim().toLowerCase() === 'clock in date') {
            header = row.map(h => h.trim());
            continue;
        }
        if (!header) continue; // still in the location-label / payroll-period preamble
        if (/^totals for/i.test(first)) continue; // Homebase's own subtotal — not imported
        if (row.every(c => /^-+$/.test((c || '').trim()))) continue; // dashed separator row
        if (first === '') continue;

        const rec: Record<string, string> = {};
        header.forEach((h, i) => { rec[h] = (row[i] ?? '').trim(); });

        const clockInDate = rec['Clock in date'] ? parseHomebaseDate(rec['Clock in date']) : '';
        if (!clockInDate) continue; // malformed row — skip rather than crash

        shifts.push({
            employeeName: rec['Name'] || '',
            clockInDate,
            role: rec['Role'] || '',
            breakMinutes: parseBreakMinutes(rec['Break length']),
            scheduledHours: parseHours(rec['Scheduled hours']),
            actualHours: parseHours(rec['Actual hours']) ?? 0,
            otHours: parseHours(rec['OT hours']) ?? 0,
            holidayPay: parseHours(rec['Holiday pay']) ?? 0,
            pto: parseHours(rec['PTO']) ?? 0,
        });
    }
    return { locationLabel, payPeriodStart, payPeriodEnd, shifts };
}

// ── Square tips parser ───────────────────────────────────────────────────────
export type TipsDay = { date: string /*ISO*/; creditTips: number; cashTips: number };

/**
 * Parses a Square tips export for ONE location. Structure: a wide report with dates as
 * columns across concatenated sections. The "Sales Summary" section's row labeled exactly
 * "Tip" is the day's CREDIT tip pool; the "Item Sales" section's "Cash Tips" line-item row
 * (a manual workaround since Square has no native cash-tip logging) is the day's CASH tips.
 * Both were verified against a live Tips-table record (exact dollar match).
 */
export function parseSquareTipsCsv(text: string): TipsDay[] {
    const rows = parseCsv(text);

    const salesHeaderIdx = rows.findIndex(r => (r[0] || '').trim() === 'Sales');
    if (salesHeaderIdx < 0) throw new Error('Could not find the "Sales" summary header row in this file.');
    const dateCols = rows[salesHeaderIdx].slice(1).map(mdyToIso);
    const tipRow = rows.slice(salesHeaderIdx).find(r => (r[0] || '').trim() === 'Tip');
    const creditVals = tipRow ? tipRow.slice(1).map(v => money(v) ?? 0) : dateCols.map(() => 0);

    const itemHeaderIdx = rows.findIndex(r => (r[0] || '').trim() === 'Item Name' && (r[1] || '').trim() === 'Item Variation');
    const itemDateCols = itemHeaderIdx >= 0 ? rows[itemHeaderIdx].slice(3).map(mdyToIso) : [];
    const cashRow = itemHeaderIdx >= 0 ? rows.slice(itemHeaderIdx).find(r => (r[0] || '').trim() === 'Cash Tips') : undefined;
    const cashVals = cashRow ? cashRow.slice(3).map(v => money(v) ?? 0) : itemDateCols.map(() => 0);

    const byDate = new Map<string, TipsDay>();
    dateCols.forEach((date, i) => {
        if (!date) return;
        const e = byDate.get(date) ?? { date, creditTips: 0, cashTips: 0 };
        e.creditTips = creditVals[i] ?? 0;
        byDate.set(date, e);
    });
    itemDateCols.forEach((date, i) => {
        if (!date) return;
        const e = byDate.get(date) ?? { date, creditTips: 0, cashTips: 0 };
        e.cashTips = cashVals[i] ?? 0;
        byDate.set(date, e);
    });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Splits a location's parsed tip days into those inside vs. outside the matched pay period. */
export function filterTipsToPeriod(days: TipsDay[], start: string, end: string): { inRange: TipsDay[]; outOfRange: TipsDay[] } {
    return {
        inRange: days.filter(d => d.date >= start && d.date <= end),
        outOfRange: days.filter(d => d.date < start || d.date > end),
    };
}

// ── resolved shifts (wizard-local working state) ─────────────────────────────
export type ResolvedShift = ShiftRecord & {
    staffId: string | null;   // resolved Staff Payroll record id — null until Roster review resolves it
    locationId: string;
    excluded?: boolean;       // user excluded this shift in Anomaly review (zero-hours case)
    skipDuplicate?: boolean;  // user's choice for a flagged duplicate shift (default true = skip)
};

export type ShiftKey = string; // `${staffId}::${dateISO}::${role}::${locationId}`
export function shiftKey(staffId: string, dateISO: string, role: string, locationId: string): ShiftKey {
    return `${staffId}::${dateISO}::${role.trim().toLowerCase()}::${locationId}`;
}

// ── roster / role matching (exact, then loose — mirrors matchVendor in app/expenses/page.tsx) ──
export function matchStaffByHomebaseName(name: string, staff: RecordModel[]): string | null {
    const n = (name || '').trim().toLowerCase();
    if (!n) return null;
    for (const s of staff) {
        if ((str(s, STAFF.homebaseName) || '').trim().toLowerCase() === n) return s.id;
    }
    for (const s of staff) {
        const hn = (str(s, STAFF.homebaseName) || '').trim().toLowerCase();
        if (hn && (hn.includes(n) || n.includes(hn))) return s.id;
    }
    return null;
}

/** Resolves a shift's free-text Role against the Roles table's Name -> Departement mapping. */
export function matchRoleDepartment(role: string, roles: RecordModel[]): string | null {
    const n = (role || '').trim().toLowerCase();
    if (!n) return null;
    for (const r of roles) {
        if ((str(r, ROLES.name) || '').trim().toLowerCase() === n) return selectName(r, ROLES.department) || null;
    }
    for (const r of roles) {
        const rn = (str(r, ROLES.name) || '').trim().toLowerCase();
        if (rn && (rn.includes(n) || n.includes(rn))) return selectName(r, ROLES.department) || null;
    }
    return null;
}

// ── anomaly detection ─────────────────────────────────────────────────────────
/** A shift clocked 0 actual hours despite being scheduled — usually a forgotten clock-out. */
export function detectZeroHourShifts(shifts: ResolvedShift[]): ResolvedShift[] {
    return shifts.filter(s => s.actualHours === 0 && (s.scheduledHours ?? 0) > 0);
}

/** Shifts that already exist in Time Sheets (staff+date+role+location) — likely a re-upload. */
export function detectDuplicateShifts(candidates: ResolvedShift[], existingTimeSheets: RecordModel[]): Set<ShiftKey> {
    const existingKeys = new Set<ShiftKey>();
    for (const r of existingTimeSheets) {
        const staffIds = linkIds(r, TS.staffPayrollLink);
        const locIds = linkIds(r, TS.locations);
        const dateISO = str(r, TS.dateField);
        if (!staffIds.length || !locIds.length || !dateISO) continue;
        existingKeys.add(shiftKey(staffIds[0], dateISO, str(r, TS.assignedRole), locIds[0]));
    }
    const dupes = new Set<ShiftKey>();
    for (const s of candidates) {
        if (!s.staffId) continue;
        const k = shiftKey(s.staffId, s.clockInDate, s.role, s.locationId);
        if (existingKeys.has(k)) dupes.add(k);
    }
    return dupes;
}

// ── tip allocation ────────────────────────────────────────────────────────────
/**
 * Default tip split for one day AT ONE LOCATION: tips/hr = day's total tips ÷ day's total
 * actual hours, then each shift earns tips/hr * its own hours (both Time Sheets and Payroll
 * already have rollup fields literally named "Tips/hr", strong evidence this is the real
 * mechanism). `shiftsThatDay` must already be filtered to this location — Tips are pooled
 * per location, not combined across both cafes.
 */
export function allocateTipsForDay(day: TipsDay, shiftsThatDay: ResolvedShift[]): Map<ShiftKey, number> {
    const map = new Map<ShiftKey, number>();
    const totalHours = shiftsThatDay.reduce((s, sh) => s + sh.actualHours, 0);
    if (totalHours <= 0) return map;
    const perHour = (day.creditTips + day.cashTips) / totalHours;
    for (const sh of shiftsThatDay) {
        if (!sh.staffId) continue;
        map.set(shiftKey(sh.staffId, sh.clockInDate, sh.role, sh.locationId), perHour * sh.actualHours);
    }
    return map;
}

// ── pivot (employee × role, summed for the pay period) ───────────────────────
export type PivotRow = {
    staffId: string; role: string; locationId: string;
    hours: number; ot: number; pto: number; holiday: number; tips: number;
    department: string | null;
};

export function buildPivot(shifts: ResolvedShift[], tipsByShift: Map<ShiftKey, number>, roles: RecordModel[]): PivotRow[] {
    const groups = new Map<string, PivotRow>();
    for (const s of shifts) {
        if (!s.staffId || s.excluded || s.skipDuplicate) continue;
        const gKey = `${s.staffId}::${s.role.trim().toLowerCase()}::${s.locationId}`;
        const tip = tipsByShift.get(shiftKey(s.staffId, s.clockInDate, s.role, s.locationId)) ?? 0;
        const row = groups.get(gKey) ?? {
            staffId: s.staffId, role: s.role, locationId: s.locationId,
            hours: 0, ot: 0, pto: 0, holiday: 0, tips: 0,
            department: matchRoleDepartment(s.role, roles),
        };
        row.hours += s.actualHours;
        row.ot += s.otHours;
        row.pto += s.pto;
        row.holiday += s.holidayPay;
        row.tips += tip;
        groups.set(gKey, row);
    }
    return [...groups.values()].map(r => ({
        ...r, hours: round2(r.hours), ot: round2(r.ot), pto: round2(r.pto), holiday: round2(r.holiday), tips: round2(r.tips),
    }));
}

// ── Airtable payload builders (pure — the wizard performs the actual writes) ──
export function buildTimeSheetFields(
    shift: ResolvedShift, staffId: string, payPeriod: string, locId: string, tipsRecordId: string | undefined,
): Record<string, unknown> {
    const f: Record<string, unknown> = {
        [TS.dateField]: shift.clockInDate,
        [TS.locations]: [locId],
        [TS.payPeriod]: payPeriod,
        [TS.staffPayrollLink]: [staffId],
        [TS.assignedRole]: shift.role,
        [TS.actualHours]: shift.actualHours,
        [TS.pto]: shift.pto,
        [TS.holidayPay]: shift.holidayPay,
        [TS.ot]: shift.otHours,
    };
    if (shift.breakMinutes != null) f[TS.breakMin] = shift.breakMinutes;
    if (tipsRecordId) f[TS.tipsLink] = [tipsRecordId];
    return f;
}

/** Fields for ONE location's write on a shared per-day Tips row (create or merge-update). */
export function buildTipsFields(day: TipsDay, locKey: '763' | '869'): Record<string, unknown> {
    return locKey === '763'
        ? { [TIPS.date]: day.date, [TIPS.credit763]: day.creditTips, [TIPS.cash763]: day.cashTips }
        : { [TIPS.date]: day.date, [TIPS.credit869]: day.creditTips, [TIPS.cash869]: day.cashTips };
}

/** Never sets Wage — wage resolution is out of scope for this wizard (see PayrollWizard.tsx). */
export function buildPayrollFields(row: PivotRow, payPeriod: string, periodStartISO: string): Record<string, unknown> {
    const f: Record<string, unknown> = {
        [PAYROLL.payPeriod]: payPeriod,
        [PAYROLL.date]: periodStartISO,
        [PAYROLL.staffProfiles]: [row.staffId],
        [PAYROLL.role]: row.role,
        [PAYROLL.hours]: row.hours,
        [PAYROLL.ot]: row.ot,
        [PAYROLL.pto]: row.pto,
        [PAYROLL.holiday]: row.holiday,
        [PAYROLL.tips]: row.tips,
        [PAYROLL.locations]: [row.locationId],
    };
    if (row.department) f[PAYROLL.department] = row.department;
    return f;
}

// ── CSV export for the payroll provider (standalone download, not gated on approval) ──
function csvEscape(v: string): string {
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildPivotCsv(rows: PivotRow[], staffNames: Map<string, string>, locationNames: Map<string, string>): string {
    const header = ['Employee', 'Role', 'Location', 'Hours', 'OT', 'Holiday', 'PTO', 'Tips', 'Department'];
    const lines = [header.join(',')];
    for (const r of rows) {
        const vals = [
            staffNames.get(r.staffId) ?? r.staffId,
            r.role,
            locationNames.get(r.locationId) ?? r.locationId,
            r.hours.toFixed(2), r.ot.toFixed(2), r.holiday.toFixed(2), r.pto.toFixed(2), r.tips.toFixed(2),
            r.department ?? '',
        ];
        lines.push(vals.map(v => csvEscape(String(v))).join(','));
    }
    return lines.join('\r\n');
}
