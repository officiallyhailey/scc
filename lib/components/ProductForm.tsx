'use client';

import React, { useMemo, useState } from 'react';
import { XIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { useBase, useRecords } from '@/lib/airtable/hooks';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { Field, PlainSelect, MultiLinkPicker, iconBtn } from '@/lib/components/fields';
import { TABLES, PRODUCT, SALES_CATEGORY } from '@/lib/silk/schema';
import { selectName, nameMap, parseNum } from '@/lib/silk/cells';

/**
 * Create a new Product, then hand its id back via onSaved so the caller can link it.
 * Used from the Sales drawer when the right product doesn't exist yet. Self-contained:
 * pulls its own tables/records. Render inside an <AirtableBoundary>; slides in from the
 * right above the Sales drawer (higher z-index).
 *
 * "Sales Category" is a link to the Sales-Categories table, where many records share a
 * Type (Bar/Kitchen/…). We show the distinct Types and link to one representative record
 * per Type — the Department/Category lookups only read the Type, so any record of that
 * Type categorizes the sale correctly.
 */
export function ProductForm({
    initialName, initialVariation, onClose, onSaved,
}: {
    initialName?: string; initialVariation?: string;
    onClose: () => void; onSaved?: (id: string) => void;
}) {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const productsTable = base.tables.find(t => t.id === TABLES.products)!;
    const catTable = base.tables.find(t => t.id === TABLES.salesCategories)!;
    const locationsTable = base.tables.find(t => t.id === TABLES.locations)!;
    const cats = useRecords(catTable);
    const locations = useRecords(locationsTable);
    const locationNames = useMemo(() => nameMap(locations), [locations]);

    // distinct category Type → representative record id (first record of that Type).
    const { catOptions, repByType } = useMemo(() => {
        const rep = new Map<string, string>();
        for (const r of cats) { const t = selectName(r, SALES_CATEGORY.type); if (t && !rep.has(t)) rep.set(t, r.id); }
        return { catOptions: [...rep.keys()].sort(), repByType: rep };
    }, [cats]);

    const [d, setD] = useState(() => ({
        name: initialName ?? '', variation: initialVariation ?? '',
        price: '', category: '', locations: [] as string[],
    }));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    type D = typeof d;
    const set = <K extends keyof D>(k: K, v: D[K]) => setD(p => ({ ...p, [k]: v }));

    async function save() {
        if (!d.name.trim()) { setErr('Give the product a name.'); return; }
        setBusy(true); setErr('');
        const f: Record<string, unknown> = { [PRODUCT.name]: d.name.trim() };
        if (d.variation.trim()) f[PRODUCT.variation] = d.variation.trim();
        const price = parseNum(d.price); if (price != null) f[PRODUCT.price] = price;
        const repId = d.category ? repByType.get(d.category) : undefined;
        if (repId) f[PRODUCT.salesCategory] = [repId];
        if (d.locations.length) f[PRODUCT.locations] = d.locations;
        try {
            const id = await productsTable.createRecordAsync(f);
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
                width: isNarrow ? '100%' : 'min(500px, 94vw)', height: '100%', overflowY: 'auto',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                borderLeft: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-hover)',
                padding: isNarrow ? '18px' : '24px', display: 'flex', flexDirection: 'column', gap: '14px',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                        <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>New product</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '24px', color: 'var(--text-primary)', marginTop: '2px' }}>{d.name || 'Untitled product'}</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={iconBtn}><XIcon size={18} weight="bold" /></button>
                </div>

                <Field label="Name *"><input value={d.name} onChange={e => set('name', e.target.value)} autoFocus style={inputStyle} placeholder="e.g. Cappuccino" /></Field>
                <div style={row2}>
                    <Field label="Variation"><input value={d.variation} onChange={e => set('variation', e.target.value)} style={inputStyle} placeholder="e.g. Large" /></Field>
                    <Field label="Price"><MoneyInput value={d.price} onChange={v => set('price', v)} /></Field>
                </div>
                <Field label="Sales category (sets department)">
                    <PlainSelect options={catOptions} value={d.category} onChange={v => set('category', v)} />
                </Field>
                <Field label="Locations">
                    <MultiLinkPicker options={locations} names={locationNames} value={d.locations} onChange={v => set('locations', v)} placeholder="Add locations…" />
                </Field>

                {err && <div style={{ color: PALETTE.rust, fontSize: '13px', fontWeight: 600 }}>{err}</div>}

                <div style={{ position: 'sticky', bottom: 0, paddingTop: '8px', display: 'flex', gap: '10px', background: 'linear-gradient(transparent, var(--glass-bg-strong) 40%)' }}>
                    <Button onClick={save} disabled={busy} style={{ flex: 1 }}>
                        {busy ? 'Saving…' : <><FloppyDiskIcon size={16} weight="bold" /> Create product</>}
                    </Button>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                </div>
            </div>
        </div>
    );
}

const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };
