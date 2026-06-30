'use client';

// /sales — the sales register. Lists Sales-table rows (one per Square line item) with a
// detail drawer to edit/create. A row's department/category is read-only — it resolves from
// the row's "Linked Product", which the drawer's product picker sets. Mirrors the Expenses
// page; shares cells (lib/silk/cells) and form controls (lib/components/fields).

import React, { useEffect, useMemo, useState } from 'react';
import {
    MagnifyingGlassIcon, XIcon, ChartLineUpIcon, FloppyDiskIcon, CheckCircleIcon, TagIcon, PlusIcon,
} from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel, TableModel } from '@/lib/airtable/models';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Pill, Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { Field, LinkPicker, iconBtn } from '@/lib/components/fields';
import { TABLES, SALE } from '@/lib/silk/schema';
import { usd, num, str, numStr, linkIds, selectNames, nameMap, weekKey, parseNum } from '@/lib/silk/cells';

// Department → pill tone (Bar = gold accent, Kitchen = slate, Retail Coffee = muted).
const deptTone = (d: string): 'olive' | 'mist' | 'gold' | 'slate' | 'neutral' =>
    d === 'Bar' ? 'gold' : d === 'Kitchen' ? 'slate' : d === 'Retail Coffee' ? 'mist' : 'neutral';

const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };
const row3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' };

export default function SalesPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    return (
        <Shell>
            {mounted ? <AirtableBoundary><Sales /></AirtableBoundary> : <div style={{ flex: 1 }} />}
        </Shell>
    );
}

