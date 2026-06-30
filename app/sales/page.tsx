'use client';

// /sales — the sales register. Lists Sales-table rows (one per Square line item) with a
// detail drawer to edit/create. A row's department/category is read-only — it resolves from
// the row's "Linked Product", which the drawer's product picker sets. Mirrors the Expenses
// page; shares cells (lib/silk/cells) and form controls (lib/components/fields).

import React, { useEffect, useMemo, useState } from 'react';
import {
    MagnifyingGlassIcon, XIcon, ChartLineUpIcon, FloppyDiskIcon, CheckCircleIcon, PlusIcon,
    TrashIcon, WarningIcon,
} from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel, TableModel } from '@/lib/airtable/models';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Pill, Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { Field, LinkPicker, MultiFilter, InlineLink, ColumnHeader, iconBtn } from '@/lib/components/fields';
import { ProductForm } from '@/lib/components/ProductForm';
import { TABLES, SALE } from '@/lib/silk/schema';
import { usd, num, str, numStr, linkIds, selectNames, nameMap, weekKey, parseNum } from '@/lib/silk/cells';

// Department → pill tone (Bar = gold accent, Kitchen = slate, Retail Coffee = muted).
const deptTone = (d: string): 'olive' | 'mist' | 'gold' | 'slate' | 'neutral' =>
    d === 'Bar' ? 'gold' : d === 'Kitchen' ? 'slate' : d === 'Retail Coffee' ? 'mist' : 'neutral';

// Category → bar/swatch colour for the weekly breakdown. Known categories get fixed
// brand colours; anything else cycles a small pool (assigned deterministically by caller).
const CAT_FIXED: Record<string, string> = {
    Bar: 'var(--accent)', Kitchen: 'var(--c-slate)', 'Retail Coffee': '#8a979c', Uncategorized: 'var(--accent-2)',
};
const CAT_POOL = ['#9a7d27', '#5c6539', '#6b8a8f', '#b58a3a', '#7a6a9c', '#3f7d6b'];

// A field's filter passes when nothing is selected (= all) or the row matches at least
// one selected token; '__none__' matches rows where the field is blank.
function matchMulti(selected: string[], rowVals: string[]): boolean {
    if (selected.length === 0) return true;
    return selected.some(s => (s === '__none__' ? rowVals.length === 0 : rowVals.includes(s)));
}

