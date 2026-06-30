'use client';

// /expenses — the expense ledger. A filterable list of every Expenses-table row with
// a glass detail drawer that edits an existing row OR creates a new one (drawer takes an
// optional `rec`; absent = create). Reads cells via lib/silk/cells, renders form controls
// from lib/components/fields. Writes go straight to Airtable via table.updateRecordAsync /
// createRecordAsync. Filters/search run client-side over useRecords(Expenses).

import React, { useEffect, useMemo, useState } from 'react';
import {
    MagnifyingGlassIcon, XIcon, ReceiptIcon, FloppyDiskIcon, CheckCircleIcon,
    PaperclipIcon, PlusIcon, PackageIcon, TrashIcon, WarningIcon,
} from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel, TableModel } from '@/lib/airtable/models';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Pill, Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { Field, PlainSelect, MultiSelectDropdown, AutoTextarea, LinkPicker, iconBtn } from '@/lib/components/fields';
import { InventoryForm } from '@/lib/components/InventoryForm';
import { TABLES, EX, INV } from '@/lib/silk/schema';
import { usd, num, str, numStr, linkIds, selectNames, fieldChoices, nameMap, weekKey, parseNum } from '@/lib/silk/cells';

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

    const expenses = useRecords(expensesTable);
    const vendors = useRecords(vendorsTable);
    const locations = useRecords(locationsTable);
    const inventory = useRecords(inventoryTable);

    const vendorNames = useMemo(() => nameMap(vendors), [vendors]);
    const locationNames = useMemo(() => nameMap(locations), [locations]);
    // Display map keyed by the "Inventory Name" field (falls back to primary).
    const inventoryDisplay = useMemo(() => {
        const m = new Map<string, string>();
        for (const r of inventory) m.set(r.id, r.getCellValueAsString(INV.name) || r.name || '(item)');
        return m;
    }, [inventory]);

    const [week, setWeek] = useState('all');
    const [vendor, setVendor] = useState('all');
    const [loc, setLoc] = useState('all');
    const [dept, setDept] = useState('all');
    const [invFilter, setInvFilter] = useState('all'); // 'all' | '__none__' | inventory record id
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
            .filter(r => week === 'all' || (week === '__none__' ? !str(r, EX.weekOf) : str(r, EX.weekOf) === week))
            .filter(r => vendor === 'all' || (vendor === '__none__' ? linkIds(r, EX.vendors).length === 0 : linkIds(r, EX.vendors).includes(vendor)))
            .filter(r => loc === 'all' || (loc === '__none__' ? linkIds(r, EX.locations).length === 0 : linkIds(r, EX.locations).includes(loc)))
            .filter(r => dept === 'all' || (dept === '__none__' ? selectNames(r, EX.category).length === 0 : selectNames(r, EX.category).includes(dept)))
            .filter(r => {
                if (invFilter === 'all') return true;
                const ids = linkIds(r, EX.inventory);
                return invFilter === '__none__' ? ids.length === 0 : ids.includes(invFilter);
            })
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
    }, [expenses, week, vendor, loc, dept, invFilter, q, vendorNames]);

    const total = useMemo(() => rows.reduce((s, r) => s + num(r, EX.total), 0), [rows]);
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

            {/* Filters: search + Week / Vendor / Location / Department */}
            <div style={{ ...glass(), padding: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
                    <MagnifyingGlassIcon size={16} weight="bold" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ ...inputStyle, paddingLeft: '34px' }} />
                </div>
                <FilterSelect value={week} onChange={setWeek} allLabel="All weeks" options={[{ value: '__none__', label: '— No week —' }, ...weeks.map(w => ({ value: w, label: w }))]} />
                <FilterSelect value={vendor} onChange={setVendor} allLabel="All vendors" options={[{ value: '__none__', label: '— No vendor —' }, ...vendorOptions.map(v => ({ value: v.id, label: v.name }))]} />
                <FilterSelect value={loc} onChange={setLoc} allLabel="All locations" options={[{ value: '__none__', label: '— No location —' }, ...locations.map(l => ({ value: l.id, label: l.name || '(loc)' }))]} />
                <FilterSelect value={dept} onChange={setDept} allLabel="All departments" options={[{ value: '__none__', label: '— No category —' }, ...deptOptions.map(d => ({ value: d, label: d }))]} />
                <FilterSelect value={invFilter} onChange={setInvFilter} allLabel="All inventory items"
                    options={[{ value: '__none__', label: '— No inventory item —' }, ...inventoryOptions.map(o => ({ value: o.id, label: o.name }))]} />
            </div>

            {/* List */}
            {rows.length === 0 ? (
                <div style={{ ...glass({ soft: true }), padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ReceiptIcon size={34} weight="duotone" />
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>No expenses match these filters.</div>
                </div>
            ) : (
                <div style={{ ...glass(), padding: '4px', display: 'flex', flexDirection: 'column' }}>
                    {rows.map((r, i) => (
                        <Row key={r.id} rec={r} last={i === rows.length - 1}
                            vendorNames={vendorNames} inventoryDisplay={inventoryDisplay}
                            onOpen={() => setOpenId(r.id)} />
                    ))}
                </div>
            )}

            {openRec && (
                <DetailDrawer
                    key={openRec.id}
                    rec={openRec} table={expensesTable}
                    vendors={vendors} locations={locations} inventory={inventory}
                    vendorNames={vendorNames} locationNames={locationNames} inventoryDisplay={inventoryDisplay}
                    isNarrow={isNarrow} onClose={() => setOpenId(null)}
                />
            )}
            {creating && (
                <DetailDrawer
                    key="new"
                    rec={null} table={expensesTable}
                    vendors={vendors} locations={locations} inventory={inventory}
                    vendorNames={vendorNames} locationNames={locationNames} inventoryDisplay={inventoryDisplay}
                    defaultLocation={loc !== 'all' ? [loc] : undefined}
                    isNarrow={isNarrow} onClose={() => setCreating(false)}
                />
            )}
        </div>
    );
}

