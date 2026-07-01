'use client';

// Payroll upload — a structured multi-step wizard (no chat, no Google Sheets dependency).
// Recreates the judgment calls that used to happen back-and-forth in a Claude Code chat
// session running /payroll-report as concrete on-screen actions instead: a roster fix/create
// screen (mirrors the Vendor "+Add" pattern), an anomaly review, and an in-app editable pivot
// with an explicit approval gate before the final Payroll-table write. Both CSVs are parsed
// deterministically (lib/silk/payroll.ts) — no Claude call, unlike the Expense flow.
//
// The wizard does NOT compute wages (Rate resolution lives entirely in Airtable's own
// field-linking, elsewhere) and does NOT compute overtime (tracked on another platform) — it
// passes through Homebase's own "OT hours" column verbatim and never writes Payroll.Wage.

import React, { useMemo, useState } from 'react';
import {
    CheckCircleIcon, WarningCircleIcon, InfoIcon, ArrowRightIcon, DownloadSimpleIcon,
    SparkleIcon, UsersThreeIcon, ArrowLeftIcon,
} from '@phosphor-icons/react';
import { useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel } from '@/lib/airtable/models';
import { glass, Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { Field, PlainSelect, LinkPicker, InlineSelect } from '@/lib/components/fields';
import { TABLES, TS, STAFF, TIPS, PAYROLL, formatPayPeriod } from '@/lib/silk/schema';
import { str, num, linkIds, nameMap, fieldChoices } from '@/lib/silk/cells';
import {
    parseHomebaseCsv, parseSquareTipsCsv, filterTipsToPeriod,
    matchStaffByHomebaseName, buildPivot, buildTimeSheetFields, buildTipsFields, buildPayrollFields, buildPivotCsv,
    shiftKey,
    type ResolvedShift, type TipsDay, type PivotRow, type ShiftKey,
} from '@/lib/silk/payroll';

// ── tiny local helpers (duplicated rather than imported from ./page.tsx to avoid a circular import) ──
function fileToText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}
function requestNotifyPermission() {
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* unsupported */ }
}
function notify(title: string, body: string) {
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body }); } catch { /* unsupported */ }
}

type Step = 'upload' | 'roster' | 'anomalies' | 'pivot' | 'done';
type SlotKey = 'ts763' | 'ts869' | 'tips763' | 'tips869';
type Flag = { tone: 'warn' | 'info'; text: string };

type ParsedData = {
    shifts: ResolvedShift[];
    payPeriodStart: string; // ISO
    payPeriodEnd: string;   // ISO
    tipsByLoc: Record<'763' | '869', TipsDay[]>;
    outOfRangeNotes: string[];
};