const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };
const row3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' };
// Shared grid template for the desktop list — used by both the column header and each SaleRow.
const SALE_GRID = 'minmax(140px, 1.6fr) 1fr 1.4fr 150px';

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
    const salesCategoriesTable = base.tables.find(t => t.id === TABLES.salesCategories)!;
    const sales = useRecords(salesTable);
    const locations = useRecords(locationsTable);
    const products = useRecords(productsTable);
    // Warm the Sales-Categories cache here so opening ProductForm (which reads it) doesn't
    // suspend the page boundary and unmount the open drawer.
    useRecords(salesCategoriesTable);
    const locationNames = useMemo(() => nameMap(locations), [locations]);
    const productNames = useMemo(() => nameMap(products), [products]);

    // Multi-select filters: each holds selected tokens (week strings / record ids / dept
    // names, or '__none__' for blank). Empty array = no filter. Sort stays single.
    const [week, setWeek] = useState<string[]>([]);
    const [loc, setLoc] = useState<string[]>([]);
    const [dept, setDept] = useState<string[]>([]);
    const [product, setProduct] = useState<string[]>([]);
    const [sort, setSort] = useState('all');         // 'all' (newest) | 'item' | 'sold' | 'net'
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
    // Products actually linked across the sales rows (keeps the filter list short + relevant).
    const productOpts = useMemo(() => {
        const ids = new Set<string>();
        for (const r of sales) for (const id of linkIds(r, SALE.linkedProduct)) ids.add(id);
        return Array.from(ids)
            .map(id => ({ value: id, label: productNames.get(id) || '(product)' }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [sales, productNames]);

    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const filtered = sales
            .filter(r => matchMulti(week, str(r, SALE.weekStart) ? [str(r, SALE.weekStart)] : []))
            .filter(r => matchMulti(loc, linkIds(r, SALE.locations)))
            .filter(r => matchMulti(dept, selectNames(r, SALE.department)))
            .filter(r => matchMulti(product, linkIds(r, SALE.linkedProduct)))
            .filter(r => {
                if (!needle) return true;
                return [str(r, SALE.item), str(r, SALE.itemVariation), selectNames(r, SALE.department).join(' ')].join(' ').toLowerCase().includes(needle);
            });
        const byRecent = (a: RecordModel, b: RecordModel) => weekKey(str(b, SALE.weekStart)).localeCompare(weekKey(str(a, SALE.weekStart))) || num(b, SALE.netSales) - num(a, SALE.netSales);
        filtered.sort((a, b) => {
            switch (sort) {
                case 'item': return str(a, SALE.item).localeCompare(str(b, SALE.item)) || byRecent(a, b);
                case 'sold': return num(b, SALE.itemsSold) - num(a, SALE.itemsSold) || byRecent(a, b);
                case 'net': return num(b, SALE.netSales) - num(a, SALE.netSales) || byRecent(a, b);
                default: return byRecent(a, b);
            }
        });
        return filtered.slice(0, 600);
    }, [sales, week, loc, dept, product, sort, q]);

    const total = useMemo(() => rows.reduce((s, r) => s + num(r, SALE.netSales), 0), [rows]);
    const openRec = openId ? sales.find(r => r.id === openId) ?? null : null;
    const pad = isNarrow ? '16px' : '26px';

    // Stable category → colour map (so a category is the same colour across all week cards).
    const catColor = useMemo(() => {
        const m = new Map<string, string>();
        let pi = 0;
        for (const c of [...depts, 'Uncategorized']) m.set(c, CAT_FIXED[c] ?? CAT_POOL[pi++ % CAT_POOL.length]);
        return (name: string) => m.get(name) ?? '#9aa3a6';
    }, [depts]);

    // Per-week category breakdown for the summary — one card per selected week (so multiple
    // weeks can be compared). Respects the Location / Department / Product filters (but not the
    // free-text search) so the bar's numbers track those filters; week is the row key.
    const weekBreakdowns = useMemo(() => {
        const selWeeks = week.filter(w => w !== '__none__');
        if (selWeeks.length === 0) return null;
        return selWeeks
            .map(wk => {
                const inWeek = sales.filter(r =>
                    str(r, SALE.weekStart) === wk
                    && matchMulti(loc, linkIds(r, SALE.locations))
                    && matchMulti(dept, selectNames(r, SALE.department))
                    && matchMulti(product, linkIds(r, SALE.linkedProduct)),
                );
                const total = inWeek.reduce((s, r) => s + num(r, SALE.netSales), 0);
                const byCat = new Map<string, number>();
                for (const r of inWeek) {
                    const cat = selectNames(r, SALE.department)[0] || 'Uncategorized';
                    byCat.set(cat, (byCat.get(cat) ?? 0) + num(r, SALE.netSales));
                }
                const cats = [...byCat.entries()]
                    .map(([name, amount]) => ({ name, amount, pct: total > 0 ? amount / total : 0 }))
                    .sort((a, b) => b.amount - a.amount);
                return { week: wk, total, cats };
            })
            .sort((a, b) => weekKey(b.week).localeCompare(weekKey(a.week)));
    }, [sales, week, loc, dept, product]);

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
                    <Button onClick={() => setCreating(true)} title="New sale"><PlusIcon size={18} weight="bold" /></Button>
                </div>
            </div>

            {/* Filters (multi-select except Sort). position+zIndex lift the bar so open
                dropdowns aren't covered by the list below (both are backdrop-filter panels). */}
            <div style={{ ...glass(), position: 'relative', zIndex: 40, padding: '10px', marginBottom: '14px',
                ...(isNarrow
                    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }
                    : { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }) }}>
                <div style={{ position: 'relative', ...(isNarrow ? { gridColumn: '1 / -1' } : { flex: '1 1 200px', minWidth: '160px' }) }}>
                    <MagnifyingGlassIcon size={16} weight="bold" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" style={{ ...inputStyle, paddingLeft: '34px' }} />
                </div>
                <MultiFilter block={isNarrow} value={week} onChange={setWeek} allLabel="All weeks" options={weeks.map(w => ({ value: w, label: w }))} />
                <MultiFilter block={isNarrow} value={loc} onChange={setLoc} allLabel="All locations" options={locations.map(l => ({ value: l.id, label: l.name || '(loc)' }))} />
                <MultiFilter block={isNarrow} value={dept} onChange={setDept} allLabel="All departments" options={depts.map(d => ({ value: d, label: d }))} />
                <MultiFilter block={isNarrow} value={product} onChange={setProduct} allLabel="All products" searchable options={[{ value: '__none__', label: '— No linked product —' }, ...productOpts]} />
                <Sel block={isNarrow} value={sort} onChange={setSort} all="Sort: Newest" opts={[{ value: 'item', label: 'Sort: Item A–Z' }, { value: 'sold', label: 'Sort: Most sold' }, { value: 'net', label: 'Sort: Top net sales' }]} />
            </div>

            {/* Weekly category breakdown — one card per selected week (compare across weeks) */}
            {weekBreakdowns && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
                    {weekBreakdowns.map(wb => (
                        <div key={wb.week} style={{ ...glass(), padding: '13px 15px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                                <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sales by category · week of {wb.week}</span>
                                <span style={{ fontFamily: DISPLAY, fontSize: '20px', color: 'var(--text-primary)' }}>{usd(wb.total)}</span>
                            </div>
                            {/* stacked 100% bar */}
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
                        </div>
                    ))}
                </div>
            )}

            {rows.length === 0 ? (
                <div style={{ ...glass({ soft: true }), padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ChartLineUpIcon size={34} weight="duotone" />
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>No sales match these filters.</div>
                </div>
            ) : (
                <div style={{ ...glass(), padding: '4px', display: 'flex', flexDirection: 'column' }}>
                    {!isNarrow && <ColumnHeader gridCols={SALE_GRID} cols={[{ label: 'Item' }, { label: 'Category' }, { label: 'Linked Product' }, { label: 'Net Sales', right: true }]} />}
                    {rows.map((r, i) => (
                        <SaleRow key={r.id} rec={r} last={i === rows.length - 1} table={salesTable} isNarrow={isNarrow}
                            products={products} productNames={productNames}
                            onOpen={() => setOpenId(r.id)} />
                    ))}
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
                    defaultLocation={loc.filter(x => x !== '__none__').length === 1 ? loc.filter(x => x !== '__none__') : undefined}
                    isNarrow={isNarrow} onClose={() => setCreating(false)} />
            )}
        </div>
    );
}

function Sel({ value, onChange, all, opts, block }: { value: string; onChange: (v: string) => void; all: string; opts: { value: string; label: string }[]; block?: boolean }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, width: block ? '100%' : 'auto', flex: block ? '1 1 auto' : '0 0 auto', maxWidth: block ? 'none' : '180px' }}>
            <option value="all">{all}</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

