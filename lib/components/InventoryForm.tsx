'use client';

import React, { useMemo, useState } from 'react';
import { XIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { useBase, useRecords } from '@/lib/airtable/hooks';
import type { RecordModel, TableModel } from '@/lib/airtable/models';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { TABLES, INV } from '@/lib/silk/schema';

// ── small cell helpers ─────────────────────────────────────────────────────────
const sstr = (r: RecordModel, fid: string) => r.getCellValueAsString(fid) || '';
const nstr = (r: RecordModel, fid: string) => { const v = r.getCellValue(fid); return v == null || v === '' ? '' : String(v); };
function lids(r: RecordModel, fid: string): string[] {
    const v = r.getCellValue(fid);
    if (!Array.isArray(v)) return [];
    return v.map(x => (typeof x === 'string' ? x : (x as { id?: string })?.id ?? '')).filter(Boolean);
}
function selName(r: RecordModel, fid: string): string {
    const v = r.getCellValue(fid);
    if (Array.isArray(v)) return (v[0] && typeof v[0] === 'object' ? (v[0] as { name?: string }).name : String(v[0])) ?? '';
    if (v && typeof v === 'object' && 'name' in v) return (v as { name: string }).name;
    return typeof v === 'string' ? v : '';
}
function choices(table: TableModel, fid: string): string[] {
    const f = table.getFieldIfExists(fid);
    const ch = (f?.options as { choices?: { name: string }[] } | undefined)?.choices;
    return Array.isArray(ch) ? ch.map(c => c.name) : [];
}
function nameMap(records: RecordModel[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const r of records) m.set(r.id, r.name || '(untitled)');
    return m;
}
const pn = (s: string): number | null => { if (s.trim() === '') return null; const n = Number(s.replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };

/**
 * Create or edit an Inventory item. Self-contained: pulls its own tables/records.
 * Render inside an <AirtableBoundary>. Slides in from the right above other panels.
 */
export function InventoryForm({
    recordId, initialName, onClose, onSaved,
}: {
    recordId?: string;          // edit an existing item; omit to create
    initialName?: string;       // prefill name (e.g. from an expense's item)
    onClose: () => void;
    onSaved?: (id: string) => void;
}) {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const invTable = base.tables.find(t => t.id === TABLES.inventory)!;
    const vendorsTable = base.tables.find(t => t.id === TABLES.vendors)!;
    const locationsTable = base.tables.find(t => t.id === TABLES.locations)!;
    const vendors = useRecords(vendorsTable);
    const locations = useRecords(locationsTable);
    const invRecords = useRecords(invTable);
    const vendorNames = useMemo(() => nameMap(vendors), [vendors]);
    const locationNames = useMemo(() => nameMap(locations), [locations]);

    const existing = recordId ? invRecords.find(r => r.id === recordId) ?? null : null;

    const [d, setD] = useState(() => ({
        name: existing ? (sstr(existing, INV.name) || sstr(existing, INV.orderName)) : (initialName ?? ''),
        vendor: existing ? lids(existing, INV.vendor) : [] as string[],
        department: existing ? selName(existing, INV.department) : '',
        type: existing ? selName(existing, INV.type) : '',
        url: existing ? sstr(existing, INV.url) : '',
        perUnit: existing ? nstr(existing, INV.perUnit) : '',
        unit: existing ? selName(existing, INV.unit) : '',
        unitPrice: existing ? nstr(existing, INV.unitPrice) : '',
        unitWeight: existing ? nstr(existing, INV.unitWeight) : '',
        unitMeasure: existing ? selName(existing, INV.unitMeasure) : '',
        trackingLocations: existing ? lids(existing, INV.trackingLocations) : [] as string[],
        stock763: existing ? nstr(existing, INV.stock763) : '',
        base763: existing ? nstr(existing, INV.base763) : '',
        stock869: existing ? nstr(existing, INV.stock869) : '',
        base869: existing ? nstr(existing, INV.base869) : '',
    }));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    type D = typeof d;
    const set = <K extends keyof D>(k: K, v: D[K]) => { setD(p => ({ ...p, [k]: v })); };

    const dollarPerUnit = existing ? sstr(existing, INV.dollarPerUnit) : '';

    async function save() {
        if (!d.name.trim()) { setErr('Give the item a name.'); return; }
        setBusy(true); setErr('');
        const f: Record<string, unknown> = {
            [INV.orderName]: d.name.trim(),
            [INV.name]: d.name.trim(),
        };
        if (d.vendor.length) f[INV.vendor] = d.vendor;
        if (d.department) f[INV.department] = d.department;
        if (d.type) f[INV.type] = d.type;
        if (d.url) f[INV.url] = d.url;
        if (d.unit) f[INV.unit] = d.unit;
        if (d.unitMeasure) f[INV.unitMeasure] = d.unitMeasure;
        if (d.trackingLocations.length) f[INV.trackingLocations] = d.trackingLocations;
        const numFields: [keyof D, string][] = [
            ['perUnit', INV.perUnit], ['unitPrice', INV.unitPrice], ['unitWeight', INV.unitWeight],
            ['stock763', INV.stock763], ['base763', INV.base763], ['stock869', INV.stock869], ['base869', INV.base869],
        ];
        for (const [k, fid] of numFields) { const v = pn(d[k] as string); if (v != null) f[fid] = v; }
        try {
            let id = recordId ?? '';
            if (existing) await invTable.updateRecordAsync(existing, f);
            else id = await invTable.createRecordAsync(f);
            onSaved?.(id);
            onClose();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Save failed.');
            setBusy(false);
        }
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, top: 'var(--nav-h)', zIndex: 1100, background: 'rgba(20,28,32,0.4)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: isNarrow ? '100%' : 'min(540px, 94vw)', height: '100%', overflowY: 'auto',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                borderLeft: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-hover)',
                padding: isNarrow ? '18px' : '24px', display: 'flex', flexDirection: 'column', gap: '14px',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                        <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{existing ? 'Edit inventory item' : 'New inventory item'}</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '24px', color: 'var(--text-primary)', marginTop: '2px' }}>{d.name || 'Untitled item'}</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={iconBtn}><XIcon size={18} weight="bold" /></button>
                </div>

                <Field label="Item name *"><input value={d.name} onChange={e => set('name', e.target.value)} autoFocus style={inputStyle} placeholder="e.g. Oat Milk — Half Gallon" /></Field>

                <Field label="Vendor"><LinkPicker options={vendors} names={vendorNames} value={d.vendor} onChange={v => set('vendor', v)} placeholder="Search vendors…" /></Field>

                <div style={row2}>
                    <Field label="Department"><Select options={choices(invTable, INV.department)} value={d.department} onChange={v => set('department', v)} /></Field>
                    <Field label="Type"><Select options={choices(invTable, INV.type)} value={d.type} onChange={v => set('type', v)} /></Field>
                </div>

                <Field label="Link (URL)"><input value={d.url} onChange={e => set('url', e.target.value)} style={inputStyle} placeholder="https://…" /></Field>

                <div style={row2}>
                    <Field label="#/Unit"><input inputMode="decimal" value={d.perUnit} onChange={e => set('perUnit', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Unit"><Select options={choices(invTable, INV.unit)} value={d.unit} onChange={v => set('unit', v)} /></Field>
                </div>
                <div style={row3}>
                    <Field label="Unit price"><MoneyInput value={d.unitPrice} onChange={v => set('unitPrice', v)} /></Field>
                    <Field label="Unit weight"><input inputMode="decimal" value={d.unitWeight} onChange={e => set('unitWeight', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Unit measure"><Select options={choices(invTable, INV.unitMeasure)} value={d.unitMeasure} onChange={v => set('unitMeasure', v)} /></Field>
                </div>

                {existing && dollarPerUnit && (
                    <div style={{ ...glass({ soft: true }), padding: '8px 12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        <span style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>$ #/unit </span>
                        <strong style={{ color: 'var(--text-primary)' }}>{dollarPerUnit}</strong> <span style={{ fontSize: '11px' }}>(calculated)</span>
                    </div>
                )}

                <Field label="Tracking locations"><MultiLinkPicker options={locations} names={locationNames} value={d.trackingLocations} onChange={v => set('trackingLocations', v)} placeholder="Add locations…" /></Field>

                <div style={row2}>
                    <Field label="763 Stock"><input inputMode="decimal" value={d.stock763} onChange={e => set('stock763', e.target.value)} style={inputStyle} /></Field>
                    <Field label="763 Base"><input inputMode="decimal" value={d.base763} onChange={e => set('base763', e.target.value)} style={inputStyle} /></Field>
                    <Field label="869 Stock"><input inputMode="decimal" value={d.stock869} onChange={e => set('stock869', e.target.value)} style={inputStyle} /></Field>
                    <Field label="869 Base"><input inputMode="decimal" value={d.base869} onChange={e => set('base869', e.target.value)} style={inputStyle} /></Field>
                </div>

                {err && <div style={{ color: PALETTE.rust, fontSize: '13px', fontWeight: 600 }}>{err}</div>}

                <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px', display: 'flex', gap: '10px', background: 'linear-gradient(transparent, var(--glass-bg-strong) 40%)' }}>
                    <Button onClick={save} disabled={busy} style={{ flex: 1 }}>
                        {busy ? 'Saving…' : <><FloppyDiskIcon size={16} weight="bold" /> {existing ? 'Save item' : 'Create item'}</>}
                    </Button>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                </div>
            </div>
        </div>
    );
}

// ── shared field UI (local to keep this component drop-in) ──────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'block' }}>
            <div style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
            {children}
        </label>
    );
}
function Select({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );
}
function LinkPicker({ options, names, value, onChange, placeholder }: { options: RecordModel[]; names: Map<string, string>; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
    const [q, setQ] = useState(''); const [open, setOpen] = useState(false);
    const current = value[0];
    const matches = useMemo(() => { const n = q.trim().toLowerCase(); return options.filter(o => (n ? (names.get(o.id) ?? '').toLowerCase().includes(n) : true)).slice(0, 40); }, [q, options, names]);
    if (current && !open) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...inputStyle, padding: '8px 10px' }}>
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>{names.get(current) ?? current}</span>
                <button onMouseDown={() => onChange([])} style={iconBtnSm} aria-label="Remove"><XIcon size={13} weight="bold" /></button>
            </div>
        );
    }
    return (
        <div style={{ position: 'relative' }}>
            <input value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={e => setQ(e.target.value)} style={inputStyle} />
            {open && matches.length > 0 && (
                <div style={dropdown}>{matches.map(o => <div key={o.id} onMouseDown={() => { onChange([o.id]); setOpen(false); setQ(''); }} style={dropItem}>{names.get(o.id) ?? '(untitled)'}</div>)}</div>
            )}
        </div>
    );
}
function MultiLinkPicker({ options, names, value, onChange, placeholder }: { options: RecordModel[]; names: Map<string, string>; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
    const [q, setQ] = useState(''); const [open, setOpen] = useState(false);
    const matches = useMemo(() => { const n = q.trim().toLowerCase(); return options.filter(o => !value.includes(o.id) && (n ? (names.get(o.id) ?? '').toLowerCase().includes(n) : true)).slice(0, 40); }, [q, options, names, value]);
    return (
        <div style={{ position: 'relative' }}>
            <div style={{ ...inputStyle, display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', minHeight: '40px' }}>
                {value.map(id => (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 4px 2px 9px', borderRadius: '999px', background: 'rgba(113,122,73,0.18)', color: '#5c6539', fontSize: '12px', fontWeight: 700 }}>
                        {names.get(id) ?? id}
                        <button onMouseDown={() => onChange(value.filter(x => x !== id))} style={{ ...iconBtnSm, width: '18px', height: '18px' }} aria-label="Remove"><XIcon size={11} weight="bold" /></button>
                    </span>
                ))}
                <input value={q} placeholder={value.length ? '' : placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={e => { setQ(e.target.value); setOpen(true); }} style={{ flex: 1, minWidth: '80px', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)' }} />
            </div>
            {open && matches.length > 0 && (
                <div style={dropdown}>{matches.map(o => <div key={o.id} onMouseDown={() => { onChange([...value, o.id]); setQ(''); }} style={dropItem}>{names.get(o.id) ?? '(untitled)'}</div>)}</div>
            )}
        </div>
    );
}

const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };
const row3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' };
const iconBtn: React.CSSProperties = { width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const iconBtnSm: React.CSSProperties = { width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: 'rgba(50,70,79,0.10)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const dropdown: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, maxHeight: '240px', overflowY: 'auto', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg-strong)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow)' };
const dropItem: React.CSSProperties = { padding: '9px 12px', fontSize: '13.5px', color: 'var(--text-primary)', cursor: 'pointer', borderBottom: '1px solid var(--hairline)' };