export function PayrollWizard() {
    const base = useBase();
    const timeSheetsTable = base.tables.find(t => t.id === TABLES.timeSheets)!;
    const staffPayrollTable = base.tables.find(t => t.id === TABLES.staffPayroll)!;
    const tipsTable = base.tables.find(t => t.id === TABLES.tips)!;
    const payrollTable = base.tables.find(t => t.id === TABLES.payroll)!;
    const rolesTable = base.tables.find(t => t.id === TABLES.roles)!;
    const locationsTable = base.tables.find(t => t.id === TABLES.locations)!;

    const staff = useRecords(staffPayrollTable);
    const existingTimeSheets = useRecords(timeSheetsTable);
    const existingTips = useRecords(tipsTable);
    const roles = useRecords(rolesTable);
    const locations = useRecords(locationsTable);

    const staffNames = useMemo(() => nameMap(staff), [staff]);
    const locationNames = useMemo(() => nameMap(locations), [locations]);
    const loc763Id = useMemo(() => locations.find(l => (l.name || '').trim() === '763')?.id, [locations]);
    const loc869Id = useMemo(() => locations.find(l => (l.name || '').trim() === '869')?.id, [locations]);
    const departmentChoices = useMemo(() => fieldChoices(payrollTable, PAYROLL.department), [payrollTable]);

    const [step, setStep] = useState<Step>('upload');
    const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
    const [parsed, setParsed] = useState<ParsedData | null>(null);
    const [err, setErr] = useState('');
    const [running, setRunning] = useState(false);
    const [writeProgress, setWriteProgress] = useState<{ label: string; done: number; total: number } | null>(null);

    // Roster review: Homebase name -> resolved Staff Payroll record id.
    const [rosterMap, setRosterMap] = useState<Map<string, string>>(new Map());
    const [newStaffNames, setNewStaffNames] = useState<Set<string>>(new Set());

    // Anomaly review: per-shift-index resolution for zero-hours rows, per-ShiftKey skip choice for duplicates.
    const [zeroHourRes, setZeroHourRes] = useState<Map<number, { excluded: boolean; overrideHours: number | null }>>(new Map());
    const [duplicateSkip, setDuplicateSkip] = useState<Map<ShiftKey, boolean>>(new Map());

    // Pivot review: per-group-key overrides for the two editable cells.
    const [pivotOverrides, setPivotOverrides] = useState<Map<string, { tips?: number; department?: string }>>(new Map());

    const [result, setResult] = useState<{ timeSheetsCreated: number; payrollCreated: number; newStaffCreated: number; flags: Flag[] } | null>(null);

    // ── step 1: file intake ──────────────────────────────────────────────────
    function setSlot(slot: SlotKey, file: File | null) {
        setFiles(prev => ({ ...prev, [slot]: file ?? undefined }));
        setErr('');
    }

    async function parseFiles() {
        setErr('');
        if (!files.ts763 || !files.ts869 || !files.tips763 || !files.tips869) { setErr('All four files are required.'); return; }
        if (!loc763Id || !loc869Id) { setErr('Could not find the 763/869 locations in Airtable.'); return; }
        try {
            const [ts763Text, ts869Text, tips763Text, tips869Text] = await Promise.all([
                fileToText(files.ts763), fileToText(files.ts869), fileToText(files.tips763), fileToText(files.tips869),
            ]);
            const hb763 = parseHomebaseCsv(ts763Text);
            const hb869 = parseHomebaseCsv(ts869Text);
            if (hb763.payPeriodStart !== hb869.payPeriodStart || hb763.payPeriodEnd !== hb869.payPeriodEnd) {
                setErr(`The two timesheet files have different pay periods (763: ${hb763.payPeriodStart} – ${hb763.payPeriodEnd}; 869: ${hb869.payPeriodStart} – ${hb869.payPeriodEnd}). They must match.`);
                return;
            }
            const tips763Days = parseSquareTipsCsv(tips763Text);
            const tips869Days = parseSquareTipsCsv(tips869Text);
            const f763 = filterTipsToPeriod(tips763Days, hb763.payPeriodStart, hb763.payPeriodEnd);
            const f869 = filterTipsToPeriod(tips869Days, hb763.payPeriodStart, hb763.payPeriodEnd);
            const outOfRangeNotes: string[] = [];
            if (f763.outOfRange.length) outOfRangeNotes.push(`763 tips file: ${f763.outOfRange.length} day(s) outside the matched pay period were ignored.`);
            if (f869.outOfRange.length) outOfRangeNotes.push(`869 tips file: ${f869.outOfRange.length} day(s) outside the matched pay period were ignored.`);

            const shifts763: ResolvedShift[] = hb763.shifts.map(s => ({ ...s, locationId: loc763Id, staffId: matchStaffByHomebaseName(s.employeeName, staff) }));
            const shifts869: ResolvedShift[] = hb869.shifts.map(s => ({ ...s, locationId: loc869Id, staffId: matchStaffByHomebaseName(s.employeeName, staff) }));

            setParsed({
                shifts: [...shifts763, ...shifts869],
                payPeriodStart: hb763.payPeriodStart,
                payPeriodEnd: hb763.payPeriodEnd,
                tipsByLoc: { '763': f763.inRange, '869': f869.inRange },
                outOfRangeNotes,
            });
            setRosterMap(new Map());
            setNewStaffNames(new Set());
            setZeroHourRes(new Map());
            setDuplicateSkip(new Map());
            setPivotOverrides(new Map());
            setStep('roster');
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Could not parse one of the files.');
        }
    }

    // ── step 2: roster review ────────────────────────────────────────────────
    const distinctUnmatchedNames = useMemo(() => {
        if (!parsed) return [];
        const names = new Set<string>();
        for (const s of parsed.shifts) if (!s.staffId) names.add(s.employeeName);
        return [...names].sort();
    }, [parsed]);
    const rosterResolved = distinctUnmatchedNames.every(n => rosterMap.has(n));

    function resolveRosterName(name: string, staffId: string) {
        setRosterMap(m => new Map(m).set(name, staffId));
    }
    async function createStaffForRoster(name: string): Promise<string | null> {
        const locIds = new Set<string>();
        for (const s of parsed?.shifts ?? []) if (s.employeeName === name) locIds.add(s.locationId);
        try {
            const id = await staffPayrollTable.createRecordAsync({
                [STAFF.homebaseName]: name.trim(),
                [STAFF.payrollName]: name.trim(),
                [STAFF.locations]: [...locIds],
            });
            setNewStaffNames(s => new Set(s).add(name));
            return id;
        } catch { return null; }
    }
    function confirmRoster() {
        setParsed(p => p ? { ...p, shifts: p.shifts.map(s => s.staffId ? s : { ...s, staffId: rosterMap.get(s.employeeName) ?? null }) } : p);
        setStep('anomalies');
    }

    // ── step 3: anomaly review ───────────────────────────────────────────────
    const zeroHourShifts = useMemo(() => {
        if (!parsed) return [];
        return parsed.shifts
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s.actualHours === 0 && (s.scheduledHours ?? 0) > 0);
    }, [parsed]);
    const zeroHourResolved = zeroHourShifts.every(({ i }) => zeroHourRes.has(i));

    const duplicateKeys = useMemo(() => {
        if (!parsed) return new Set<ShiftKey>();
        const existingKeys = new Set<ShiftKey>();
        for (const r of existingTimeSheets) {
            const staffIds = linkIds(r, TS.staffPayrollLink);
            const locIds = linkIds(r, TS.locations);
            const dateISO = str(r, TS.dateField);
            if (!staffIds.length || !locIds.length || !dateISO) continue;
            existingKeys.add(shiftKey(staffIds[0], dateISO, str(r, TS.assignedRole), locIds[0]));
        }
        return existingKeys;
    }, [parsed, existingTimeSheets]);
    const duplicateShifts = useMemo(() => {
        if (!parsed) return [];
        return parsed.shifts
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s.staffId && duplicateKeys.has(shiftKey(s.staffId, s.clockInDate, s.role, s.locationId)));
    }, [parsed, duplicateKeys]);

    async function confirmAnomaliesAndWrite() {
        if (!parsed) return;
        const finalShifts: ResolvedShift[] = parsed.shifts.map((s, i) => {
            let next = s;
            const zh = zeroHourRes.get(i);
            if (zh) {
                if (zh.excluded) next = { ...next, excluded: true };
                else if (zh.overrideHours != null) next = { ...next, actualHours: zh.overrideHours };
            }
            if (next.staffId) {
                const k = shiftKey(next.staffId, next.clockInDate, next.role, next.locationId);
                const flaggedDup = duplicateKeys.has(k);
                const skip = duplicateSkip.has(k) ? duplicateSkip.get(k)! : flaggedDup; // default: skip if flagged
                if (skip) next = { ...next, skipDuplicate: true };
            }
            return next;
        });

        setRunning(true); setErr('');
        try {
            const payPeriodLabel = formatPayPeriod(parsed.payPeriodStart, parsed.payPeriodEnd);

            // Step 1: Tips — per unique date, per location. A partial-field PATCH only ever
            // touches the fields given, so writing 869's two currency fields onto a record that
            // already has 763's fields (or vice versa) never clobbers the other location's data.
            const existingTipsByDate = new Map<string, RecordModel>();
            for (const r of existingTips) { const d = str(r, TIPS.date); if (d) existingTipsByDate.set(d, r); }
            const tipsRecordIdByDate = new Map<string, string>();
            const tipsWrites: { locKey: '763' | '869'; day: TipsDay }[] = [
                ...parsed.tipsByLoc['763'].map(day => ({ locKey: '763' as const, day })),
                ...parsed.tipsByLoc['869'].map(day => ({ locKey: '869' as const, day })),
            ];
            let tipsDone = 0;
            setWriteProgress({ label: 'Writing Tips', done: 0, total: tipsWrites.length });
            for (const w of tipsWrites) {
                const fields = buildTipsFields(w.day, w.locKey);
                const alreadyThisRun = tipsRecordIdByDate.get(w.day.date);
                if (alreadyThisRun) {
                    await tipsTable.updateRecordAsync(alreadyThisRun, fields);
                } else {
                    const existing = existingTipsByDate.get(w.day.date);
                    if (existing) { await tipsTable.updateRecordAsync(existing, fields); tipsRecordIdByDate.set(w.day.date, existing.id); }
                    else { const id = await tipsTable.createRecordAsync(fields); tipsRecordIdByDate.set(w.day.date, id); }
                }
                tipsDone++; setWriteProgress({ label: 'Writing Tips', done: tipsDone, total: tipsWrites.length });
            }

            // Step 2: Time Sheets — one per importable shift, each linking straight to its day's
            // Tips record at creation time. Time Sheets<->Tips is a two-way Airtable link, so this
            // keeps the Tips record's own link in sync automatically — no separate update pass.
            const importable = finalShifts.filter(s => s.staffId && !s.excluded && !s.skipDuplicate);
            let tsDone = 0;
            setWriteProgress({ label: 'Writing Time Sheets', done: 0, total: importable.length });
            for (const s of importable) {
                const tipsId = tipsRecordIdByDate.get(s.clockInDate);
                await timeSheetsTable.createRecordAsync(buildTimeSheetFields(s, s.staffId!, payPeriodLabel, s.locationId, tipsId));
                tsDone++; setWriteProgress({ label: 'Writing Time Sheets', done: tsDone, total: importable.length });
            }

            setParsed({ ...parsed, shifts: finalShifts });
            setWriteProgress(null);
            setStep('pivot');
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Write failed — nothing further was written.');
            setWriteProgress(null);
        } finally {
            setRunning(false);
        }
    }

    // ── step 4: pivot review ──────────────────────────────────────────────────
    const tipsByShift = useMemo(() => {
        if (!parsed) return new Map<ShiftKey, number>();
        const map = new Map<ShiftKey, number>();
        for (const locKey of ['763', '869'] as const) {
            const locId = locKey === '763' ? loc763Id : loc869Id;
            for (const day of parsed.tipsByLoc[locKey]) {
                const shiftsThatDay = parsed.shifts.filter(s => s.locationId === locId && s.clockInDate === day.date && s.staffId && !s.excluded && !s.skipDuplicate);
                const totalHours = shiftsThatDay.reduce((a, s) => a + s.actualHours, 0);
                if (totalHours <= 0) continue;
                const perHour = (day.creditTips + day.cashTips) / totalHours;
                for (const s of shiftsThatDay) map.set(shiftKey(s.staffId!, s.clockInDate, s.role, s.locationId), perHour * s.actualHours);
            }
        }
        return map;
    }, [parsed, loc763Id, loc869Id]);

    const pivotRows = useMemo(() => {
        if (!parsed) return [];
        const rows = buildPivot(parsed.shifts, tipsByShift, roles);
        return rows.map(r => {
            const gKey = `${r.staffId}::${r.role.trim().toLowerCase()}::${r.locationId}`;
            const ov = pivotOverrides.get(gKey);
            return ov ? { ...r, tips: ov.tips ?? r.tips, department: ov.department ?? r.department } : r;
        });
    }, [parsed, tipsByShift, roles, pivotOverrides]);

    function setPivotOverride(row: PivotRow, patch: { tips?: number; department?: string }) {
        const gKey = `${row.staffId}::${row.role.trim().toLowerCase()}::${row.locationId}`;
        setPivotOverrides(m => { const next = new Map(m); next.set(gKey, { ...next.get(gKey), ...patch }); return next; });
    }

    const payPeriodLabel = parsed ? formatPayPeriod(parsed.payPeriodStart, parsed.payPeriodEnd) : '';
    const reconciliation = useMemo(() => {
        if (!parsed) return null;
        const tsRows = existingTimeSheets.filter(r => str(r, TS.payPeriod) === payPeriodLabel);
        const tipsRows = existingTips.filter(r => { const d = str(r, TIPS.date); return d >= parsed.payPeriodStart && d <= parsed.payPeriodEnd; });
        return {
            shiftCount: tsRows.length,
            totalHours: tsRows.reduce((s, r) => s + num(r, TS.totalHours), 0),
            totalTips763: tipsRows.reduce((s, r) => s + num(r, TIPS.totalTips763), 0),
            totalTips869: tipsRows.reduce((s, r) => s + num(r, TIPS.totalTips869), 0),
        };
    }, [parsed, existingTimeSheets, existingTips, payPeriodLabel]);

    const pivotTotalHours = pivotRows.reduce((s, r) => s + r.hours, 0);
    const pivotTotalTips = pivotRows.reduce((s, r) => s + r.tips, 0);
    const reconTipsTotal = reconciliation ? reconciliation.totalTips763 + reconciliation.totalTips869 : 0;
    const hoursMismatch = reconciliation ? Math.abs(reconciliation.totalHours - pivotTotalHours) > 0.5 : false;
    const tipsMismatch = reconciliation ? Math.abs(reconTipsTotal - pivotTotalTips) > 0.5 : false;

    function downloadPivotCsv() {
        const csv = buildPivotCsv(pivotRows, staffNames, locationNames);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `payroll-pivot-${payPeriodLabel.replace(/\./g, '-')}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    }

    async function approveAndUpload() {
        if (!parsed) return;
        requestNotifyPermission();
        setRunning(true); setErr('');
        try {
            let done = 0;
            setWriteProgress({ label: 'Writing Payroll', done: 0, total: pivotRows.length });
            for (const row of pivotRows) {
                await payrollTable.createRecordAsync(buildPayrollFields(row, payPeriodLabel, parsed.payPeriodStart));
                done++; setWriteProgress({ label: 'Writing Payroll', done, total: pivotRows.length });
            }
            const importedShifts = parsed.shifts.filter(s => s.staffId && !s.excluded && !s.skipDuplicate);
            const flags: Flag[] = [];
            if (newStaffNames.size) flags.push({ tone: 'info', text: `${newStaffNames.size} new hire${newStaffNames.size === 1 ? '' : 's'} created on Staff Payroll (${[...newStaffNames].join(', ')}) — set their pay rates and details there.` });
            const skippedDupCount = parsed.shifts.filter(s => s.skipDuplicate).length;
            if (skippedDupCount) flags.push({ tone: 'info', text: `${skippedDupCount} shift${skippedDupCount === 1 ? '' : 's'} skipped as already-imported duplicates.` });
            if (parsed.outOfRangeNotes.length) for (const n of parsed.outOfRangeNotes) flags.push({ tone: 'warn', text: n });
            const noDept = pivotRows.filter(r => !r.department).length;
            if (noDept) flags.push({ tone: 'warn', text: `${noDept} pivot row${noDept === 1 ? '' : 's'} have no resolved department — set it on Payroll or above before relying on department rollups.` });

            setWriteProgress(null);
            setResult({ timeSheetsCreated: importedShifts.length, payrollCreated: pivotRows.length, newStaffCreated: newStaffNames.size, flags });
            setStep('done');
            notify('Payroll upload complete', `${pivotRows.length} payroll rows created for ${payPeriodLabel}.`);
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Payroll write failed.');
            setWriteProgress(null);
        } finally {
            setRunning(false);
        }
    }

    function reset() {
        setStep('upload'); setFiles({}); setParsed(null); setErr(''); setResult(null);
        setRosterMap(new Map()); setNewStaffNames(new Set());
        setZeroHourRes(new Map()); setDuplicateSkip(new Map()); setPivotOverrides(new Map());
    }

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {err && (
                <div style={{ ...glass({ soft: true }), padding: '12px 14px', border: `1px solid ${PALETTE.rust}`, display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
                    <WarningCircleIcon size={18} weight="fill" color={PALETTE.rust} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>{err}</span>
                </div>
            )}

            {step === 'upload' && (
                <FileIntakeStep files={files} onSetSlot={setSlot} onParse={parseFiles} />
            )}

            {step === 'roster' && parsed && (
                <RosterReviewStep
                    names={distinctUnmatchedNames} staff={staff} staffNames={staffNames}
                    resolutions={rosterMap} onResolve={resolveRosterName} onCreate={createStaffForRoster}
                    canContinue={rosterResolved}
                    onBack={() => setStep('upload')} onContinue={confirmRoster}
                />
            )}

            {step === 'anomalies' && parsed && (
                <AnomalyReviewStep
                    zeroHourShifts={zeroHourShifts} zeroHourRes={zeroHourRes} setZeroHourRes={setZeroHourRes}
                    duplicateShifts={duplicateShifts} duplicateSkip={duplicateSkip} setDuplicateSkip={setDuplicateSkip}
                    canContinue={zeroHourResolved} running={running} writeProgress={writeProgress}
                    onBack={() => setStep('roster')} onContinue={confirmAnomaliesAndWrite}
                />
            )}

            {step === 'pivot' && parsed && (
                <PivotReviewStep
                    payPeriodLabel={payPeriodLabel} pivotRows={pivotRows} staffNames={staffNames} locationNames={locationNames}
                    departmentChoices={departmentChoices} onOverride={setPivotOverride}
                    reconciliation={reconciliation} pivotTotalHours={pivotTotalHours} pivotTotalTips={pivotTotalTips}
                    hoursMismatch={hoursMismatch} tipsMismatch={tipsMismatch}
                    onDownloadCsv={downloadPivotCsv} running={running} writeProgress={writeProgress}
                    onApprove={approveAndUpload}
                />
            )}

            {step === 'done' && result && (
                <div style={{ ...glass(), padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: result.flags.length ? '14px' : '4px' }}>
                        <CheckCircleIcon size={22} weight="fill" color={PALETTE.gold} />
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {result.timeSheetsCreated} shift{result.timeSheetsCreated === 1 ? '' : 's'} and {result.payrollCreated} payroll row{result.payrollCreated === 1 ? '' : 's'} created for {payPeriodLabel}
                        </span>
                    </div>
                    {result.flags.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '7px 0', borderTop: i === 0 ? '1px solid var(--hairline)' : 'none' }}>
                            {f.tone === 'warn' ? <WarningCircleIcon size={17} weight="fill" color={PALETTE.rust} style={{ flexShrink: 0, marginTop: '1px' }} /> : <InfoIcon size={17} weight="fill" color={PALETTE.mist} style={{ flexShrink: 0, marginTop: '1px' }} />}
                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.45 }}>{f.text}</span>
                        </div>
                    ))}
                    <div style={{ marginTop: '16px' }}>
                        <Button variant="ghost" onClick={reset}>Run another pay period</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── step (a): file intake ───────────────────────────────────────────────────
const SLOTS: { key: SlotKey; label: string; accept: string }[] = [
    { key: 'ts763', label: '763 Homebase timesheet', accept: '.csv,text/csv' },
    { key: 'ts869', label: '869 Homebase timesheet', accept: '.csv,text/csv' },
    { key: 'tips763', label: '763 Square tips', accept: '.csv,text/csv' },
    { key: 'tips869', label: '869 Square tips', accept: '.csv,text/csv' },
];

function FileIntakeStep({ files, onSetSlot, onParse }: {
    files: Partial<Record<SlotKey, File>>; onSetSlot: (slot: SlotKey, file: File | null) => void; onParse: () => void;
}) {
    const allSet = SLOTS.every(s => files[s.key]);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
                Two Homebase timesheet exports and two Square tips exports — one of each per location. The pay period is read from the timesheet files, not the filenames.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                {SLOTS.map(s => (
                    <label key={s.key} style={{ ...glass({ soft: true }), padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '6px', cursor: 'pointer' }}>
                        <span style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{s.label}</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: files[s.key] ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {files[s.key]?.name ?? 'Choose file…'}
                        </span>
                        <input type="file" accept={s.accept} hidden onChange={e => onSetSlot(s.key, e.target.files?.[0] ?? null)} />
                    </label>
                ))}
            </div>
            <div>
                <Button onClick={onParse} disabled={!allSet} style={{ padding: '13px 22px', fontSize: '14px' }}>
                    <SparkleIcon size={17} weight="fill" /> Parse files
                </Button>
            </div>
        </div>
    );
}

// ── step (b): roster review ─────────────────────────────────────────────────
function RosterReviewStep({ names, staff, staffNames, resolutions, onResolve, onCreate, canContinue, onBack, onContinue }: {
    names: string[]; staff: RecordModel[]; staffNames: Map<string, string>;
    resolutions: Map<string, string>; onResolve: (name: string, staffId: string) => void;
    onCreate: (name: string) => Promise<string | null>;
    canContinue: boolean; onBack: () => void; onContinue: () => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
                <div style={{ fontFamily: DISPLAY, fontSize: '22px', color: 'var(--text-primary)' }}>Match staff names</div>
                <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '4px 0 0' }}>
                    {names.length === 0 ? 'Every name matched the roster automatically.'
                        : `${names.length} name${names.length === 1 ? "" : 's'} from the timesheets didn't match anyone on Staff Payroll. Link each to the right person, or add them as a new hire.`}
                </p>
            </div>
            {names.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {names.map(name => {
                        const resolvedId = resolutions.get(name);
                        return (
                            <div key={name} style={{ ...glass({ soft: true }), padding: '12px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                                <div style={{ flex: '0 0 auto', minWidth: '150px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{name}</div>
                                <div style={{ flex: '1 1 220px', minWidth: '220px' }}>
                                    <LinkPicker options={staff} names={staffNames} value={resolvedId ? [resolvedId] : []}
                                        onChange={v => { if (v[0]) onResolve(name, v[0]); }}
                                        placeholder="Search staff…" onCreate={onCreate} />
                                </div>
                                {resolvedId && <CheckCircleIcon size={18} weight="fill" color={PALETTE.gold} style={{ flexShrink: 0 }} />}
                            </div>
                        );
                    })}
                </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
                <Button variant="ghost" onClick={onBack}><ArrowLeftIcon size={15} weight="bold" /> Back</Button>
                <Button onClick={onContinue} disabled={!canContinue} style={{ flex: 1 }}>Continue <ArrowRightIcon size={15} weight="bold" /></Button>
            </div>
        </div>
    );
}

// ── step (c): anomaly review ─────────────────────────────────────────────────
function AnomalyReviewStep({
    zeroHourShifts, zeroHourRes, setZeroHourRes, duplicateShifts, duplicateSkip, setDuplicateSkip,
    canContinue, running, writeProgress, onBack, onContinue,
}: {
    zeroHourShifts: { s: ResolvedShift; i: number }[];
    zeroHourRes: Map<number, { excluded: boolean; overrideHours: number | null }>;
    setZeroHourRes: React.Dispatch<React.SetStateAction<Map<number, { excluded: boolean; overrideHours: number | null }>>>;
    duplicateShifts: { s: ResolvedShift; i: number }[];
    duplicateSkip: Map<ShiftKey, boolean>;
    setDuplicateSkip: React.Dispatch<React.SetStateAction<Map<ShiftKey, boolean>>>;
    canContinue: boolean; running: boolean; writeProgress: { label: string; done: number; total: number } | null;
    onBack: () => void; onContinue: () => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: '22px', color: 'var(--text-primary)' }}>Review anomalies</div>

            <div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Zero hours despite being scheduled</div>
                {zeroHourShifts.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>None found.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {zeroHourShifts.map(({ s, i }) => {
                            const res = zeroHourRes.get(i);
                            const setRes = (patch: { excluded: boolean; overrideHours: number | null }) => setZeroHourRes(m => new Map(m).set(i, patch));
                            return (
                                <div key={i} style={{ ...glass({ soft: true }), padding: '11px 13px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', flex: '1 1 160px' }}>{s.employeeName} · {s.role} · {s.clockInDate} (scheduled {s.scheduledHours}h)</span>
                                    <Button variant={res && !res.excluded && res.overrideHours == null ? 'primary' : 'ghost'} onClick={() => setRes({ excluded: false, overrideHours: null })} style={{ padding: '7px 12px', fontSize: '12px' }}>Keep as 0</Button>
                                    <input inputMode="decimal" placeholder="Override hrs" defaultValue={res?.overrideHours != null ? String(res.overrideHours) : ''}
                                        onChange={e => { const n = Number(e.target.value); setRes({ excluded: false, overrideHours: Number.isFinite(n) && e.target.value.trim() !== '' ? n : null }); }}
                                        style={{ ...inputStyle, width: '110px', padding: '7px 10px', fontSize: '13px' }} />
                                    <Button variant={res?.excluded ? 'rust' : 'ghost'} onClick={() => setRes({ excluded: true, overrideHours: null })} style={{ padding: '7px 12px', fontSize: '12px' }}>Exclude</Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Possible duplicates (already in Time Sheets)</div>
                {duplicateShifts.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>None found.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {duplicateShifts.map(({ s, i }) => {
                            const k = shiftKey(s.staffId!, s.clockInDate, s.role, s.locationId);
                            const skip = duplicateSkip.has(k) ? duplicateSkip.get(k)! : true;
                            return (
                                <div key={i} style={{ ...glass({ soft: true }), padding: '11px 13px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', flex: '1 1 160px' }}>{s.employeeName} · {s.role} · {s.clockInDate}</span>
                                    <Button variant={skip ? 'primary' : 'ghost'} onClick={() => setDuplicateSkip(m => new Map(m).set(k, true))} style={{ padding: '7px 12px', fontSize: '12px' }}>Skip (already imported)</Button>
                                    <Button variant={!skip ? 'rust' : 'ghost'} onClick={() => setDuplicateSkip(m => new Map(m).set(k, false))} style={{ padding: '7px 12px', fontSize: '12px' }}>Import anyway</Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {running && writeProgress && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                        <span>{writeProgress.label}…</span><span>{writeProgress.done} / {writeProgress.total}</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(50,70,79,0.12)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${writeProgress.total ? Math.max(6, Math.round((writeProgress.done / writeProgress.total) * 100)) : 6}%`, borderRadius: '3px', background: 'var(--accent)', transition: 'width .3s ease' }} />
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
                <Button variant="ghost" onClick={onBack} disabled={running}><ArrowLeftIcon size={15} weight="bold" /> Back</Button>
                <Button onClick={onContinue} disabled={!canContinue || running} style={{ flex: 1 }}>
                    {running ? 'Writing…' : <>Write Tips &amp; Time Sheets <ArrowRightIcon size={15} weight="bold" /></>}
                </Button>
            </div>
        </div>
    );
}

// ── step (d): pivot review ───────────────────────────────────────────────────
function PivotReviewStep({
    payPeriodLabel, pivotRows, staffNames, locationNames, departmentChoices, onOverride,
    reconciliation, pivotTotalHours, pivotTotalTips, hoursMismatch, tipsMismatch,
    onDownloadCsv, running, writeProgress, onApprove,
}: {
    payPeriodLabel: string; pivotRows: PivotRow[]; staffNames: Map<string, string>; locationNames: Map<string, string>;
    departmentChoices: string[]; onOverride: (row: PivotRow, patch: { tips?: number; department?: string }) => void;
    reconciliation: { shiftCount: number; totalHours: number; totalTips763: number; totalTips869: number } | null;
    pivotTotalHours: number; pivotTotalTips: number; hoursMismatch: boolean; tipsMismatch: boolean;
    onDownloadCsv: () => void; running: boolean; writeProgress: { label: string; done: number; total: number } | null;
    onApprove: () => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: '22px', color: 'var(--text-primary)' }}>Review &amp; approve — {payPeriodLabel}</div>

            {/* Reconciliation summary — what Airtable itself computed from the fresh writes */}
            {reconciliation && (
                <div style={{ ...glass({ soft: true }), padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>In Airtable now vs. this pivot</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                            <strong>{reconciliation.shiftCount}</strong> shifts · <strong>{reconciliation.totalHours.toFixed(2)}</strong> total hours
                            {hoursMismatch && <span style={{ color: PALETTE.rust, fontWeight: 700 }}> (pivot shows {pivotTotalHours.toFixed(2)} — check for excluded/duplicate shifts)</span>}
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                            Tips: <strong>${(reconciliation.totalTips763 + reconciliation.totalTips869).toFixed(2)}</strong>
                            {tipsMismatch && <span style={{ color: PALETTE.rust, fontWeight: 700 }}> (pivot shows ${pivotTotalTips.toFixed(2)})</span>}
                        </span>
                    </div>
                </div>
            )}

            {/* Editable pivot table */}
            <div style={{ ...glass(), padding: '4px', overflowX: 'auto' }}>
                <div style={{ minWidth: '640px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.6fr 0.6fr 0.6fr 0.6fr 1fr 1fr', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>
                        {['Employee', 'Role', 'Loc', 'Hrs', 'OT', 'Hol', 'PTO', 'Tips', 'Dept'].map(h => (
                            <span key={h} style={{ fontFamily: MONO, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</span>
                        ))}
                    </div>
                    {pivotRows.map((r, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.6fr 0.6fr 0.6fr 0.6fr 1fr 1fr', gap: '8px', padding: '8px 12px', alignItems: 'center', borderBottom: i === pivotRows.length - 1 ? 'none' : '1px solid var(--hairline)' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staffNames.get(r.staffId) ?? r.staffId}</span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{r.role}</span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{locationNames.get(r.locationId) ?? ''}</span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{r.hours.toFixed(2)}</span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{r.ot.toFixed(2)}</span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{r.holiday.toFixed(2)}</span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{r.pto.toFixed(2)}</span>
                            <MoneyInput value={r.tips.toFixed(2)} onChange={v => { const n = Number(v); if (Number.isFinite(n)) onOverride(r, { tips: n }); }} style={{ padding: '6px 8px 6px 20px', fontSize: '12.5px' }} />
                            <PlainSelect options={departmentChoices} value={r.department ?? ''} onChange={v => onOverride(r, { department: v })} />
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <Button variant="ghost" onClick={onDownloadCsv}><DownloadSimpleIcon size={16} weight="bold" /> Download CSV</Button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>For your payroll provider — available any time, independent of approving below.</span>
            </div>

            {running && writeProgress && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                        <span>{writeProgress.label}…</span><span>{writeProgress.done} / {writeProgress.total}</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(50,70,79,0.12)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${writeProgress.total ? Math.max(6, Math.round((writeProgress.done / writeProgress.total) * 100)) : 6}%`, borderRadius: '3px', background: 'var(--accent)', transition: 'width .3s ease' }} />
                    </div>
                </div>
            )}

            <div>
                <Button onClick={onApprove} disabled={running || pivotRows.length === 0} style={{ padding: '13px 22px', fontSize: '14px' }}>
                    {running ? 'Writing…' : <><UsersThreeIcon size={17} weight="bold" /> Approve &amp; upload to Payroll</>}
                </Button>
            </div>
        </div>
    );
}