// One sales row. Aligned columns with inline-editable Linked Product (Category is read-only —
// it resolves from the product). Location is edited in the detail drawer, not on the row.
// Edits write straight to Airtable; the InlineLink shows a loading bar while saving.
function SaleRow({
    rec, last, table, isNarrow, products, productNames, onOpen,
}: {
    rec: RecordModel; last: boolean; table: TableModel; isNarrow: boolean;
    products: RecordModel[]; productNames: Map<string, string>;
    onOpen: () => void;
}) {
    const item = str(rec, SALE.item) || '(item)';
    const variation = str(rec, SALE.itemVariation);
    const showVar = !!variation && variation !== item && !/^regular( price)?$/i.test(variation.trim());
    const deptNames = selectNames(rec, SALE.department);
    const sold = num(rec, SALE.itemsSold);
    const date = str(rec, SALE.date);

    const [openCount, setOpenCount] = useState(0);
    const [savingField, setSavingField] = useState<string | null>(null);
    const onToggle = (o: boolean) => setOpenCount(c => Math.max(0, c + (o ? 1 : -1)));
    async function update(field: string, fields: Record<string, unknown>) {
        setSavingField(field);
        try { await table.updateRecordAsync(rec, fields); } catch { /* SWR keeps the old value */ } finally { setSavingField(null); }
    }

    const fill = true; // chips fill their grid cell in both the wide and narrow (2-col) layouts
    const prodEd = <InlineLink value={linkIds(rec, SALE.linkedProduct)} names={productNames} options={products} placeholder="Product" fill={fill} saving={savingField === 'product'} onToggle={onToggle} onChange={v => update('product', { [SALE.linkedProduct]: v })} />;
    // Category is read-only (resolves from the product) — styled like a chip (no caret) so it
    // sits uniformly next to the editable fields; click the row to change it via the product.
    const catCell = (
        <div title={deptNames.join(', ')} style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, padding: '3px 8px', borderRadius: '7px', border: '1px solid var(--hairline)', background: 'var(--glass-bg)', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: deptNames.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {deptNames.length ? deptNames.join(', ') : '— category —'}
        </div>
    );
    const itemCell = <span title={item} style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item}{showVar ? ` · ${variation}` : ''}</span>;
    const amountCell = (
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: '18px', color: 'var(--text-primary)' }}>{usd(num(rec, SALE.netSales))}</span>
            {(sold || date) && <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{sold ? `${sold} sold` : ''}{sold && date ? ' · ' : ''}{date}</span>}
        </div>
    );

    const shared = {
        onClick: onOpen,
        onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'var(--glass-bg-soft)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'transparent'; },
    };

    // Wide: one aligned grid row — Item | Category | Linked Product | Amount.
    if (!isNarrow) {
        return (
            <div {...shared}
                style={{
                    display: 'grid', gridTemplateColumns: SALE_GRID,
                    alignItems: 'center', gap: '10px', padding: '8px 14px',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    position: 'relative', zIndex: openCount > 0 ? 5 : 'auto',
                    borderBottom: last ? 'none' : '1px solid var(--hairline)',
                }}>
                <div style={{ minWidth: 0 }}>{itemCell}</div>
                {catCell}{prodEd}
                {amountCell}
            </div>
        );
    }

    // Narrow: item + amount on the top line, then the fields in a uniform 2-col grid.
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
                {catCell}{prodEd}
            </div>
        </div>
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
    const [confirmDel, setConfirmDel] = useState(false);   // two-step delete guard
    const [showProductForm, setShowProductForm] = useState(false);
    type D = typeof d;
    const set = <K extends keyof D>(k: K, v: D[K]) => { setD(p => ({ ...p, [k]: v })); setSaved(false); };

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

    const dept = rec ? selectNames(rec, SALE.department) : [];
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

                <div style={row2}>
                    <Field label="Item"><input value={d.item} onChange={e => set('item', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Item variation"><input value={d.itemVariation} onChange={e => set('itemVariation', e.target.value)} style={inputStyle} /></Field>
                </div>

                <Field label="Linked product (sets category)">
                    <LinkPicker options={products} names={productNames} value={d.product} onChange={v => set('product', v)} placeholder="Search products…" />
                    <button type="button" onClick={() => setShowProductForm(true)}
                        style={{ marginTop: '7px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '12.5px', fontWeight: 700, color: 'var(--accent)' }}>
                        + New product
                    </button>
                </Field>

                {/* Location (editable) + Category (read-only — resolves from the linked product) */}
                <div style={row2}>
                    <Field label="Location">
                        <LinkPicker options={locations} names={locationNames} value={d.location} onChange={v => set('location', v)} placeholder="Search locations…" />
                    </Field>
                    <Field label="Category">
                        <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minHeight: '40px' }}>
                            {dept.length
                                ? dept.map(x => <Pill key={x} text={x} tone={deptTone(x)} />)
                                : <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>— link a product —</span>}
                        </div>
                    </Field>
                </div>

                <div style={row3}>
                    <Field label="Items sold"><input inputMode="decimal" value={d.itemsSold} onChange={e => set('itemsSold', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Net sales"><MoneyInput value={d.netSales} onChange={v => set('netSales', v)} /></Field>
                    <Field label="Price"><MoneyInput value={d.price} onChange={v => set('price', v)} /></Field>
                </div>
                <Field label="Date"><input type="date" value={d.date} onChange={e => set('date', e.target.value)} style={inputStyle} /></Field>

                {err && <div style={{ color: PALETTE.rust, fontSize: '13px', fontWeight: 600 }}>{err}</div>}

                <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px', background: 'linear-gradient(transparent, var(--glass-bg-strong) 40%)' }}>
                    {confirmDel ? (
                        // Two-step confirm: nothing is deleted until "Yes, delete" is clicked.
                        <div style={{ ...glass({ soft: true }), padding: '12px 14px', border: `1px solid var(--accent-2)`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                <WarningIcon size={17} weight="fill" color={PALETTE.rust} /> Delete this sale permanently?
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
                                {busy ? 'Saving…' : saved ? <><CheckCircleIcon size={16} weight="fill" /> Saved</> : <><FloppyDiskIcon size={16} weight="bold" /> {rec ? 'Save changes' : 'Create sale'}</>}
                            </Button>
                            <Button variant="ghost" onClick={onClose}>{rec ? 'Close' : 'Cancel'}</Button>
                            {rec && (
                                <button onClick={() => setConfirmDel(true)} disabled={busy} aria-label="Delete sale" title="Delete sale"
                                    style={{ width: '42px', height: '42px', flexShrink: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: PALETTE.rust, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <TrashIcon size={18} weight="bold" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showProductForm && (
                <ProductForm
                    initialName={d.item} initialVariation={d.itemVariation}
                    onClose={() => setShowProductForm(false)}
                    onSaved={id => { if (id) set('product', [id]); }}
                />
            )}
        </div>
    );
}

