'use client';

// /expenses — the expense ledger. A filterable list of every Expenses-table row with
// a glass detail drawer that edits an existing row OR creates a new one (drawer takes an
// optional `rec`; absent = create). Reads cells via lib/silk/cells, renders form controls
// from lib/components/fields. Writes go straight to Airtable via table.updateRecordAsync /
// createRecordAsync. Filters/search run client-side over useRecords(Expenses).

import React, { useEffect, useMemo, useState } from 'react';
import {
    MagnifyingGlassIcon, XIcon, ReceiptIcon, FloppyDiskIcon, CheckCircleIcon, CircleIcon,
    PaperclipIcon, PlusIcon, TrashIcon, WarningIcon,
} from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel, TableModel } from '@/lib/airtable/models';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Pill, Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { Field, PlainSelect, MultiSelectDropdown, MultiFilter, AutoTextarea, LinkPicker, InlineLink, InlineMulti, ColumnHeader, iconBtn } from '@/lib/components/fields';
import { InventoryForm } from '@/lib/components/InventoryForm';
import { TABLES, EX, INV, SALE } from '@/lib/silk/schema';
import { usd, num, str, numStr, linkIds, selectNames, fieldChoices, nameMap, weekKey, parseNum } from '@/lib/silk/cells';

// The vendors whose invoices are expected every week. `match` is a lowercase substring
// tested against each expense's linked vendor name(s) — loose so "Royal Tea New York",
// "Adagio Teas", etc. still match. Used by the weekly upload-status summary bar.
const KEY_VENDORS: { label: string; match: string }[] = [
    { label: 'Silk City Coffee', match: 'silk' },
    { label: 'Amazon', match: 'amazon' },
    { label: 'Sysco', match: 'sysco' },
    { label: 'Webstaurant', match: 'webstaurant' },
    { label: 'Adagio Tea', match: 'adagio' },
    { label: 'RoyalNY', match: 'royal' },
    { label: 'Imperial Dade', match: 'imperial' },
    { label: 'Barista Underground', match: 'barista' },
];

// A field's filter passes when nothing is selected (= all) or the row matches at least
// one selected token; the '__none__' token matches rows where the field is blank.
function matchMulti(selected: string[], rowVals: string[]): boolean {
    if (selected.length === 0) return true;
    return selected.some(s => (s === '__none__' ? rowVals.length === 0 : rowVals.includes(s)));
}

// Category → bar/swatch colour for the weekly breakdown (Bar gold, Kitchen slate; others pooled).
// Shared grid template for the desktop list — used by both the column header and each Row.
const EX_GRID = 'minmax(120px, 1.4fr) 1fr 0.8fr 1.1fr 1.1fr 120px';
const CAT_FIXED: Record<string, string> = { Bar: 'var(--accent)', Kitchen: 'var(--c-slate)', Uncategorized: 'var(--accent-2)' };
const CAT_POOL = ['#8a979c', '#9a7d27', '#5c6539', '#6b8a8f', '#b58a3a', '#7a6a9c', '#3f7d6b', '#a4684b'];
const fmtPct = (r: number) => `${Math.round(r * 100)}%`; // whole percent, matching the scorecard
// COG heat, matching the scorecard: amber when high, gold mid, ink when healthy.
const cogColor = (v: number) => (v >= 0.45 ? PALETTE.rust : v >= 0.30 ? 'var(--accent-deep)' : 'var(--text-primary)');

// Scorecard COG sections: expense Category set ÷ Sales Department set, per location.
// 763 splits Bar/Kitchen; 869 is one combined Cafe. (Mirrors app/scorecard/page.tsx.)
const COG_SECTIONS: { key: string; label: string; locName: string; expCats: Set<string>; salDepts: Set<string> }[] = [
    { key: 'Bar', label: 'Bar · 763', locName: '763', expCats: new Set(['Bar']), salDepts: new Set(['Bar', 'Retail Coffee']) },
    { key: 'Kitchen', label: 'Kitchen · 763', locName: '763', expCats: new Set(['Kitchen']), salDepts: new Set(['Kitchen']) },
    { key: 'Cafe', label: 'Cafe · 869', locName: '869', expCats: new Set(['Bar', 'Kitchen']), salDepts: new Set(['Bar', 'Retail Coffee', 'Kitchen']) },
];

export default function ExpensesPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    return (
        <Shell>
            {mounted ? (
                <AirtableBoundary>
                    <Expenses />
                </AirtableBoundary>
            ) : (
                <div style={{ flex: 1 }} />
            )}
        </Shell>
    );
}