function Sales() {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const salesTable = base.tables.find(t => t.id === TABLES.sales)!;
    const locationsTable = base.tables.find(t => t.id === TABLES.locations)!;
    const productsTable = base.tables.find(t => t.id === TABLES.products)!;
    const sales = useRecords(salesTable);
    const locations = useRecords(locationsTable);
    const products = useRecords(productsTable);
    const locationNames = useMemo(() => nameMap(locations), [locations]);
    const productNames = useMemo(() => nameMap(products), [products]);

    const [week, setWeek] = useState('all');
    const [loc, setLoc] = useState('all');
    const [dept, setDept] = useState('all');
    const [q, setQ] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const weeks = useMemo(() => {
        const s = new Set<string>();
        for (const r of sales) { const w = str(r, SALE.weekStart); if (w) s.add(w); }
        return Array.from(s).sort((a, b) => weekKey(b).localeCompare(weekKey(a)));
    }, [sales]);
    const depts = useMemo(() => {
        const s = new Set<string>();
        for (const r of sales) for (const d of selectNames(r, SALE.department)) s.add(d);
        return Array.from(s).sort();
    }, [sales]);

    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return sales
            .filter(r => week === 'all' || str(r, SALE.weekStart) === week)
            .filter(r => loc === 'all' || linkIds(r, SALE.locations).includes(loc))
            .filter(r => dept === 'all' || selectNames(r, SALE.department).includes(dept))
            .filter(r => {
                if (!needle) return true;
                return [str(r, SALE.item), str(r, SALE.itemVariation), selectNames(r, SALE.department).join(' ')].join(' ').toLowerCase().includes(needle);
            })
            .sort((a, b) => weekKey(str(b, SALE.weekStart)).localeCompare(weekKey(str(a, SALE.weekStart))) || num(b, SALE.netSales) - num(a, SALE.netSales))
            .slice(0, 600);
    }, [sales, week, loc, dept, q]);

    const total = useMemo(() => rows.reduce((s, r) => s + num(r, SALE.netSales), 0), [rows]);
    const openRec = openId ? sales.find(r => r.id === openId) ?? null : null;
    const pad = isNarrow ? '16px' : '26px';

    return (
        <div style={{ width: '100%', maxWidth: '1140px', margin: '0 auto', padding: `${isNarrow ? '18px' : '28px'} ${pad} 70px` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Sales</div>
                    <h1 style={{ fontFamily: DISPLAY, fontSize: isNarrow ? '34px' : '44px', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '6px 0 0', color: 'var(--text-primary)' }}>The Register</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ ...glass({ soft: true }), padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{rows.length} shown</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '24px', color: 'var(--text-primary)' }}>{usd(total)}</div>
                    </div>
                    <Button onClick={() => setCreating(true)}><PlusIcon size={16} weight="bold" /> New sale</Button>
                </div>
            </div>

            <div style={{ ...glass(), padding: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
                    <MagnifyingGlassIcon size={16} weight="bold" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" style={{ ...inputStyle, paddingLeft: '34px' }} />
                </div>
                <Sel value={week} onChange={setWeek} all="All weeks" opts={weeks.map(w => ({ value: w, label: w }))} />
                <Sel value={loc} onChange={setLoc} all="All locations" opts={locations.map(l => ({ value: l.id, label: l.name || '(loc)' }))} />
                <Sel value={dept} onChange={setDept} all="All departments" opts={depts.map(d => ({ value: d, label: d }))} />
            </div>

            {rows.length === 0 ? (
                <div style={{ ...glass({ soft: true }), padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ChartLineUpIcon size={34} weight="duotone" />
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>No sales match these filters.</div>
                </div>
            ) : (
                <div style={{ ...glass(), padding: '4px', display: 'flex', flexDirection: 'column' }}>
                    {rows.map((r, i) => {
                        const item = str(r, SALE.item) || '(item)';
                        const variation = str(r, SALE.itemVariation);
                        const depts = selectNames(r, SALE.department);
                        const sold = num(r, SALE.itemsSold);
                        const date = str(r, SALE.date);
                        return (
                            <div key={r.id} onClick={() => setOpenId(r.id)}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-bg-soft)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--hairline)' }}>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{item}{variation && variation !== item ? ` · ${variation}` : ''}</span>
                                    {depts.length > 0 ? (
                                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>{depts.map(d => <Pill key={d} text={d} tone={deptTone(d)} />)}</div>
                                    ) : (
                                        <span style={{ fontSize: '12px', fontStyle: 'italic', color: PALETTE.rust }}>link a product to categorize</span>
                                    )}
                                </div>
                                <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '96px' }}>
                                    <span style={{ fontFamily: DISPLAY, fontSize: '18px', color: 'var(--text-primary)' }}>{usd(num(r, SALE.netSales))}</span>
                                    {sold ? <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{sold} sold</span> : null}
                                    {date && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{date}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {openRec && (
                <SaleDrawer key={openRec.id} rec={openRec} table={salesTable}
                    locations={locations} products={products} locationNames={locationNames} productNames={productNames}
                    isNarrow={isNarrow} onClose={() => setOpenId(null)} />
            )}
            {creating && (
                <SaleDrawer key="new" rec={null} table={salesTable}
                    locations={locations} products={products} locationNames={locationNames} productNames={productNames}
                    defaultLocation={loc !== 'all' ? [loc] : undefined}
                    isNarrow={isNarrow} onClose={() => setCreating(false)} />
            )}
        </div>
    );
}

function Sel({ value, onChange, all, opts }: { value: string; onChange: (v: string) => void; all: string; opts: { value: string; label: string }[] }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 0 auto', maxWidth: '180px' }}>
            <option value="all">{all}</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

function SaleDrawer({
    rec, table, locations, products, locationNames, productNames, isNarrow, onClose, defaultLocation,
}: {
    rec?: RecordModel | null; table: TableModel;
    locations: RecordModel[]; products: RecordModel[];
    locationNames: Map<string, string>; productNames: Map<string, string>;
    isNarrow: boolean; onClose: () => void; defaultLocation?: string[];
}) {
    const init = useMemo(() => (rec ? {
        item: str(rec, SALE.item), itemVariation: str(rec, SALE.itemVariation),
        itemsSold: numStr(rec, SALE.itemsSold), netSales: numStr(rec, SALE.netSales), price: numStr(rec, SALE.price),
        date: str(rec, SALE.date),
        location: linkIds(rec, SALE.locations), product: linkIds(rec, SALE.linkedProduct),
    } : {
        item: '', itemVariation: '', itemsSold: '', netSales: '', price: '', date: '',
        location: defaultLocation ?? [], product: [] as string[],
    }), [rec]);
    const [d, setD] = useState(init);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [err, setErr] = useState('');
    type D = typeof d;
    const set = <K extends keyof D>(k: K, v: D[K]) => { setD(p => ({ ...p, [k]: v })); setSaved(false); };

    const dept = rec ? selectNames(rec, SALE.department) : [];
    const salesCat = rec ? selectNames(rec, SALE.salesCategory) : [];
    const week = rec ? str(rec, SALE.weekStart) : '';

    async function save() {
        setBusy(true); setErr('');
        const fields: Record<string, unknown> = {
            [SALE.item]: d.item,
            [SALE.itemVariation]: d.itemVariation,
            [SALE.itemsSold]: parseNum(d.itemsSold),
            [SALE.netSales]: parseNum(d.netSales),
            [SALE.price]: parseNum(d.price),
            [SALE.date]: d.date || null,
            [SALE.locations]: d.location,
            [SALE.linkedProduct]: d.product,
        };
        try {
            if (rec) { await table.updateRecordAsync(rec, fields); setSaved(true); }
            else { await table.createRecordAsync(fields); onClose(); }
        } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed.'); }
        setBusy(false);
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, top: 'var(--nav-h)', zIndex: 1000, background: 'rgba(20,28,32,0.32)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: isNarrow ? '100%' : 'min(540px, 94vw)', height: '100%', overflowY: 'auto',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                borderLeft: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-hover)',
                padding: isNarrow ? '18px' : '24px', display: 'flex', flexDirection: 'column', gap: '15px',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                        <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{rec ? 'Edit sale' : 'New sale'} {week && `· week of ${week}`}</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '24px', color: 'var(--text-primary)', marginTop: '2px' }}>{d.item || (rec ? 'Sale' : 'New sale')}</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={iconBtn}><XIcon size={18} weight="bold" /></button>
                </div>

                {/* resolved category readout */}
                <div style={{ ...glass({ soft: true }), padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <TagIcon size={15} color={PALETTE.olive} />
                    {dept.length || salesCat.length ? (
                        <>{dept.map(x => <Pill key={x} text={x} tone={deptTone(x)} />)}{salesCat.map(x => <Pill key={x} text={x} tone="neutral" />)}</>
                    ) : (
                        <span style={{ fontSize: '12.5px', color: PALETTE.rust, fontWeight: 600 }}>No department yet — set the Linked product below to categorize.</span>
                    )}
                </div>

                <div style={row2}>
                    <Field label="Item"><input value={d.item} onChange={e => set('item', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Item variation"><input value={d.itemVariation} onChange={e => set('itemVariation', e.target.value)} style={inputStyle} /></Field>
                </div>

                <Field label="Linked product (sets category)">
                    <LinkPicker options={products} names={productNames} value={d.product} onChange={v => set('product', v)} placeholder="Search products…" />
                </Field>
                <Field label="Location">
                    <LinkPicker options={locations} names={locationNames} value={d.location} onChange={v => set('location', v)} placeholder="Search locations…" />
                </Field>

                <div style={row3}>
                    <Field label="Items sold"><input inputMode="decimal" value={d.itemsSold} onChange={e => set('itemsSold', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Net sales"><MoneyInput value={d.netSales} onChange={v => set('netSales', v)} /></Field>
                    <Field label="Price"><MoneyInput value={d.price} onChange={v => set('price', v)} /></Field>
                </div>
                <Field label="Date"><input type="date" value={d.date} onChange={e => set('date', e.target.value)} style={inputStyle} /></Field>

                {err && <div style={{ color: PALETTE.rust, fontSize: '13px', fontWeight: 600 }}>{err}</div>}

                <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px', display: 'flex', gap: '10px', background: 'linear-gradient(transparent, var(--glass-bg-strong) 40%)' }}>
                    <Button onClick={save} disabled={busy} style={{ flex: 1 }}>
                        {busy ? 'Saving…' : saved ? <><CheckCircleIcon size={16} weight="fill" /> Saved</> : <><FloppyDiskIcon size={16} weight="bold" /> {rec ? 'Save changes' : 'Create sale'}</>}
                    </Button>
                    <Button variant="ghost" onClick={onClose}>{rec ? 'Close' : 'Cancel'}</Button>
                </div>
            </div>
        </div>
    );
}