function FilterSelect({ value, onChange, allLabel, options }: { value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string }[] }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '0 0 auto', maxWidth: '190px' }}>
            <option value="all">{allLabel}</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

function Row({
    rec, last, vendorNames, inventoryDisplay, onOpen,
}: {
    rec: RecordModel; last: boolean;
    vendorNames: Map<string, string>; inventoryDisplay: Map<string, string>; onOpen: () => void;
}) {
    const item = str(rec, EX.item) || str(rec, EX.itemFromInv) || '(no item)';
    const cats = selectNames(rec, EX.category);
    const vendor = linkIds(rec, EX.vendors).map(id => vendorNames.get(id)).filter(Boolean).join(', ');
    const invName = linkIds(rec, EX.inventory).map(id => inventoryDisplay.get(id)).filter(Boolean)[0];
    const date = str(rec, EX.date);
    const amount = num(rec, EX.total);

    return (
        <div onClick={onOpen}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-bg-soft)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 14px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                borderBottom: last ? 'none' : '1px solid var(--hairline)',
            }}>
            {/* left: item (+ linked inventory) + category */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{item}</span>
                    {invName ? (
                        <span title={`Inventory: ${invName}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: PALETTE.olive }}>
                            <PackageIcon size={12} weight="bold" /> {invName}
                        </span>
                    ) : (
                        <span title="No inventory item linked" style={{ fontSize: '15px', fontWeight: 800, color: PALETTE.gold, lineHeight: 1 }}>–</span>
                    )}
                </span>
                {cats.length > 0 ? (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {cats.map(c => <Pill key={c} text={c} tone="olive" />)}
                    </div>
                ) : (
                    <span style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--accent-2, #c0623b)' }}>assign category</span>
                )}
            </div>
            {/* right: total + vendor + date */}
            <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '92px' }}>
                <span style={{ fontFamily: DISPLAY, fontSize: '18px', color: 'var(--text-primary)' }}>{usd(amount)}</span>
                {vendor && <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor}</span>}
                {date && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{date}</span>}
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
    rec, table, vendors, locations, inventory, vendorNames, locationNames, inventoryDisplay, isNarrow, onClose, defaultLocation,
}: {
    rec?: RecordModel | null; table: TableModel;
    vendors: RecordModel[]; locations: RecordModel[]; inventory: RecordModel[];
    vendorNames: Map<string, string>; locationNames: Map<string, string>; inventoryDisplay: Map<string, string>;
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
                    <LinkPicker options={vendors} names={vendorNames} value={d.vendor} onChange={v => set('vendor', v)} placeholder="Search vendors…" />
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

