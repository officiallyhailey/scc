'use client';

// /inventory — "The Pantry". Lists Inventory-table items with location/department/type/
// vendor filters and a sort. Create + edit run through the shared <InventoryForm> drawer
// (the same form the expense drawer pops to add a missing item). Shows the Inventory Name.

import React, { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlassIcon, PlusIcon, PackageIcon, LinkSimpleIcon, TrendUpIcon, XIcon } from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel, TableModel } from '@/lib/airtable/models';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Button, DISPLAY, MONO, inputStyle, PALETTE } from '@/lib/components/ui';
import { InlineLink, InlineSelect, InlineMultiLink, ColumnHeader, MultiFilter } from '@/lib/components/fields';
import { InventoryForm } from '@/lib/components/InventoryForm';
import { TABLES, INV } from '@/lib/silk/schema';
import { usd, num, str, linkIds, selectName, nameMap, fieldChoices } from '@/lib/silk/cells';
import { buildFlagMap, type FlagInfo } from '@/lib/silk/history';
import { flagKey, loadDismissed, saveDismissed } from '@/lib/silk/flagDismiss';

// Shared grid template for the desktop list — used by both the column header and each InvRow.
const INV_GRID = 'minmax(120px, 1.4fr) 1.1fr 1fr 0.9fr 0.8fr 120px';

function uniqueSorted(records: RecordModel[], pick: (r: RecordModel) => string): string[] {
    const s = new Set<string>();
    for (const r of records) { const v = pick(r); if (v) s.add(v); }
    return Array.from(s).sort();
}

// A field's filter passes when nothing is selected (= all) or the row matches at least
// one selected token; '__none__' matches rows where the field is blank.
function matchMulti(selected: string[], rowVals: string[]): boolean {
    if (selected.length === 0) return true;
    return selected.some(s => (s === '__none__' ? rowVals.length === 0 : rowVals.includes(s)));
}

export default function InventoryPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    return (
        <Shell>
            {mounted ? (
                <AirtableBoundary>
                    <Inventory />
                </AirtableBoundary>
            ) : (
                <div style={{ flex: 1 }} />
            )}
        </Shell>
    );
}

