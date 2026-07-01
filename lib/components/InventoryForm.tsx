'use client';

import React, { useMemo, useState } from 'react';
import { XIcon, FloppyDiskIcon, TrendUpIcon, CaretRightIcon, PackageIcon } from '@phosphor-icons/react';
import { useBase, useRecords } from '@/lib/airtable/hooks';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { Field, PlainSelect, LinkPicker, MultiLinkPicker, iconBtn } from '@/lib/components/fields';
import { PurchaseHistoryBody } from '@/lib/components/PurchaseHistory';
import { TABLES, INV } from '@/lib/silk/schema';
import { str, numStr, linkIds, selectName, fieldChoices, nameMap, parseNum } from '@/lib/silk/cells';

/**
 * Create or edit an Inventory item. Self-contained: pulls its own tables/records.
 * Render inside an <AirtableBoundary>. Slides in from the right above other panels.
 * For existing items the detail is organized into two collapsible sections — Purchase history
 * (on top) and Inventory details (below). `onFlagChange` lets the list re-sync dismissed flags.
 */
export function InventoryForm({
    recordId, initialName, onClose, onSaved, onFlagChange,
}: {
    recordId?: string;          // edit an existing item; omit to create
    initialName?: string;       // prefill name (e.g. from an expense's item)
    onClose: () => void;
    onSaved?: (id: string) => void;
    onFlagChange?: () => void;  // called when a price flag is dismissed/restored in the history section
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
        name: existing ? (str(existing, INV.name) || str(existing, INV.orderName)) : (initialName ?? ''),
        vendor: existing ? linkIds(existing, INV.vendor) : [] as string[],
        department: existing ? selectName(existing, INV.department) : '',
        type: existing ? selectName(existing, INV.type) : '',
        url: existing ? str(existing, INV.url) : '',
        perUnit: existing ? numStr(existing, INV.perUnit) : '',
        unit: existing ? selectName(existing, INV.unit) : '',
        unitPrice: existing ? numStr(existing, INV.unitPrice) : '',
        unitWeight: existing ? numStr(existing, INV.unitWeight) : '',
        unitMeasure: existing ? selectName(existing, INV.unitMeasure) : '',
        trackingLocations: existing ? linkIds(existing, INV.trackingLocations) : [] as string[],
        stock763: existing ? numStr(existing, INV.stock763) : '',
        base763: existing ? numStr(existing, INV.base763) : '',
        stock869: existing ? numStr(existing, INV.stock869) : '',
        base869: existing ? numStr(existing, INV.base869) : '',
    }));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    type D = typeof d;
    const set = <K extends keyof D>(k: K, v: D[K]) => { setD(p => ({ ...p, [k]: v })); };

    const dollarPerUnit = existing ? str(existing, INV.dollarPerUnit) : '';

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
        for (const [k, fid] of numFields) { const v = parseNum(d[k] as string); if (v != null) f[fid] = v; }
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
      <>
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

                <Field label="Item name *"><input value={d.name} onChange={e => set('name', e.target.value)} autoFocus={!existing} style={inputStyle} placeholder="e.g. Oat Milk — Half Gallon" /></Field>

                {/* Purchase history — collapsible section (existing items only), on top */}
                {existing && recordId && (
                    <Collapsible title="Purchase history" subtitle="Price trend, jump flags & editable purchases"
                        icon={<TrendUpIcon size={17} weight="bold" />} defaultOpen>
                        <PurchaseHistoryBody recordId={recordId} onFlagChange={onFlagChange} />
                    </Collapsible>
                )}

                {/* Inventory details — collapsible section, below (open by default for new items) */}
                <Collapsible title="Inventory details" subtitle="Vendor, pricing, units & stock levels"
                    icon={<PackageIcon size={17} weight="bold" />} defaultOpen={!existing}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <Field label="Vendor"><LinkPicker options={vendors} names={vendorNames} value={d.vendor} onChange={v => set('vendor', v)} placeholder="Search vendors…" /></Field>

                        <div style={row2}>
                            <Field label="Department"><PlainSelect options={fieldChoices(invTable, INV.department)} value={d.department} onChange={v => set('department', v)} /></Field>
                            <Field label="Type"><PlainSelect options={fieldChoices(invTable, INV.type)} value={d.type} onChange={v => set('type', v)} /></Field>
                        </div>

                        <Field label="Link (URL)"><input value={d.url} onChange={e => set('url', e.target.value)} style={inputStyle} placeholder="https://…" /></Field>

                        <div style={row2}>
                            <Field label="#/Unit"><input inputMode="decimal" value={d.perUnit} onChange={e => set('perUnit', e.target.value)} style={inputStyle} /></Field>
                            <Field label="Unit"><PlainSelect options={fieldChoices(invTable, INV.unit)} value={d.unit} onChange={v => set('unit', v)} /></Field>
                        </div>
                        <div style={row3}>
                            <Field label="Unit price"><MoneyInput value={d.unitPrice} onChange={v => set('unitPrice', v)} /></Field>
                            <Field label="Unit weight"><input inputMode="decimal" value={d.unitWeight} onChange={e => set('unitWeight', e.target.value)} style={inputStyle} /></Field>
                            <Field label="Unit measure"><PlainSelect options={fieldChoices(invTable, INV.unitMeasure)} value={d.unitMeasure} onChange={v => set('unitMeasure', v)} /></Field>
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
                    </div>
                </Collapsible>

                {err && <div style={{ color: PALETTE.rust, fontSize: '13px', fontWeight: 600 }}>{err}</div>}

                <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px', display: 'flex', gap: '10px', background: 'linear-gradient(transparent, var(--glass-bg-strong) 40%)' }}>
                    <Button onClick={save} disabled={busy} style={{ flex: 1 }}>
                        {busy ? 'Saving…' : <><FloppyDiskIcon size={16} weight="bold" /> {existing ? 'Save item' : 'Create item'}</>}
                    </Button>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                </div>
            </div>
        </div>
      </>
    );
}

// Collapsible section wrapper used to organize the detail drawer (Purchase history / Inventory details).
function Collapsible({ title, subtitle, icon, defaultOpen, children }: {
    title: string; subtitle?: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(!!defaultOpen);
    return (
        <div style={{ ...glass({ soft: true }), border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>
            <button type="button" onClick={() => setOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: '30px', height: '30px', borderRadius: '9px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}>{icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
                    {subtitle && <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)' }}>{subtitle}</span>}
                </span>
                <CaretRightIcon size={16} weight="bold" color="var(--text-muted)" style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            {open && <div style={{ padding: '2px 14px 14px' }}>{children}</div>}
        </div>
    );
}


// Grid layouts used by the form rows (kept local; trivial).
const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };
const row3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' };
