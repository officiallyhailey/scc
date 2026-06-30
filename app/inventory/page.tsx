'use client';

// /inventory — "The Pantry". Lists Inventory-table items with location/department/type/
// vendor filters and a sort. Create + edit run through the shared <InventoryForm> drawer
// (the same form the expense drawer pops to add a missing item). Shows the Inventory Name.

import React, { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlassIcon, PlusIcon, PackageIcon, LinkSimpleIcon } from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel, TableModel } from '@/lib/airtable/models';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Button, DISPLAY, MONO, inputStyle, PALETTE } from '@/lib/components/ui';
import { InlineLink, InlineSelect, InlineMultiLink } from '@/lib/components/fields';
import { InventoryForm } from '@/lib/components/InventoryForm';
import { TABLES, INV } from '@/lib/silk/schema';
import { usd, num, str, linkIds, selectName, nameMap, fieldChoices } from '@/lib/silk/cells';

function uniqueSorted(records: RecordModel[], pick: (r: RecordModel) => string): string[] {
    const s = new Set<string>();
    for (const r of records) { const v = pick(r); if (v) s.add(v); }
    return Array.from(s).sort();
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
    const inv = useRecords(invTable);
    const vendors = useRecords(vendorsTable);
    const locations = useRecords(locationsTable);
    const vendorNames = useMemo(() => { const m = new Map<string, string>(); for (const v of vendors) m.set(v.id, v.name || ''); return m; }, [vendors]);
    const locationNames = useMemo(() => nameMap(locations), [locations]);
    // Full choice lists for the inline row editors.
    const deptChoices = useMemo(() => fieldChoices(invTable, INV.department), [invTable]);
    const typeChoices = useMemo(() => fieldChoices(invTable, INV.type), [invTable]);

    const [q, setQ] = useState('');
    const [loc, setLoc] = useState('all');
    const [dept, setDept] = useState('all');
    const [type, setType] = useState('all');
    const [vendor, setVendor] = useState('all');
    const [sort, setSort] = useState<'item' | 'price' | 'created'>('item');
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
            .filter(r => loc === 'all' || linkIds(r, INV.trackingLocations).includes(loc))
            .filter(r => dept === 'all' || selectName(r, INV.department) === dept)
            .filter(r => type === 'all' || selectName(r, INV.type) === type)
            .filter(r => vendor === 'all' || linkIds(r, INV.vendor).includes(vendor))
            .filter(r => {
                if (!needle) return true;
                const hay = [str(r, INV.name), str(r, INV.orderName), linkIds(r, INV.vendor).map(id => vendorNames.get(id) ?? '').join(' '), selectName(r, INV.type)].join(' ').toLowerCase();
                return hay.includes(needle);
            });
        const sorted = filtered.sort((a, b) => {
            if (sort === 'price') return num(b, INV.unitPrice) - num(a, INV.unitPrice);
            if (sort === 'created') return Date.parse(b.createdTime) - Date.parse(a.createdTime);
            const an = str(a, INV.name) || a.name || '', bn = str(b, INV.name) || b.name || '';
            return an.localeCompare(bn);
        });
        return sorted.slice(0, 400);
    }, [inv, q, loc, dept, type, vendor, sort, vendorNames]);

    return (
        <div style={{ width: '100%', maxWidth: '1140px', margin: '0 auto', padding: `${isNarrow ? '18px' : '28px'} ${isNarrow ? '16px' : '26px'} 70px` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Inventory</div>
                    <h1 style={{ fontFamily: DISPLAY, fontSize: isNarrow ? '34px' : '44px', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '6px 0 0', color: 'var(--text-primary)' }}>The Pantry</h1>
                </div>
                <Button onClick={() => setForm({})} title="New item"><PlusIcon size={18} weight="bold" /></Button>
            </div>

            {/* filters */}
            <div style={{ ...glass(), padding: '10px', marginBottom: '14px',
                ...(isNarrow
                    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }
                    : { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }) }}>
                <div style={{ position: 'relative', ...(isNarrow ? { gridColumn: '1 / -1' } : { flex: '1 1 200px', minWidth: '170px' }) }}>
                    <MagnifyingGlassIcon size={16} weight="bold" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items, vendors…" style={{ ...inputStyle, paddingLeft: '34px' }} />
                </div>
                <Sel block={isNarrow} value={loc} onChange={setLoc} all="All locations" opts={locations.map(l => ({ value: l.id, label: l.name || '(loc)' }))} />
                <Sel block={isNarrow} value={dept} onChange={setDept} all="All departments" opts={depts.map(d => ({ value: d, label: d }))} />
                <Sel block={isNarrow} value={type} onChange={setType} all="All types" opts={types.map(t => ({ value: t, label: t }))} />
                <Sel block={isNarrow} value={vendor} onChange={setVendor} all="All vendors" opts={vendorOptions.map(v => ({ value: v.id, label: v.name }))} />
                <select value={sort} onChange={e => setSort(e.target.value as 'item' | 'price' | 'created')} style={{ ...inputStyle, width: isNarrow ? '100%' : 'auto', flex: isNarrow ? '1 1 auto' : '0 0 auto' }} title="Sort by">
                    <option value="item">Sort: Item</option>
                    <option value="price">Sort: Unit Price</option>
                    <option value="created">Sort: Created Date</option>
                </select>
            </div>

            {/* list */}
            {rows.length === 0 ? (
                <div style={{ ...glass({ soft: true }), padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <PackageIcon size={34} weight="duotone" />
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>No inventory items match.</div>
                </div>
            ) : (
                <div style={{ ...glass(), padding: '4px', display: 'flex', flexDirection: 'column' }}>
                    {rows.map((r, i) => (
                        <InvRow key={r.id} rec={r} last={i === rows.length - 1} table={invTable} isNarrow={isNarrow}
                            vendors={vendors} locations={locations} vendorNames={vendorNames} locationNames={locationNames}
                            deptChoices={deptChoices} typeChoices={typeChoices}
                            onOpen={() => setForm({ recordId: r.id })} />
                    ))}
                </div>
            )}

            {form && (
                <InventoryForm recordId={form.recordId} onClose={() => setForm(null)} />
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

// One inventory row — aligned columns like Expenses/Sales with inline-editable Tracking
// Locations, Vendor, Department and Type (write straight to Airtable, dd-savebar while saving).
function InvRow({
    rec, last, table, isNarrow, vendors, locations, vendorNames, locationNames, deptChoices, typeChoices, onOpen,
}: {
    rec: RecordModel; last: boolean; table: TableModel; isNarrow: boolean;
    vendors: RecordModel[]; locations: RecordModel[];
    vendorNames: Map<string, string>; locationNames: Map<string, string>;
    deptChoices: string[]; typeChoices: string[];
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
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                    display: 'grid', gridTemplateColumns: 'minmax(120px, 1.4fr) 1.1fr 1fr 0.9fr 0.8fr 120px',
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
