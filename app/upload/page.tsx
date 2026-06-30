'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    UploadSimpleIcon, FilePdfIcon, FileCsvIcon, ImageIcon, FileIcon, XIcon,
    WarningCircleIcon, SparkleIcon, ArrowRightIcon, CheckCircleIcon, InfoIcon,
    ReceiptIcon, ChartLineUpIcon, UsersThreeIcon,
} from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Button, Pill, DISPLAY, MONO, BODY, PALETTE } from '@/lib/components/ui';
import { TABLES, EX, SALE } from '@/lib/silk/schema';
import { parseCsv, toRecords, field, money, sundayFromFilename } from '@/lib/silk/csv';

type ReportType = 'expense' | 'sales' | 'payroll';

type LineItem = {
    item?: string; orderDescription?: string; lineItem?: string; category?: string[]; date?: string;
    unitQty?: number; perUnit?: number; unitOfMeasure?: string; unitPrice?: number; taxAmount?: number; totalAmount?: number;
    vendor?: string; invoice?: string; location?: string; bank?: string; card?: string; cardRaw?: string;
};
type FileState = { file: File; status: 'queued' | 'parsing' | 'creating' | 'done' | 'error'; created: number; found: number; error?: string; note?: string };
type Flag = { tone: 'warn' | 'info'; text: string };
type RunResult = { created: number; flags: Flag[]; href: string; label: string } | null;

export default function UploadPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    return (
        <Shell>
            {mounted ? <AirtableBoundary><Uploader /></AirtableBoundary> : <div style={{ flex: 1 }} />}
        </Shell>
    );
}

function fileIcon(f: File) {
    const n = f.name.toLowerCase();
    if (n.endsWith('.pdf') || f.type === 'application/pdf') return <FilePdfIcon size={20} weight="duotone" color={PALETTE.rust} />;
    if (n.endsWith('.csv') || f.type.includes('csv')) return <FileCsvIcon size={20} weight="duotone" color={PALETTE.olive} />;
    if (f.type.startsWith('image/')) return <ImageIcon size={20} weight="duotone" color={PALETTE.gold} />;
    return <FileIcon size={20} weight="duotone" color={PALETTE.mist} />;
}
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
function fileToText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

const TYPES: { id: ReportType; label: string; Icon: typeof ReceiptIcon; disabled?: boolean }[] = [
    { id: 'expense', label: 'Expense', Icon: ReceiptIcon },
    { id: 'sales', label: 'Sales', Icon: ChartLineUpIcon },
    { id: 'payroll', label: 'Payroll', Icon: UsersThreeIcon, disabled: true },
];