function Expenses() {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const expensesTable = base.tables.find(t => t.id === TABLES.expenses)!;
    const vendorsTable = base.tables.find(t => t.id === TABLES.vendors)!;
    const locationsTable = base.tables.find(t => t.id === TABLES.locations)!;
    const inventoryTable = base.tables.find(t => t.id === TABLES.inventory)!;
    const salesTable = base.tables.find(t => t.id === TABLES.sales)!;

    const expenses = useRecords(expensesTable);
    const vendors = useRecords(vendorsTable);
    const locations = useRecords(locationsTable);
    const inventory = useRecords(inventoryTable);
    const salesRecords = useRecords(salesTable); // for the weekly COG % (expenses ÷ sales)

    const vendorNames = useMemo(() => nameMap(vendors), [vendors]);
    const locationNames = useMemo(() => nameMap(locations), [locations]);
    // Display map keyed by the "Inventory Name" field (falls back to primary).
    const inventoryDisplay = useMemo(() => {
        const m = new Map<string, string>();
        for (const r of inventory) m.set(r.id, r.getCellValueAsString(INV.name) || r.name || '(item)');
        return m;
    }, [inventory]);

    // Multi-select filters: each holds selected tokens (record ids / choice names / week
    // strings, or '__none__' for blank). Empty array = no filter on that field.
    const [week, setWeek] = useState<string[]>([]);
    const [vendor, setVendor] = useState<string[]>([]);
    const [loc, setLoc] = useState<string[]>([]);
    const [dept, setDept] = useState<string[]>([]);
    const [invFilter, setInvFilter] = useState<string[]>([]);
    const [bank, setBank] = useState<string[]>([]);
    const [q, setQ] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    // Filter option lists, derived from the data actually present.
    const weeks = useMemo(() => {
        const s = new Set<string>();
        for (const r of expenses) { const w = str(r, EX.weekOf); if (w) s.add(w); }
        return Array.from(s).sort((a, b) => weekKey(b).localeCompare(weekKey(a))); // latest → earliest
    }, [expenses]);

    const vendorOptions = useMemo(() => {
        const ids = new Set<string>();
        for (const r of expenses) for (const id of linkIds(r, EX.vendors)) ids.add(id);
        return Array.from(ids)
            .map(id => ({ id, name: vendorNames.get(id) ?? '(vendor)' }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [expenses, vendorNames]);

    const deptOptions = useMemo(() => {
        const present = new Set<string>();
        for (const r of expenses) for (const c of selectNames(r, EX.category)) present.add(c);
        return fieldChoices(expensesTable, EX.category).filter(c => present.has(c));
    }, [expenses, expensesTable]);

    const bankOptions = useMemo(() => {
        const present = new Set<string>();
        for (const r of expenses) for (const b of selectNames(r, EX.bank)) present.add(b);
        return fieldChoices(expensesTable, EX.bank).filter(b => present.has(b));
    }, [expenses, expensesTable]);

    // Full category choice list for the inline row editor.
    const catChoices = useMemo(() => fieldChoices(expensesTable, EX.category), [expensesTable]);

    // Create a Vendor on the fly (a vendor is just a name) and return its id to link.
    const createVendor = async (name: string): Promise<string | null> => {
        try { return await vendorsTable.createRecordAsync({ [vendorsTable.primaryFieldId]: name.trim() }); }
        catch { return null; }
    };

    // Inventory items actually linked to some expense, labeled by Inventory Name.
    const inventoryOptions = useMemo(() => {
        const ids = new Set<string>();
        for (const r of expenses) for (const id of linkIds(r, EX.inventory)) ids.add(id);
        return Array.from(ids)
            .map(id => ({ id, name: inventoryDisplay.get(id) ?? '(item)' }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [expenses, inventoryDisplay]);

    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return expenses
            .filter(r => matchMulti(week, str(r, EX.weekOf) ? [str(r, EX.weekOf)] : []))
            .filter(r => matchMulti(vendor, linkIds(r, EX.vendors)))
            .filter(r => matchMulti(loc, linkIds(r, EX.locations)))
            .filter(r => matchMulti(dept, selectNames(r, EX.category)))
            .filter(r => matchMulti(invFilter, linkIds(r, EX.inventory)))
            .filter(r => matchMulti(bank, selectNames(r, EX.bank)))
            .filter(r => {
                if (!needle) return true;
                const hay = [
                    str(r, EX.item), str(r, EX.orderDesc), str(r, EX.invoice),
                    linkIds(r, EX.vendors).map(id => vendorNames.get(id) ?? '').join(' '),
                    selectNames(r, EX.category).join(' '),
                ].join(' ').toLowerCase();
                return hay.includes(needle);
            })
            .sort((a, b) => weekKey(str(b, EX.weekOf)).localeCompare(weekKey(str(a, EX.weekOf))) || str(b, EX.date).localeCompare(str(a, EX.date)));
    }, [expenses, week, vendor, loc, dept, invFilter, bank, q, vendorNames]);

    const total = useMemo(() => rows.reduce((s, r) => s + num(r, EX.total), 0), [rows]);

    // Weekly upload-status: which key vendors have ≥1 invoice in the selected week(s).
    // Only shown when at least one real week is selected (the report is run per week).
    const weekStatus = useMemo(() => {
        const selWeeks = week.filter(w => w !== '__none__');
        if (selWeeks.length === 0) return null;
        const weekSet = new Set(selWeeks);
        const present = new Set<string>(); // lowercased vendor names seen in those weeks
        for (const r of expenses) {
            if (!weekSet.has(str(r, EX.weekOf))) continue;
            for (const id of linkIds(r, EX.vendors)) {
                const n = (vendorNames.get(id) ?? '').toLowerCase();
                if (n) present.add(n);
            }
        }
        const names = [...present];
        const vendors = KEY_VENDORS.map(kv => ({ ...kv, done: names.some(n => n.includes(kv.match)) }));
        return { weeks: selWeeks, vendors, done: vendors.filter(v => v.done).length };
    }, [expenses, week, vendorNames]);

    // Stable category → colour map (consistent colour per category across week cards).
    const catColor = useMemo(() => {
        const m = new Map<string, string>();
        let pi = 0;
        for (const c of [...deptOptions, 'Uncategorized']) m.set(c, CAT_FIXED[c] ?? CAT_POOL[pi++ % CAT_POOL.length]);
        return (name: string) => m.get(name) ?? '#9aa3a6';
    }, [deptOptions]);

    // Per-week summary: a filter-synced expenses-by-category bar PLUS scorecard COG %.
    // The bar respects every expense filter (not the search). The COG follows the scorecard's
    // department mapping (Bar exp ÷ Bar+Retail-Coffee sales, etc.) and is NOT affected by the
    // vendor/category/inventory/bank filters — only the Location filter selects which sections
    // appear (763 → Bar+Kitchen, 869 → Cafe). One card per selected week so weeks can compare.
    const weekBreakdowns = useMemo(() => {
        const selWeeks = week.filter(w => w !== '__none__');
        if (selWeeks.length === 0) return null;

        // Resolve the active COG sections (by location name → id, respecting the Location filter).
        const realLoc = loc.filter(x => x !== '__none__');
        const sections = COG_SECTIONS
            .map(s => ({ ...s, locId: locations.find(l => (l.name || '').trim() === s.locName)?.id }))
            .filter(s => s.locId && (realLoc.length === 0 || realLoc.includes(s.locId)));

        const cards = selWeeks.map(wk => {
            // filter-synced expense composition (the bar)
            const inWeek = expenses.filter(r =>
                str(r, EX.weekOf) === wk
                && matchMulti(vendor, linkIds(r, EX.vendors))
                && matchMulti(loc, linkIds(r, EX.locations))
                && matchMulti(dept, selectNames(r, EX.category))
                && matchMulti(invFilter, linkIds(r, EX.inventory))
                && matchMulti(bank, selectNames(r, EX.bank)),
            );
            const total = inWeek.reduce((s, r) => s + num(r, EX.total), 0);
            const byCat = new Map<string, number>();
            for (const r of inWeek) {
                const cat = selectNames(r, EX.category)[0] || 'Uncategorized';
                byCat.set(cat, (byCat.get(cat) ?? 0) + num(r, EX.total));
            }
            const cats = [...byCat.entries()]
                .map(([name, amount]) => ({ name, amount, pct: total > 0 ? amount / total : 0 }))
                .sort((a, b) => b.amount - a.amount);

            // scorecard COG per section for this week
            const cogs = sections.map(sec => {
                let exp = 0, sal = 0;
                for (const r of expenses) {
                    if (str(r, EX.weekOf) !== wk || !linkIds(r, EX.locations).includes(sec.locId!)) continue;
                    if (selectNames(r, EX.category).some(c => sec.expCats.has(c))) exp += num(r, EX.total);
                }
                for (const r of salesRecords) {
                    if (str(r, SALE.weekStart) !== wk || !linkIds(r, SALE.locations).includes(sec.locId!)) continue;
                    if (selectNames(r, SALE.department).some(dn => sec.salDepts.has(dn))) sal += num(r, SALE.netSales);
                }
                return { key: sec.key, label: sec.label, exp, sal, cog: sal > 0 ? exp / sal : null };
            });
            return { week: wk, total, cats, cogs };
        }).sort((a, b) => weekKey(b.week).localeCompare(weekKey(a.week)));

        // Blended average COG per section across the selected weeks (Σ exp ÷ Σ sales, weeks with sales).
        const avg = sections.map(sec => {
            let e = 0, s = 0;
            for (const c of cards) { const x = c.cogs.find(g => g.key === sec.key); if (x && x.sal > 0) { e += x.exp; s += x.sal; } }
            return { key: sec.key, label: sec.label, cog: s > 0 ? e / s : null };
        });
        return { cards, sections, avg };
    }, [expenses, salesRecords, locations, week, vendor, loc, dept, invFilter, bank]);

    const openRec = openId ? expenses.find(r => r.id === openId) ?? null : null;
    const pad = isNarrow ? '16px' : '26px';

    return (
        <div style={{ width: '100%', maxWidth: '1140px', margin: '0 auto', padding: `${isNarrow ? '18px' : '28px'} ${pad} 70px` }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Expenses</div>
                    <h1 style={{ fontFamily: DISPLAY, fontSize: isNarrow ? '34px' : '44px', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '6px 0 0', color: 'var(--text-primary)' }}>The Ledger</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ ...glass({ soft: true }), padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{rows.length} shown</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '24px', color: 'var(--text-primary)' }}>{usd(total)}</div>
                    </div>
                    <Button onClick={() => setCreating(true)} title="New expense"><PlusIcon size={18} weight="bold" /></Button>
                </div>
            </div>

            {/* Filters (all multi-select): search + Week / Vendor / Location / Department / Inventory / Bank.
                position+zIndex lift the bar above the summary/list so the open dropdowns aren't covered
                (those siblings each create a stacking context via backdrop-filter). */}
            <div style={{ ...glass(), position: 'relative', zIndex: 40, padding: '10px', marginBottom: '14px',
                ...(isNarrow
                    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }
                    : { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }) }}>
                <div style={{ position: 'relative', ...(isNarrow ? { gridColumn: '1 / -1' } : { flex: '1 1 200px', minWidth: '160px' }) }}>
                    <MagnifyingGlassIcon size={16} weight="bold" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ ...inputStyle, paddingLeft: '34px' }} />
                </div>
                <MultiFilter block={isNarrow} value={week} onChange={setWeek} allLabel="All weeks" options={[{ value: '__none__', label: '— No week —' }, ...weeks.map(w => ({ value: w, label: w }))]} />
                <MultiFilter block={isNarrow} value={vendor} onChange={setVendor} allLabel="All vendors" searchable options={[{ value: '__none__', label: '— No vendor —' }, ...vendorOptions.map(v => ({ value: v.id, label: v.name }))]} />
                <MultiFilter block={isNarrow} value={loc} onChange={setLoc} allLabel="All locations" options={[{ value: '__none__', label: '— No location —' }, ...locations.map(l => ({ value: l.id, label: l.name || '(loc)' }))]} />
                <MultiFilter block={isNarrow} value={dept} onChange={setDept} allLabel="All departments" options={[{ value: '__none__', label: '— No category —' }, ...deptOptions.map(d => ({ value: d, label: d }))]} />
                <MultiFilter block={isNarrow} value={invFilter} onChange={setInvFilter} allLabel="All inventory" searchable options={[{ value: '__none__', label: '— No inventory item —' }, ...inventoryOptions.map(o => ({ value: o.id, label: o.name }))]} />
                <MultiFilter block={isNarrow} value={bank} onChange={setBank} allLabel="All banks" options={[{ value: '__none__', label: '— No bank —' }, ...bankOptions.map(b => ({ value: b, label: b }))]} />
            </div>

            {/* Weekly upload-status summary — appears once a week is selected */}
            {weekStatus && (
                <div style={{ ...glass(), padding: '13px 14px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            Key invoices · week{weekStatus.weeks.length > 1 ? 's' : ''} of {weekStatus.weeks.join(', ')}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 700, color: weekStatus.done === KEY_VENDORS.length ? 'var(--accent-deep)' : PALETTE.rust }}>
                            {weekStatus.done} / {KEY_VENDORS.length} uploaded
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {weekStatus.vendors.map(v => (
                            <span key={v.label} title={v.done ? 'Uploaded' : 'Not yet uploaded'}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 11px', borderRadius: '999px', fontSize: '13px', fontWeight: 700,
                                    background: v.done ? 'var(--accent-soft)' : 'var(--glass-bg)', border: `1px solid ${v.done ? 'transparent' : 'var(--glass-border)'}`,
                                    color: v.done ? 'var(--accent-deep)' : 'var(--text-muted)' }}>
                                {v.done
                                    ? <CheckCircleIcon size={16} weight="fill" color="var(--accent-deep)" />
                                    : <CircleIcon size={16} weight="bold" color={PALETTE.rust} />}
                                {v.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Weekly expenses-by-department + scorecard COG % — one card per selected week */}
            {weekBreakdowns && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
                    {/* Blended average COG % per section across the selected weeks */}
                    {weekBreakdowns.cards.length > 1 && weekBreakdowns.sections.length > 0 && (
                        <div style={{ ...glass({ soft: true }), padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Average COG % · {weekBreakdowns.cards.length} weeks
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap' }}>
                                {weekBreakdowns.avg.map(a => (
                                    <span key={a.key} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>{a.label}</span>
                                        <span style={{ fontFamily: DISPLAY, fontSize: '18px', color: a.cog == null ? 'var(--text-muted)' : cogColor(a.cog) }}>{a.cog == null ? '—' : fmtPct(a.cog)}</span>
                                    </span>
                                ))}
                            </span>
                        </div>
                    )}
                    {weekBreakdowns.cards.map(wb => (
                        <div key={wb.week} style={{ ...glass(), padding: '13px 15px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Expenses by department · week of {wb.week}</span>
                                <span style={{ fontFamily: DISPLAY, fontSize: '20px', color: 'var(--text-primary)' }}>{usd(wb.total)}</span>
                            </div>
                            {/* stacked 100% bar (expense $ by category) */}
                            <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', background: 'rgba(50,70,79,0.10)' }}>
                                {wb.cats.map(c => (
                                    <div key={c.name} title={`${c.name} · ${usd(c.amount)} · ${Math.round(c.pct * 100)}%`}
                                        style={{ width: `${Math.max(0, c.pct * 100)}%`, background: catColor(c.name), transition: 'width .3s ease' }} />
                                ))}
                            </div>
                            {/* legend */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '10px' }}>
                                {wb.cats.map(c => (
                                    <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                                        <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: catColor(c.name), flexShrink: 0 }} />
                                        <span style={{ fontWeight: 700 }}>{c.name}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{usd(c.amount)} · {Math.round(c.pct * 100)}%</span>
                                    </span>
                                ))}
                            </div>
                            {/* scorecard COG % per section (Bar/Kitchen/Cafe) */}
                            {wb.cogs.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '16px', marginTop: '11px', paddingTop: '10px', borderTop: '1px solid var(--hairline)' }}>
                                    <span style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>COG %</span>
                                    {wb.cogs.map(s => (
                                        <span key={s.key} title={`expenses ${usd(s.exp)} ÷ sales ${usd(s.sal)}`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
                                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.label}</span>
                                            <span style={{ fontFamily: DISPLAY, fontSize: '17px', color: s.cog == null ? 'var(--text-muted)' : cogColor(s.cog) }}>{s.cog == null ? '—' : fmtPct(s.cog)}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* List */}
            {rows.length === 0 ? (
                <div style={{ ...glass({ soft: true }), padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ReceiptIcon size={34} weight="duotone" />
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>No expenses match these filters.</div>
                </div>
            ) : (
                <div style={{ ...glass(), padding: '4px', display: 'flex', flexDirection: 'column' }}>
                    {!isNarrow && <ColumnHeader gridCols={EX_GRID} cols={[{ label: 'Item' }, { label: 'Vendor' }, { label: 'Location' }, { label: 'Category' }, { label: 'Inventory' }, { label: 'Amount', right: true }]} />}
                    {rows.map((r, i) => (
                        <Row key={r.id} rec={r} last={i === rows.length - 1} table={expensesTable} isNarrow={isNarrow}
                            vendors={vendors} locations={locations} inventory={inventory} catChoices={catChoices}
                            vendorNames={vendorNames} locationNames={locationNames} inventoryDisplay={inventoryDisplay}
                            onCreateVendor={createVendor} onOpen={() => setOpenId(r.id)} />
                    ))}
                </div>
            )}

            {openRec && (
                <DetailDrawer
                    key={openRec.id}
                    rec={openRec} table={expensesTable}
                    vendors={vendors} locations={locations} inventory={inventory}
                    vendorNames={vendorNames} locationNames={locationNames} inventoryDisplay={inventoryDisplay}
                    onCreateVendor={createVendor}
                    isNarrow={isNarrow} onClose={() => setOpenId(null)}
                />
            )}
            {creating && (
                <DetailDrawer
                    key="new"
                    rec={null} table={expensesTable}
                    vendors={vendors} locations={locations} inventory={inventory}
                    vendorNames={vendorNames} locationNames={locationNames} inventoryDisplay={inventoryDisplay}
                    onCreateVendor={createVendor}
                    defaultLocation={(() => { const only = loc.filter(x => x !== '__none__'); return only.length === 1 ? only : undefined; })()}
                    isNarrow={isNarrow} onClose={() => setCreating(false)}
                />
            )}
        </div>
    );
}

function Row({
    rec, last, table, isNarrow, vendors, locations, inventory, catChoices, vendorNames, locationNames, inventoryDisplay, onCreateVendor, onOpen,
}: {
    rec: RecordModel; last: boolean; table: TableModel; isNarrow: boolean;
    vendors: RecordModel[]; locations: RecordModel[]; inventory: RecordModel[]; catChoices: string[];
    vendorNames: Map<string, string>; locationNames: Map<string, string>; inventoryDisplay: Map<string, string>;
    onCreateVendor: (name: string) => Promise<string | null>;
    onOpen: () => void;
}) {
    const item = str(rec, EX.item) || str(rec, EX.itemFromInv) || '(no item)';
    const cats = selectNames(rec, EX.category);
    const date = str(rec, EX.date);
    const amount = num(rec, EX.total);

    // Inline edits write straight to Airtable. `openCount` lifts this row above its
    // siblings while a popover is open so it isn't covered by rows below.
    const [openCount, setOpenCount] = useState(0);
    const [savingField, setSavingField] = useState<string | null>(null);
    const onToggle = (o: boolean) => setOpenCount(c => Math.max(0, c + (o ? 1 : -1)));
    async function update(field: string, fields: Record<string, unknown>) {
        setSavingField(field);
        try { await table.updateRecordAsync(rec, fields); } catch { /* SWR keeps the old value */ } finally { setSavingField(null); }
    }

    // The four inline-editable fields (shared between the wide and narrow layouts).
    const fill = true; // chips fill their grid cell in both the wide and narrow (2-col) layouts
    const vendorEd = <InlineLink value={linkIds(rec, EX.vendors)} names={vendorNames} options={vendors} placeholder="Vendor" fill={fill} saving={savingField === 'vendor'} onToggle={onToggle} onChange={v => update('vendor', { [EX.vendors]: v })} onCreate={onCreateVendor} />;
    const locEd = <InlineLink value={linkIds(rec, EX.locations)} names={locationNames} options={locations} placeholder="Location" fill={fill} saving={savingField === 'location'} onToggle={onToggle} onChange={v => update('location', { [EX.locations]: v })} />;
    const catEd = <InlineMulti value={cats} options={catChoices} placeholder="Category" fill={fill} saving={savingField === 'category'} onToggle={onToggle} onChange={v => update('category', { [EX.category]: v })} />;
    const invEd = <InlineLink value={linkIds(rec, EX.inventory)} names={inventoryDisplay} options={inventory} placeholder="Inventory" fill={fill} saving={savingField === 'inventory'} onToggle={onToggle} onChange={v => update('inventory', { [EX.inventory]: v })} />;
    const itemCell = <span title={item} style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item}</span>;
    const amountCell = (
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: '18px', color: 'var(--text-primary)' }}>{usd(amount)}</span>
            {date && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{date}</span>}
        </div>
    );

    const shared = {
        onClick: onOpen,
        onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'var(--glass-bg-soft)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'transparent'; },
    };

    // Wide: one aligned grid row — Item | Vendor | Location | Category | Inventory | Amount.
    if (!isNarrow) {
        return (
            <div {...shared}
                style={{
                    display: 'grid', gridTemplateColumns: EX_GRID,
                    alignItems: 'center', gap: '10px', padding: '8px 14px',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    position: 'relative', zIndex: openCount > 0 ? 5 : 'auto',
                    borderBottom: last ? 'none' : '1px solid var(--hairline)',
                }}>
                <div style={{ minWidth: 0 }}>{itemCell}</div>
                {vendorEd}{locEd}{catEd}{invEd}
                {amountCell}
            </div>
        );
    }

    // Narrow: item + amount on the top line, then the editable fields in a uniform 2-col grid.
    return (
        <div {...shared}
            style={{
                display: 'flex', flexDirection: 'column', gap: '9px', padding: '11px 14px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                position: 'relative', zIndex: openCount > 0 ? 5 : 'auto',
                borderBottom: last ? 'none' : '1px solid var(--hairline)',
            }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>{itemCell}</div>
                <div style={{ flexShrink: 0 }}>{amountCell}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {vendorEd}{locEd}{catEd}{invEd}
            </div>
        </div>
    );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
type Draft = {
    item: string; orderDesc: string; invoice: string;
    unitQty: string; unitPrice: string; tax: string; total: string; date: string;
    category: string[]; bank: string; card: string;
    vendor: string[]; location: string[]; inventory: string[];
};

function DetailDrawer({
    rec, table, vendors, locations, inventory, vendorNames, locationNames, inventoryDisplay, onCreateVendor, isNarrow, onClose, defaultLocation,
}: {
    rec?: RecordModel | null; table: TableModel;
    vendors: RecordModel[]; locations: RecordModel[]; inventory: RecordModel[];
    vendorNames: Map<string, string>; locationNames: Map<string, string>; inventoryDisplay: Map<string, string>;
    onCreateVendor: (name: string) => Promise<string | null>;
    isNarrow: boolean; onClose: () => void; defaultLocation?: string[];
}) {
    const init: Draft = useMemo(() => (rec ? {
        item: str(rec, EX.item), orderDesc: str(rec, EX.orderDesc), invoice: str(rec, EX.invoice),
        unitQty: numStr(rec, EX.unitQty), unitPrice: numStr(rec, EX.unitPrice), tax: numStr(rec, EX.tax), total: numStr(rec, EX.total),
        date: str(rec, EX.date),
        category: selectNames(rec, EX.category),
        bank: selectNames(rec, EX.bank)[0] ?? '', card: selectNames(rec, EX.card)[0] ?? '',
        vendor: linkIds(rec, EX.vendors), location: linkIds(rec, EX.locations), inventory: linkIds(rec, EX.inventory),
    } : {
        item: '', orderDesc: '', invoice: '',
        unitQty: '', unitPrice: '', tax: '', total: '', date: '',
        category: [], bank: '', card: '',
        vendor: [], location: defaultLocation ?? [], inventory: [],
    }), [rec]);

    const [d, setD] = useState<Draft>(init);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [err, setErr] = useState('');
    const [showInvForm, setShowInvForm] = useState(false);
    const [confirmDel, setConfirmDel] = useState(false); // two-step delete guard
    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD(p => ({ ...p, [k]: v })); setSaved(false); };

    async function del() {
        if (!rec) return;
        setBusy(true); setErr('');
        try {
            await table.deleteRecordAsync(rec);
            onClose();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Delete failed.');
            setBusy(false); setConfirmDel(false);
        }
    }

    const receipt = rec ? ((rec.getCellValue(EX.receipt) as { url?: string; thumbnails?: { large?: { url: string } }; filename?: string; type?: string }[] | null) ?? []) : [];

    async function save() {
        setBusy(true); setErr('');
        const fields: Record<string, unknown> = {
            [EX.item]: d.item,
            [EX.orderDesc]: d.orderDesc,
            [EX.invoice]: d.invoice,
            [EX.unitQty]: parseNum(d.unitQty),
            [EX.unitPrice]: parseNum(d.unitPrice),
            [EX.tax]: parseNum(d.tax),
            [EX.total]: parseNum(d.total),
            [EX.date]: d.date || null,
            [EX.category]: d.category,
            [EX.bank]: d.bank || null,
            [EX.card]: d.card || null,
            [EX.vendors]: d.vendor,
            [EX.locations]: d.location,
            [EX.inventory]: d.inventory,
        };
        try {
            if (rec) { await table.updateRecordAsync(rec, fields); setSaved(true); }
            else { await table.createRecordAsync({ ...fields, [EX.status]: 'Submitted' }); onClose(); }
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Save failed.');
        }
        setBusy(false);
    }

    const catChoices = fieldChoices(table, EX.category);
    const bankChoices = fieldChoices(table, EX.bank);
    const cardChoices = fieldChoices(table, EX.card);

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, top: 'var(--nav-h)', zIndex: 1000, background: 'rgba(20,28,32,0.32)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: isNarrow ? '100%' : 'min(560px, 92vw)', height: '100%', overflowY: 'auto',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                borderLeft: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-hover)',
                padding: isNarrow ? '18px' : '24px', display: 'flex', flexDirection: 'column', gap: '16px',
            }}>
                {/* header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                        <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{rec ? 'Edit expense' : 'New expense'}</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '26px', color: 'var(--text-primary)', marginTop: '2px' }}>{d.item || d.orderDesc || (rec ? 'Expense' : 'New expense')}</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={iconBtn}><XIcon size={18} weight="bold" /></button>
                </div>

                {/* receipt preview */}
                {receipt.length > 0 && (
                    <a href={receipt[0].url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        <div style={{ ...glass({ soft: true }), padding: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {receipt[0].type?.startsWith('image/') && receipt[0].thumbnails?.large?.url
                                ? <img src={receipt[0].thumbnails.large.url} alt="" style={{ width: '46px', height: '46px', objectFit: 'cover', borderRadius: '8px' }} />
                                : <span style={{ width: '46px', height: '46px', borderRadius: '8px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}><PaperclipIcon size={20} weight="bold" /></span>}
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{receipt[0].filename ?? 'Receipt'}{receipt.length > 1 ? ` +${receipt.length - 1}` : ''}</span>
                        </div>
                    </a>
                )}

                <Field label="Item"><input value={d.item} onChange={e => set('item', e.target.value)} style={inputStyle} /></Field>
                <Field label="Order description"><AutoTextarea value={d.orderDesc} onChange={v => set('orderDesc', v)} /></Field>

                {/* vendor + location moved up */}
                <Field label="Vendor">
                    <LinkPicker options={vendors} names={vendorNames} value={d.vendor} onChange={v => set('vendor', v)} placeholder="Search or add a vendor…" onCreate={onCreateVendor} />
                </Field>
                <Field label="Location">
                    <LinkPicker options={locations} names={locationNames} value={d.location} onChange={v => set('location', v)} placeholder="Search locations…" />
                </Field>

                <Field label="Category">
                    <MultiSelectDropdown options={catChoices} value={d.category} onChange={v => set('category', v)} placeholder="Select categories…" />
                </Field>

                {/* amounts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Field label="Date"><input type="date" value={d.date} onChange={e => set('date', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Unit qty"><input inputMode="decimal" value={d.unitQty} onChange={e => set('unitQty', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Unit price"><MoneyInput value={d.unitPrice} onChange={v => set('unitPrice', v)} /></Field>
                    <Field label="Tax"><MoneyInput value={d.tax} onChange={v => set('tax', v)} /></Field>
                    <Field label="Total amount"><MoneyInput value={d.total} onChange={v => set('total', v)} /></Field>
                    <Field label="Invoice #"><input value={d.invoice} onChange={e => set('invoice', e.target.value)} style={inputStyle} /></Field>
                </div>

                <Field label="Inventory item">
                    <LinkPicker options={inventory} names={inventoryDisplay} value={d.inventory} onChange={v => set('inventory', v)} placeholder="Search inventory…" />
                    {d.inventory.length === 0 && (
                        <button type="button" onClick={() => setShowInvForm(true)}
                            style={{ marginTop: '7px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '12.5px', fontWeight: 700, color: 'var(--accent)' }}>
                            + New inventory item
                        </button>
                    )}
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Field label="Bank"><PlainSelect options={bankChoices} value={d.bank} onChange={v => set('bank', v)} /></Field>
                    <Field label="Card"><PlainSelect options={cardChoices} value={d.card} onChange={v => set('card', v)} /></Field>
                </div>

                {err && <div style={{ color: PALETTE.rust, fontSize: '13px', fontWeight: 600 }}>{err}</div>}

                {/* sticky footer */}
                <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px', background: 'linear-gradient(transparent, var(--glass-bg-strong) 40%)' }}>
                    {confirmDel ? (
                        // Two-step confirm: nothing is deleted until "Yes, delete" is clicked.
                        <div style={{ ...glass({ soft: true }), padding: '12px 14px', border: `1px solid var(--accent-2)`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                <WarningIcon size={17} weight="fill" color={PALETTE.rust} /> Delete this expense permanently?
                            </span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>This removes the record from Airtable and can’t be undone.</span>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <Button onClick={del} disabled={busy} style={{ flex: 1, background: PALETTE.rust, color: '#fff' }}>
                                    {busy ? 'Deleting…' : <><TrashIcon size={16} weight="bold" /> Yes, delete</>}
                                </Button>
                                <Button variant="ghost" onClick={() => setConfirmDel(false)} disabled={busy}>Cancel</Button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <Button onClick={save} disabled={busy} style={{ flex: 1 }}>
                                {busy ? 'Saving…' : saved ? <><CheckCircleIcon size={16} weight="fill" /> Saved</> : <><FloppyDiskIcon size={16} weight="bold" /> {rec ? 'Save changes' : 'Create expense'}</>}
                            </Button>
                            <Button variant="ghost" onClick={onClose}>{rec ? 'Close' : 'Cancel'}</Button>
                            {rec && (
                                <button onClick={() => setConfirmDel(true)} disabled={busy} aria-label="Delete expense" title="Delete expense"
                                    style={{ width: '42px', height: '42px', flexShrink: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: PALETTE.rust, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <TrashIcon size={18} weight="bold" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showInvForm && (
                <InventoryForm
                    initialName={d.item || d.orderDesc}
                    onClose={() => setShowInvForm(false)}
                    onSaved={id => { if (id) set('inventory', [id]); }}
                />
            )}
        </div>
    );
}