function Inventory() {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const invTable = base.tables.find(t => t.id === TABLES.inventory)!;
    const vendorsTable = base.tables.find(t => t.id === TABLES.vendors)!;
    const locationsTable = base.tables.find(t => t.id === TABLES.locations)!;
    const expensesTable = base.tables.find(t => t.id === TABLES.expenses)!;
    const inv = useRecords(invTable);
    const vendors = useRecords(vendorsTable);
    const locations = useRecords(locationsTable);
    const expenses = useRecords(expensesTable); // for price-jump flags + the history report
    const vendorNames = useMemo(() => { const m = new Map<string, string>(); for (const v of vendors) m.set(v.id, v.name || ''); return m; }, [vendors]);
    const locationNames = useMemo(() => nameMap(locations), [locations]);
    // Full choice lists for the inline row editors.
    const deptChoices = useMemo(() => fieldChoices(invTable, INV.department), [invTable]);
    const typeChoices = useMemo(() => fieldChoices(invTable, INV.type), [invTable]);
    // invId → FlagInfo: latest purchase's price vs the item's listed Unit Price.
    const flagByItem = useMemo(() => buildFlagMap(expenses, inv), [expenses, inv]);

    // User-dismissed flags (localStorage). A flag is "active" only if it's flagged AND not dismissed
    // for its current triggering purchase — a newer purchase re-raises it (different flagKey).
    const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
    const refreshDismissed = () => setDismissed(loadDismissed());
    const isFlagActive = (id: string) => {
        const f = flagByItem.get(id);
        return !!f?.flagged && !dismissed.has(flagKey(id, f.latestDate));
    };
    const dismissFlag = (id: string) => {
        const f = flagByItem.get(id);
        if (!f) return;
        const s = loadDismissed();
        s.add(flagKey(id, f.latestDate));
        saveDismissed(s);
        setDismissed(new Set(s));
    };

    const [q, setQ] = useState('');
    const [loc, setLoc] = useState<string[]>([]);
    const [dept, setDept] = useState<string[]>([]);
    const [type, setType] = useState<string[]>([]);
    const [vendor, setVendor] = useState<string[]>([]);
    const [flag, setFlag] = useState('all'); // 'all' | 'flagged' | 'clear'
    const [sort, setSort] = useState<'item' | 'price' | 'created' | 'jump'>('item');
    const [form, setForm] = useState<null | { recordId?: string }>(null);

    const depts = useMemo(() => uniqueSorted(inv, r => selectName(r, INV.department)), [inv]);
    const types = useMemo(() => uniqueSorted(inv, r => selectName(r, INV.type)), [inv]);
    const vendorOptions = useMemo(() => {
        const ids = new Set<string>();
        for (const r of inv) for (const id of linkIds(r, INV.vendor)) ids.add(id);
        return Array.from(ids).map(id => ({ id, name: vendorNames.get(id) ?? '(vendor)' })).sort((a, b) => a.name.localeCompare(b.name));
    }, [inv, vendorNames]);

    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const filtered = inv
            .filter(r => matchMulti(loc, linkIds(r, INV.trackingLocations)))
            .filter(r => matchMulti(dept, [selectName(r, INV.department)].filter(Boolean)))
            .filter(r => matchMulti(type, [selectName(r, INV.type)].filter(Boolean)))
            .filter(r => matchMulti(vendor, linkIds(r, INV.vendor)))
            .filter(r => flag === 'all' || (flag === 'flagged' ? isFlagActive(r.id) : !isFlagActive(r.id)))
            .filter(r => {
                if (!needle) return true;
                const hay = [str(r, INV.name), str(r, INV.orderName), linkIds(r, INV.vendor).map(id => vendorNames.get(id) ?? '').join(' '), selectName(r, INV.type)].join(' ').toLowerCase();
                return hay.includes(needle);
            });
        const sorted = filtered.sort((a, b) => {
            if (sort === 'price') return num(b, INV.unitPrice) - num(a, INV.unitPrice);
            if (sort === 'created') return Date.parse(b.createdTime) - Date.parse(a.createdTime);
            if (sort === 'jump') return (flagByItem.get(b.id)?.latestDelta ?? -Infinity) - (flagByItem.get(a.id)?.latestDelta ?? -Infinity);
            const an = str(a, INV.name) || a.name || '', bn = str(b, INV.name) || b.name || '';
            return an.localeCompare(bn);
        });
        return sorted.slice(0, 400);
    }, [inv, q, loc, dept, type, vendor, flag, sort, vendorNames, flagByItem, dismissed]);

    return (
        <div style={{ width: '100%', maxWidth: '1140px', margin: '0 auto', padding: `${isNarrow ? '18px' : '28px'} ${isNarrow ? '16px' : '26px'} 70px` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Inventory</div>
                    <h1 style={{ fontFamily: DISPLAY, fontSize: isNarrow ? '34px' : '44px', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '6px 0 0', color: 'var(--text-primary)' }}>The Pantry</h1>
                </div>
                <Button onClick={() => setForm({})} title="New item"><PlusIcon size={18} weight="bold" /></Button>
            </div>

            {/* filters — raised above the list below so the dropdowns overlay it (both use
                backdrop-filter, which creates stacking contexts painted in DOM order) */}
            <div style={{ ...glass(), padding: '10px', marginBottom: '14px', position: 'relative', zIndex: 30,
                ...(isNarrow
                    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }
                    : { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }) }}>
                <div style={{ position: 'relative', ...(isNarrow ? { gridColumn: '1 / -1' } : { flex: '1 1 200px', minWidth: '170px' }) }}>
                    <MagnifyingGlassIcon size={16} weight="bold" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items, vendors…" style={{ ...inputStyle, paddingLeft: '34px' }} />
                </div>
                <MultiFilter block={isNarrow} value={loc} onChange={setLoc} allLabel="All locations" options={[{ value: '__none__', label: '— No location —' }, ...locations.map(l => ({ value: l.id, label: l.name || '(loc)' }))]} />
                <MultiFilter block={isNarrow} value={dept} onChange={setDept} allLabel="All departments" options={[{ value: '__none__', label: '— No department —' }, ...depts.map(d => ({ value: d, label: d }))]} />
                <MultiFilter block={isNarrow} value={type} onChange={setType} allLabel="All types" options={[{ value: '__none__', label: '— No type —' }, ...types.map(t => ({ value: t, label: t }))]} />
                <MultiFilter block={isNarrow} value={vendor} onChange={setVendor} allLabel="All vendors" searchable options={[{ value: '__none__', label: '— No vendor —' }, ...vendorOptions.map(v => ({ value: v.id, label: v.name }))]} />
                <Sel block={isNarrow} value={flag} onChange={setFlag} all="All price flags" opts={[{ value: 'flagged', label: '⚠ Price jumps only' }, { value: 'clear', label: 'No recent jump' }]} />
                <select value={sort} onChange={e => setSort(e.target.value as 'item' | 'price' | 'created' | 'jump')} style={{ ...inputStyle, width: isNarrow ? '100%' : 'auto', flex: isNarrow ? '1 1 auto' : '0 0 auto' }} title="Sort by">
                    <option value="item">Sort: Item</option>
                    <option value="price">Sort: Unit Price</option>
                    <option value="jump">Sort: Biggest price jump</option>
                    <option value="created">Sort: Created Date</option>
                </select>
            </div>

            {/* list */}
            {rows.length === 0 ? (
                <div style={{ ...glass({ soft: true }), padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <PackageIcon size={34} weight="duotone" />
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>{flag === 'flagged' ? 'No price jumps in the current filters.' : 'No inventory items match.'}</div>
                </div>
            ) : flag === 'flagged' ? (
                <PriceComparison rows={rows} flagByItem={flagByItem} vendorNames={vendorNames} isNarrow={isNarrow}
                    onOpen={id => setForm({ recordId: id })} onDismiss={dismissFlag} />
            ) : (
                <div style={{ ...glass(), padding: '4px', display: 'flex', flexDirection: 'column' }}>
                    {!isNarrow && <ColumnHeader gridCols={INV_GRID} cols={[{ label: 'Item' }, { label: 'Tracking Locations' }, { label: 'Vendor' }, { label: 'Department' }, { label: 'Type' }, { label: 'Unit Price', right: true }]} />}
                    {rows.map((r, i) => (
                        <InvRow key={r.id} rec={r} last={i === rows.length - 1} table={invTable} isNarrow={isNarrow}
                            vendors={vendors} locations={locations} vendorNames={vendorNames} locationNames={locationNames}
                            deptChoices={deptChoices} typeChoices={typeChoices}
                            flag={isFlagActive(r.id) ? flagByItem.get(r.id) : undefined} onDismissFlag={() => dismissFlag(r.id)}
                            onOpen={() => setForm({ recordId: r.id })} />
                    ))}
                </div>
            )}

            {form && (
                <InventoryForm recordId={form.recordId} onClose={() => setForm(null)} onFlagChange={refreshDismissed} />
            )}
        </div>
    );
}

function Sel({ value, onChange, all, opts, block }: { value: string; onChange: (v: string) => void; all: string; opts: { value: string; label: string }[]; block?: boolean }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, width: block ? '100%' : 'auto', flex: block ? '1 1 auto' : '0 0 auto', maxWidth: block ? 'none' : '170px' }}>
            <option value="all">{all}</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

// Grid template for the price-comparison report — header + each ComparisonRow.
const CMP_GRID = 'minmax(130px, 1.5fr) 1.1fr 0.85fr 0.8fr 84px 96px 82px';

/**
 * Report view shown when the "Price jumps only" filter is active. Instead of the editable
 * inventory grid it lays out a screenshot-friendly price comparison — the price that drove
 * the flag, the item's listed Unit Price, the % increase, plus Vendor / Department / Type —
 * sorted biggest jump first, so it can be dropped into an email to a vendor.
 */
function PriceComparison({
    rows, flagByItem, vendorNames, isNarrow, onOpen, onDismiss,
}: {
    rows: RecordModel[]; flagByItem: Map<string, FlagInfo>; vendorNames: Map<string, string>;
    isNarrow: boolean; onOpen: (id: string) => void; onDismiss: (id: string) => void;
}) {
    // Report leads with the biggest increases regardless of the page's own sort control.
    const ranked = useMemo(
        () => [...rows].sort((a, b) => (flagByItem.get(b.id)?.latestDelta ?? 0) - (flagByItem.get(a.id)?.latestDelta ?? 0)),
        [rows, flagByItem],
    );

    return (
        <div style={{ ...glass(), padding: isNarrow ? '14px' : '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Price comparison</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: isNarrow ? '22px' : '26px', color: 'var(--text-primary)', marginTop: '2px' }}>
                        {ranked.length} price {ranked.length === 1 ? 'increase' : 'increases'} flagged
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <TrendUpIcon size={14} weight="bold" color={PALETTE.rust} /> Latest paid vs listed unit price
                </div>
            </div>

            <div style={{ ...glass({ soft: true }), padding: '4px' }}>
                {!isNarrow && (
                    <ColumnHeader gridCols={CMP_GRID} cols={[
                        { label: 'Item' }, { label: 'Vendor' }, { label: 'Department' }, { label: 'Type' },
                        { label: 'Listed', right: true }, { label: 'Paid', right: true }, { label: 'Increase', right: true },
                    ]} />
                )}
                {ranked.map((r, i) => (
                    <ComparisonRow key={r.id} rec={r} flag={flagByItem.get(r.id)} vendorNames={vendorNames}
                        last={i === ranked.length - 1} isNarrow={isNarrow} onOpen={() => onOpen(r.id)} onDismiss={() => onDismiss(r.id)} />
                ))}
            </div>
        </div>
    );
}

function ComparisonRow({
    rec, flag, vendorNames, last, isNarrow, onOpen, onDismiss,
}: {
    rec: RecordModel; flag?: FlagInfo; vendorNames: Map<string, string>;
    last: boolean; isNarrow: boolean; onOpen: () => void; onDismiss: () => void;
}) {
    const name = str(rec, INV.name) || rec.name || '(unnamed)';
    const vendor = linkIds(rec, INV.vendor).map(id => vendorNames.get(id) ?? '').filter(Boolean).join(', ') || '—';
    const dept = selectName(rec, INV.department) || '—';
    const type = selectName(rec, INV.type) || '—';
    const listed = num(rec, INV.unitPrice);
    const paid = flag?.latestUnit ?? 0;
    const pct = flag ? Math.round(flag.latestDelta * 100) : 0;

    const dismissBtn = (
        <button type="button" title="Dismiss this flag" aria-label="Dismiss flag"
            onClick={e => { e.stopPropagation(); onDismiss(); }}
            style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            <XIcon size={11} weight="bold" />
        </button>
    );
    const pctPill = (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 700, color: PALETTE.rust, background: 'rgba(181,138,58,0.16)', padding: '2px 8px', borderRadius: '999px' }}>
            <TrendUpIcon size={11} weight="bold" /> +{pct}%
        </span>
    );
    const shared = {
        onClick: onOpen,
        onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'var(--glass-bg-soft)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'transparent'; },
    };

    if (!isNarrow) {
        return (
            <div {...shared} style={{ display: 'grid', gridTemplateColumns: CMP_GRID, alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', borderBottom: last ? 'none' : '1px solid var(--hairline)' }}>
                <span title={name} style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span title={vendor} style={{ fontSize: '12.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor}</span>
                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dept}</span>
                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{type}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{listed ? usd(listed) : '—'}</span>
                <span style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: '16px', color: PALETTE.rust, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{paid ? usd(paid) : '—'}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>{pctPill}{dismissBtn}</span>
            </div>
        );
    }

    return (
        <div {...shared} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', borderBottom: last ? 'none' : '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>{pctPill}{dismissBtn}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{[vendor, dept, type].filter(v => v && v !== '—').join(' · ') || '—'}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Listed {listed ? usd(listed) : '—'}</span>
                <CaretRightMini />
                <span style={{ fontFamily: DISPLAY, fontSize: '17px', color: PALETTE.rust }}>{paid ? usd(paid) : '—'}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>paid</span>
            </div>
        </div>
    );
}

function CaretRightMini() {
    return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>→</span>;
}

// One inventory row — aligned columns like Expenses/Sales with inline-editable Tracking
// Locations, Vendor, Department and Type (write straight to Airtable, dd-savebar while saving).
function InvRow({
    rec, last, table, isNarrow, vendors, locations, vendorNames, locationNames, deptChoices, typeChoices, flag, onDismissFlag, onOpen,
}: {
    rec: RecordModel; last: boolean; table: TableModel; isNarrow: boolean;
    vendors: RecordModel[]; locations: RecordModel[];
    vendorNames: Map<string, string>; locationNames: Map<string, string>;
    deptChoices: string[]; typeChoices: string[];
    flag?: { flagged: boolean; latestDelta: number };
    onDismissFlag?: () => void;
    onOpen: () => void;
}) {
    const name = str(rec, INV.name) || rec.name || '(unnamed)';
    const url = str(rec, INV.url);
    const price = num(rec, INV.unitPrice);
    const s763 = num(rec, INV.stock763), s869 = num(rec, INV.stock869);

    const [openCount, setOpenCount] = useState(0);
    const [savingField, setSavingField] = useState<string | null>(null);
    const onToggle = (o: boolean) => setOpenCount(c => Math.max(0, c + (o ? 1 : -1)));
    async function update(field: string, fields: Record<string, unknown>) {
        setSavingField(field);
        try { await table.updateRecordAsync(rec, fields); } catch { /* SWR keeps the old value */ } finally { setSavingField(null); }
    }

    const fill = true; // chips fill their grid cell in both the wide and narrow (2-col) layouts
    const locEd = <InlineMultiLink value={linkIds(rec, INV.trackingLocations)} names={locationNames} options={locations} placeholder="Locations" fill={fill} saving={savingField === 'loc'} onToggle={onToggle} onChange={v => update('loc', { [INV.trackingLocations]: v })} />;
    const venEd = <InlineLink value={linkIds(rec, INV.vendor)} names={vendorNames} options={vendors} placeholder="Vendor" fill={fill} saving={savingField === 'vendor'} onToggle={onToggle} onChange={v => update('vendor', { [INV.vendor]: v })} />;
    const depEd = <InlineSelect value={selectName(rec, INV.department)} options={deptChoices} placeholder="Department" fill={fill} saving={savingField === 'dept'} onToggle={onToggle} onChange={v => update('dept', { [INV.department]: v || null })} />;
    const typeEd = <InlineSelect value={selectName(rec, INV.type)} options={typeChoices} placeholder="Type" fill={fill} saving={savingField === 'type'} onToggle={onToggle} onChange={v => update('type', { [INV.type]: v || null })} />;
    const itemCell = (
        <span title={name} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            {url && <LinkSimpleIcon size={13} color={PALETTE.mist} style={{ flexShrink: 0 }} />}
        </span>
    );
    const amountCell = (
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
            {flag?.flagged && (
                <span onClick={e => { e.stopPropagation(); onDismissFlag?.(); }}
                    title={`Latest purchase is ${Math.round(flag.latestDelta * 100)}% above the listed unit price — click to dismiss`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', fontWeight: 700, color: PALETTE.rust, background: 'rgba(181,138,58,0.16)', padding: '1px 5px 1px 7px', borderRadius: '999px', cursor: 'pointer' }}>
                    <TrendUpIcon size={11} weight="bold" /> {Math.round(flag.latestDelta * 100)}%
                    <XIcon size={9} weight="bold" style={{ opacity: 0.7 }} />
                </span>
            )}
            <span style={{ fontFamily: DISPLAY, fontSize: '16px', color: 'var(--text-primary)' }}>{price ? usd(price) : '—'}</span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>763: {s763} · 869: {s869}</span>
        </div>
    );
    const shared = {
        onClick: onOpen,
        onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'var(--glass-bg-soft)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'transparent'; },
    };

    // Wide: one aligned grid row — Item | Tracking Locations | Vendor | Department | Type | Price.
    if (!isNarrow) {
        return (
            <div {...shared}
                style={{
                    display: 'grid', gridTemplateColumns: INV_GRID,
                    alignItems: 'center', gap: '10px', padding: '8px 14px',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    position: 'relative', zIndex: openCount > 0 ? 5 : 'auto',
                    borderBottom: last ? 'none' : '1px solid var(--hairline)',
                }}>
                <div style={{ minWidth: 0 }}>{itemCell}</div>
                {locEd}{venEd}{depEd}{typeEd}
                {amountCell}
            </div>
        );
    }

    // Narrow: item + price on the top line, then the editable fields in a uniform 2-col grid.
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
                {locEd}{venEd}{depEd}{typeEd}
            </div>
        </div>
    );
}