function Uploader() {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const expensesTable = base.tables.find(t => t.id === TABLES.expenses)!;
    const vendorsTable = base.tables.find(t => t.id === TABLES.vendors)!;
    const locationsTable = base.tables.find(t => t.id === TABLES.locations)!;
    const salesTable = base.tables.find(t => t.id === TABLES.sales)!;
    const vendors = useRecords(vendorsTable);
    const locations = useRecords(locationsTable);

    const locIdByName = useMemo(() => { const m = new Map<string, string>(); for (const l of locations) m.set((l.name || '').trim(), l.id); return m; }, [locations]);

    const [type, setType] = useState<ReportType>('expense');
    const [locId, setLocId] = useState('');
    const [files, setFiles] = useState<FileState[]>([]);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult>(null);
    const [drag, setDrag] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    function reset() { setFiles([]); setResult(null); }
    function changeType(t: ReportType) { if (t !== type) { setType(t); reset(); } }

    function addFiles(list: FileList | null) {
        if (!list) return;
        setFiles(prev => [...prev, ...Array.from(list).map<FileState>(file => ({ file, status: 'queued', created: 0, found: 0 }))]);
        setResult(null);
    }
    function removeFile(i: number) { setFiles(prev => prev.filter((_, idx) => idx !== i)); }
    const setStatus = (i: number, patch: Partial<FileState>) => setFiles(prev => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

    // ── Expense run ──────────────────────────────────────────────────────────
    function buildVendorMap() { const m = new Map<string, string>(); for (const v of vendors) { const n = (v.name || '').trim().toLowerCase(); if (n) m.set(n, v.id); } return m; }
    async function ensureVendor(name: string | undefined, map: Map<string, string>, created: Set<string>): Promise<string | null> {
        const n = (name || '').trim(); if (!n) return null;
        const key = n.toLowerCase(); const hit = map.get(key); if (hit) return hit;
        const id = await vendorsTable.createRecordAsync({ [vendorsTable.primaryFieldId]: n });
        map.set(key, id); created.add(n); return id;
    }
    function expenseFields(li: LineItem, vendorId: string | null, file: File): Record<string, unknown> {
        // Location for expenses is detected from the document (Airtable resolves it),
        // not picked by the user. Set it only if Claude could derive it from the file.
        const lineLoc = li.location ? locIdByName.get(li.location) : undefined;
        const f: Record<string, unknown> = {
            [EX.status]: 'Submitted',
            [EX.receipt]: [{ file }],
        };
        if (lineLoc) f[EX.locations] = [lineLoc];
        if (li.item) f[EX.item] = li.item;
        if (li.orderDescription) f[EX.orderDesc] = li.orderDescription;
        if (li.lineItem) f[EX.lineItem] = li.lineItem;
        if (li.category?.length) f[EX.category] = li.category;
        if (li.date) f[EX.date] = li.date;
        if (li.unitQty != null) f[EX.unitQty] = li.unitQty;
        if (li.perUnit != null) f[EX.perUnit] = li.perUnit;
        if (li.unitOfMeasure) f[EX.unitOfMeasure] = li.unitOfMeasure;
        if (li.unitPrice != null) f[EX.unitPrice] = li.unitPrice;
        if (li.taxAmount != null) f[EX.tax] = li.taxAmount;
        if (li.totalAmount != null) f[EX.total] = li.totalAmount;
        if (li.invoice) f[EX.invoice] = li.invoice;
        if (li.bank) f[EX.bank] = li.bank;
        if (li.card) f[EX.card] = li.card;
        if (vendorId) f[EX.vendors] = [vendorId];
        return f;
    }

    async function runExpense() {
        const vendorMap = buildVendorMap();
        const newVendors = new Set<string>();
        const emptyNotes: string[] = [];
        let created = 0, uncategorized = 0, unknownCard = 0, emptyFiles = 0;
        for (let i = 0; i < files.length; i++) {
            if (files[i].status === 'done') continue;
            try {
                setStatus(i, { status: 'parsing', error: undefined });
                const data = await fileToBase64(files[i].file);
                const res = await fetch('/api/parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: files[i].file.name, contentType: files[i].file.type, data }) });
                const body = await res.json();
                if (!res.ok) throw new Error(body?.error ?? 'Parse failed.');
                const items: LineItem[] = body.lineItems ?? [];
                if (items.length === 0) { emptyFiles++; if (body.note) emptyNotes.push(body.note); setStatus(i, { note: body.note }); }
                setStatus(i, { status: 'creating', found: items.length });
                let made = 0;
                for (const li of items) {
                    const vendorId = await ensureVendor(li.vendor, vendorMap, newVendors);
                    await expensesTable.createRecordAsync(expenseFields(li, vendorId, files[i].file));
                    made++; created++;
                    if (!li.category?.length) uncategorized++;
                    if (li.cardRaw && !li.card) unknownCard++;
                    setStatus(i, { created: made });
                }
                setStatus(i, { status: 'done', created: made, found: items.length, note: items.length === 0 ? body.note : undefined });
            } catch (e) { setStatus(i, { status: 'error', error: e instanceof Error ? e.message : 'Failed.' }); }
        }
        const flags: Flag[] = [];
        if (newVendors.size) flags.push({ tone: 'warn', text: `${newVendors.size} new vendor${newVendors.size === 1 ? '' : 's'} auto-created (${[...newVendors].slice(0, 4).join(', ')}${newVendors.size > 4 ? '…' : ''}) — confirm on Expenses.` });
        if (unknownCard) flags.push({ tone: 'warn', text: `${unknownCard} statement row${unknownCard === 1 ? '' : 's'} on a card that isn't a known option — left blank; set the card manually.` });
        if (uncategorized) flags.push({ tone: 'info', text: `${uncategorized} row${uncategorized === 1 ? '' : 's'} have no category yet — assign on Expenses.` });
        if (emptyFiles) flags.push({ tone: 'warn', text: `${emptyFiles} file${emptyFiles === 1 ? '' : 's'} produced no line items${emptyNotes.length ? ` — ${emptyNotes[0]}` : ' — check the file.'}` });
        setResult({ created, flags, href: '/expenses', label: `Review in Expenses` });
    }

    // ── Sales run (deterministic CSV) ────────────────────────────────────────
    async function runSales() {
        let created = 0, noWeek = 0; const weeksUsed = new Set<string>();
        for (let i = 0; i < files.length; i++) {
            if (files[i].status === 'done') continue;
            try {
                setStatus(i, { status: 'parsing', error: undefined });
                const sunday = sundayFromFilename(files[i].file.name);
                if (!sunday) { noWeek++; setStatus(i, { status: 'error', error: 'Could not read the week from the filename (expects item-sales-summary-YYYY-MM-DD-…).' }); continue; }
                const text = await fileToText(files[i].file);
                const { records } = toRecords(parseCsv(text));
                const rows = records.filter(r => field(r, ['Item Name', 'Item']) || money(field(r, ['Net Sales'])) != null);
                setStatus(i, { status: 'creating', found: rows.length, note: `week of ${sunday}` });
                weeksUsed.add(sunday);
                let made = 0;
                for (const r of rows) {
                    const item = field(r, ['Item Name', 'Item']);
                    const variation = field(r, ['Item Variation', 'Variation']);
                    const sold = Number(field(r, ['Items Sold', 'Units Sold']).replace(/[, ]/g, ''));
                    const net = money(field(r, ['Net Sales']));
                    const f: Record<string, unknown> = { [SALE.date]: sunday, [SALE.locations]: [locId] };
                    if (item) f[SALE.item] = item;
                    if (variation) f[SALE.itemVariation] = variation;
                    if (Number.isFinite(sold)) f[SALE.itemsSold] = sold;
                    if (net != null) f[SALE.netSales] = net;
                    await salesTable.createRecordAsync(f);
                    made++; created++; setStatus(i, { created: made });
                }
                setStatus(i, { status: 'done', created: made, found: rows.length, note: `week of ${sunday}` });
            } catch (e) { setStatus(i, { status: 'error', error: e instanceof Error ? e.message : 'Failed.' }); }
        }
        const flags: Flag[] = [];
        if (created) flags.push({ tone: 'info', text: `All ${created} sales need a product link to categorize by department — set them on Sales.` });
        if (noWeek) flags.push({ tone: 'warn', text: `${noWeek} file${noWeek === 1 ? '' : 's'} skipped — filename didn't contain a date.` });
        if (weeksUsed.size) flags.push({ tone: 'info', text: `Week${weeksUsed.size === 1 ? '' : 's'} used: ${[...weeksUsed].join(', ')}.` });
        setResult({ created, flags, href: '/sales', label: 'Review in Sales' });
    }

    async function run() {
        if (!canRun) return;
        setRunning(true); setResult(null);
        if (type === 'expense') await runExpense();
        else if (type === 'sales') await runSales();
        setRunning(false);
    }

    const accept = type === 'sales' ? '.csv,text/csv' : '.pdf,.csv,image/*,application/pdf,text/csv';
    const canRun = files.length > 0 && !running && type !== 'payroll' && (type !== 'sales' || !!locId);
    const copy = type === 'expense'
        ? 'Invoices, receipts and bank/card statements — PDF, CSV or photo. Claude reads each and files line items as draft expenses. The location is detected from each document.'
        : 'Square item-sales-summary CSVs. The week is read from the filename; one Sales row is created per line for the chosen location.';

    return (
        <div style={{ width: '100%', maxWidth: '820px', margin: '0 auto', padding: `${isNarrow ? '20px' : '34px'} ${isNarrow ? '16px' : '26px'} 70px` }}>
            <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Upload</div>
            <h1 style={{ fontFamily: DISPLAY, fontSize: isNarrow ? '34px' : '46px', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '6px 0 14px', color: 'var(--text-primary)' }}>Drop the paperwork</h1>

            {/* Report-type selector */}
            <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', borderRadius: '999px', ...glass({ soft: true }), marginBottom: '14px', flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                    <button key={t.id} onClick={() => !t.disabled && changeType(t.id)} disabled={t.disabled} title={t.disabled ? 'Coming soon' : t.label}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '999px', border: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer', fontFamily: BODY, fontSize: '13px', fontWeight: 700, opacity: t.disabled ? 0.45 : 1, background: type === t.id ? 'var(--accent)' : 'transparent', color: type === t.id ? 'var(--accent-text)' : 'var(--text-primary)' }}>
                        <t.Icon size={16} weight="bold" /> {t.label}{t.disabled ? ' · soon' : ''}
                    </button>
                ))}
            </div>

            {type === 'payroll' ? (
                <div style={{ ...glass(), padding: '22px' }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: '22px', color: 'var(--text-primary)', textTransform: 'uppercase' }}>Payroll — coming soon</div>
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 0 }}>
                        Payroll is a multi-step flow (4 CSVs → Tips + Time Sheets, a review gate for new hires / 40-hr OT / duplicates, a 763/869 pivot to approve, then the Payroll table). It&apos;s being built as its own page — for now, run payroll through the report skill.
                    </p>
                </div>
            ) : (
                <>
                    <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.55 }}>{copy}</p>

                    {/* Location — Sales only (expense location is detected from the document) */}
                    {type === 'sales' && (
                        <div style={{ ...glass(), padding: '16px', marginBottom: '16px' }}>
                            <div style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>Location (required — applied to every row)</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {locations.map(l => (
                                    <button key={l.id} onClick={() => setLocId(l.id)} disabled={running} style={{ padding: '9px 17px', borderRadius: '999px', cursor: running ? 'default' : 'pointer', fontFamily: BODY, fontSize: '14px', fontWeight: 700, background: locId === l.id ? 'var(--accent)' : 'var(--glass-bg)', color: locId === l.id ? 'var(--accent-text)' : 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>{l.name || '(location)'}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Dropzone */}
                    <div onClick={() => inputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                        style={{ ...glass({ radius: 'var(--radius-lg)' }), border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--glass-border)'}`, background: drag ? 'var(--accent-soft)' : 'var(--glass-bg)', padding: isNarrow ? '30px 18px' : '44px 24px', textAlign: 'center', cursor: 'pointer', transition: 'background .12s, border-color .12s' }}>
                        <input ref={inputRef} type="file" multiple accept={accept} hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                        <div style={{ display: 'inline-flex', width: '58px', height: '58px', borderRadius: '17px', background: 'var(--accent-soft)', color: 'var(--accent)', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadSimpleIcon size={28} weight="bold" /></div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Drop files here, or click to browse</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '5px' }}>{type === 'sales' ? 'Square item-sales-summary CSV · multiple at once' : 'PDF · CSV · PNG/JPG · multiple at once'}</div>
                    </div>

                    {/* File list */}
                    {files.length > 0 && (
                        <div style={{ ...glass(), padding: '8px', marginTop: '16px', display: 'flex', flexDirection: 'column' }}>
                            {files.map((fs, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 12px', borderBottom: i < files.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                                    <span style={{ flexShrink: 0 }}>{fileIcon(fs.file)}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fs.file.name}</div>
                                        <div style={{ fontSize: '12px', color: fs.status === 'error' ? PALETTE.rust : 'var(--text-muted)' }}>{statusText(fs, type)}</div>
                                    </div>
                                    <StatusBadge fs={fs} />
                                    {!running && fs.status !== 'done' && (
                                        <button onClick={() => removeFile(i)} aria-label="Remove" style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: 'rgba(50,70,79,0.08)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><XIcon size={14} weight="bold" /></button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Action */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '18px', flexWrap: 'wrap' }}>
                        <Button onClick={run} disabled={!canRun} style={{ padding: '13px 22px', fontSize: '14px' }}>
                            {running ? 'Working…' : <><SparkleIcon size={17} weight="fill" /> Process {files.length || ''} file{files.length === 1 ? '' : 's'}</>}
                        </Button>
                        {type === 'sales' && !locId && files.length > 0 && <span style={{ fontSize: '13px', color: PALETTE.rust, fontWeight: 600 }}>Pick a location first.</span>}
                    </div>

                    {/* Flag summary (the checkpoint) */}
                    {result && (
                        <div style={{ ...glass(), padding: '18px', marginTop: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: result.flags.length ? '12px' : 0 }}>
                                <CheckCircleIcon size={20} weight="fill" color={PALETTE.olive} />
                                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{result.created} record{result.created === 1 ? '' : 's'} created</span>
                                <Link href={result.href} style={{ marginLeft: 'auto', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 700, color: 'var(--accent-deep)' }}>{result.label} <ArrowRightIcon size={15} weight="bold" /></Link>
                            </div>
                            {result.flags.map((f, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '7px 0', borderTop: i === 0 ? '1px solid var(--hairline)' : 'none' }}>
                                    {f.tone === 'warn' ? <WarningCircleIcon size={17} weight="fill" color={PALETTE.rust} style={{ flexShrink: 0, marginTop: '1px' }} /> : <InfoIcon size={17} weight="fill" color={PALETTE.mist} style={{ flexShrink: 0, marginTop: '1px' }} />}
                                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.45 }}>{f.text}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function statusText(fs: FileState, type: ReportType): React.ReactNode {
    switch (fs.status) {
        case 'queued': return 'Queued';
        case 'parsing': return type === 'sales' ? 'Reading CSV…' : 'Reading with Claude…';
        case 'creating': return `Creating… ${fs.created}/${fs.found}${fs.note ? ` · ${fs.note}` : ''}`;
        case 'done': return `${fs.created} created${fs.found === 0 ? ' (none found)' : ''}${fs.note ? ` · ${fs.note}` : ''}`;
        case 'error': return fs.error ?? 'Failed';
    }
}

function StatusBadge({ fs }: { fs: FileState }) {
    if (fs.status === 'done') return <Pill text="Done" tone="olive" style={{ flexShrink: 0 }} />;
    if (fs.status === 'error') return <span style={{ color: PALETTE.rust, flexShrink: 0, display: 'flex' }}><WarningCircleIcon size={20} weight="fill" /></span>;
    if (fs.status === 'parsing' || fs.status === 'creating') return <span className="dd-shimmer" style={{ width: '54px', height: '8px', borderRadius: '4px', flexShrink: 0 }} />;
    return null;
}
