'use client';

// /inventory — "The Pantry". Lists Inventory-table items with location/department/type/
// vendor filters and a sort. Create + edit run through the shared <InventoryForm> drawer
// (the same form the expense drawer pops to add a missing item). Shows the Inventory Name.

import React, { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlassIcon, PlusIcon, PackageIcon, LinkSimpleIcon } from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel } from '@/lib/airtable/models';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Pill, Button, DISPLAY, MONO, inputStyle, PALETTE } from '@/lib/components/ui';
import { InventoryForm } from '@/lib/components/InventoryForm';
import { TABLES, INV } from '@/lib/silk/schema';
import { usd, num, str, linkIds, selectName } from '@/lib/silk/cells';

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
        <div style={{ width: '100%', maxWidth: '1040px', margin: '0 auto', padding: `${isNarrow ? '18px' : '28px'} ${isNarrow ? '14px' : '26px'} 70px` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Inventory</div>
                    <h1 style={{ fontFamily: DISPLAY, fontSize: isNarrow ? '34px' : '44px', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '6px 0 0', color: 'var(--text-primary)' }}>The Pantry</h1>
                </div>
                <Button onClick={() => setForm({})}><PlusIcon size={16} weight="bold" /> New item</Button>
            </div>

            {/* filters */}
            <div style={{ ...glass(), padding: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '170px' }}>
                    <MagnifyingGlassIcon size={16} weight="bold" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items, vendors…" style={{ ...inputStyle, paddingLeft: '34px' }} />
                </div>
                <Sel value={loc} onChange={setLoc} all="All locations" opts={locations.map(l => ({ value: l.id, label: l.name || '(loc)' }))} />
                <Sel value={dept} onChange={setDept} all="All departments" opts={depts.map(d => ({ value: d, label: d }))} />
                <Sel value={type} onChange={setType} all="All types" opts={types.map(t => ({ value: t, label: t }))} />
                <Sel value={vendor} onChange={setVendor} all="All vendors" opts={vendorOptions.map(v => ({ value: v.id, label: v.name }))} />
                <select value={sort} onChange={e => setSort(e.target.value as 'item' | 'price' | 'created')} style={{ ...inputStyle, width: 'auto', flex: '0 0 auto' }} title="Sort by">
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
                    {rows.map((r, i) => {
                        const vendor = linkIds(r, INV.vendor).map(id => vendorNames.get(id)).filter(Boolean).join(', ');
                        const dep = selectName(r, INV.department);
                        const type = selectName(r, INV.type);
                        const price = num(r, INV.unitPrice);
                        const s763 = num(r, INV.stock763), s869 = num(r, INV.stock869);
                        const url = str(r, INV.url);
                        return (
                            <div key={r.id} onClick={() => setForm({ recordId: r.id })}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-bg-soft)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--hairline)' }}>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                                        {str(r, INV.name) || r.name || '(unnamed)'}
                                        {url && <LinkSimpleIcon size={13} color={PALETTE.mist} />}
                                    </span>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {dep && <Pill text={dep} tone="olive" />}
                                        {type && <Pill text={type} tone="mist" />}
                                        {vendor && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{vendor}</span>}
                                    </div>
                                </div>
                                <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontFamily: DISPLAY, fontSize: '16px', color: 'var(--text-primary)' }}>{price ? usd(price) : '—'}</span>
                                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>763: {s763} · 869: {s869}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {form && (
                <InventoryForm recordId={form.recordId} onClose={() => setForm(null)} />
            )}
        </div>
    );
}

function Sel({ value, onChange, all, opts }: { value: string; onChange: (v: string) => void; all: string; opts: { value: string; label: string }[] }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 0 auto', maxWidth: '170px' }}>
            <option value="all">{all}</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}
