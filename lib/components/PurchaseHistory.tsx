'use client';

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon, TrendUpIcon, TrendDownIcon, WarningIcon, ReceiptIcon, PencilSimpleIcon, FloppyDiskIcon, PackageIcon, LinkIcon } from '@phosphor-icons/react';
import { useBase, useRecords } from '@/lib/airtable/hooks';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, Button, DISPLAY, MONO, inputStyle, MoneyInput, PALETTE } from '@/lib/components/ui';
import { Field, LinkPicker, PlainSelect, iconBtn } from '@/lib/components/fields';
import { TABLES, INV, EX } from '@/lib/silk/schema';
import { usd, num, str, numStr, linkIds, nameMap, parseNum, selectName, fieldChoices } from '@/lib/silk/cells';
import { buildPriceHistory, PRICE_FLAG_PCT, type PriceHistory } from '@/lib/silk/history';
import { flagKey, loadDismissed, saveDismissed } from '@/lib/silk/flagDismiss';

const fmtPct = (r: number) => `${r >= 0 ? '+' : ''}${Math.round(r * 100)}%`;

/**
 * Inline purchase-history report for one inventory item — rendered as a collapsible section
 * inside <InventoryForm> (no longer a separate slide-over). Self-contained: loads its own tables.
 * Shows summary stats, a price-jump flag (dismissable), a unit-price sparkline, and a
 * chronological table whose rows are clickable to edit that purchase's details.
 * A purchase's price is compared straight to the item's listed Unit Price (see history.ts).
 *
 * `onFlagChange` lets the parent list re-read the dismissed-flags store so its badges stay in sync.
 */
export function PurchaseHistoryBody({ recordId, onFlagChange }: { recordId: string; onFlagChange?: () => void }) {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const invTable = base.tables.find(t => t.id === TABLES.inventory)!;
    const expensesTable = base.tables.find(t => t.id === TABLES.expenses)!;
    const vendorsTable = base.tables.find(t => t.id === TABLES.vendors)!;
    const inv = useRecords(invTable);
    const expenses = useRecords(expensesTable);
    const vendors = useRecords(vendorsTable);
    const vendorNames = useMemo(() => nameMap(vendors), [vendors]);

    const item = inv.find(r => r.id === recordId);
    const name = item ? (str(item, INV.name) || item.name || '(item)') : '(item)';
    const baseline = item ? num(item, INV.unitPrice) : 0;
    const h: PriceHistory = useMemo(
        () => buildPriceHistory(expenses, recordId, baseline, vendorNames),
        [expenses, recordId, baseline, vendorNames],
    );
    const newestFirst = useMemo(() => [...h.purchases].reverse(), [h.purchases]);
    const spark = useMemo(() => buildSparkline(h), [h]);

    // Dismissed-flag state (localStorage), keyed by item + the flagging purchase's date.
    const [dismissTick, setDismissTick] = useState(0);
    const latestKey = h.latest ? flagKey(recordId, h.latest.date) : '';
    const dismissed = useMemo(() => (latestKey ? loadDismissed().has(latestKey) : false), [latestKey, dismissTick]);
    function toggleDismiss() {
        if (!latestKey) return;
        const s = loadDismissed();
        if (s.has(latestKey)) s.delete(latestKey); else s.add(latestKey);
        saveDismissed(s);
        setDismissTick(t => t + 1);
        onFlagChange?.();
    }

    const [editId, setEditId] = useState<string | null>(null);
    const showFlag = h.latestFlagged && !dismissed;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <Stat label="Listed unit price" value={baseline > 0 ? usd(baseline) : '—'} />
                <Stat label="Latest paid" value={h.latest ? usd(h.latest.unitPrice) : '—'}
                    sub={h.latestDelta != null ? fmtPct(h.latestDelta) + ' vs listed' : undefined}
                    tone={showFlag ? 'flag' : h.latestDelta != null && h.latestDelta < 0 ? 'good' : 'muted'} />
                <Stat label="Avg paid" value={h.avg != null ? usd(h.avg) : '—'} />
                <Stat label="Range paid" value={h.min != null && h.max != null ? `${usd(h.min)} – ${usd(h.max)}` : '—'} />
            </div>

            {/* flag callout — dismissable */}
            {showFlag && (
                <div style={{ ...glass({ soft: true }), padding: '11px 13px', border: `1px solid var(--accent-2)`, display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <WarningIcon size={18} weight="fill" color={PALETTE.rust} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        Latest purchase is <strong style={{ color: PALETTE.rust }}>{fmtPct(h.latestDelta!)}</strong> above the listed unit price — review the vendor.
                    </span>
                    <button type="button" onClick={toggleDismiss} title="Dismiss this flag"
                        style={{ flexShrink: 0, border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-muted)', borderRadius: '7px', padding: '4px 9px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>
                        Dismiss
                    </button>
                </div>
            )}
            {h.latestFlagged && dismissed && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Flag dismissed for this purchase.</span>
                    <button type="button" onClick={toggleDismiss} style={{ border: 'none', background: 'transparent', color: 'var(--accent-deep)', fontWeight: 700, cursor: 'pointer', fontSize: '12px', padding: 0 }}>Restore</button>
                </div>
            )}

            {/* sparkline */}
            {spark ? (
                <div>
                    <div style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TrendUpIcon size={13} weight="bold" /> Unit price over time
                    </div>
                    <div style={{ position: 'relative', height: '72px', ...glass({ soft: true }), padding: '8px 0', overflow: 'visible' }}>
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}>
                            <path d={spark.area} fill="var(--accent-soft)" />
                            <path d={spark.line} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                            {baseline > 0 && <line x1={0} x2={100} y1={spark.baselineY} y2={spark.baselineY} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.65} />}
                        </svg>
                        {spark.points.map((p, i) => (
                            <span key={i} title={usd(p.value)} style={{ position: 'absolute', left: `${p.xPct}%`, top: `${8 + (p.yPct / 100) * (72 - 16)}px`, width: p.flagged ? '9px' : '6px', height: p.flagged ? '9px' : '6px', borderRadius: '50%', background: p.flagged ? PALETTE.rust : 'var(--accent-deep)', transform: 'translate(-50%, -50%)', border: '1.5px solid var(--glass-bg-strong)' }} />
                        ))}
                        {baseline > 0 && <span style={{ position: 'absolute', right: '6px', top: `${8 + (spark.baselineY / 100) * (72 - 16) - 8}px`, fontSize: '9px', fontFamily: MONO, color: 'var(--text-muted)' }}>listed</span>}
                    </div>
                </div>
            ) : null}

            {/* table — rows clickable to edit */}
            {newestFirst.length === 0 ? (
                <div style={{ ...glass({ soft: true }), padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ReceiptIcon size={30} weight="duotone" />
                    <div style={{ marginTop: '8px', fontSize: '13.5px' }}>No linked purchases yet for this item.</div>
                </div>
            ) : (
                <div style={{ ...glass({ soft: true }), padding: '2px', overflowX: 'auto' }}>
                    <div style={{ minWidth: '340px' }}>
                        <div style={{ ...rowGrid, padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>
                            {['Date', 'Vendor', 'Qty', 'Unit price', 'Total', ''].map((c, i) => (
                                <span key={i} style={{ ...colHead, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{c}</span>
                            ))}
                        </div>
                        {newestFirst.map((p, i) => (
                            <div key={p.id} onClick={() => setEditId(p.id)} title="Click to edit this purchase"
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-bg-soft)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = p.flagged ? 'rgba(181,138,58,0.07)' : 'transparent'; }}
                                style={{ ...rowGrid, padding: '9px 12px', borderBottom: i === newestFirst.length - 1 ? 'none' : '1px solid var(--hairline)', alignItems: 'center', cursor: 'pointer', background: p.flagged ? 'rgba(181,138,58,0.07)' : 'transparent' }}>
                                <span style={{ fontSize: '12.5px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{p.date || '—'}</span>
                                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.vendorName}>{p.vendorName || '—'}</span>
                                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.qty || '—'}</span>
                                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: p.flagged ? PALETTE.rust : 'var(--text-primary)' }}>{p.unitPrice > 0 ? usd(p.unitPrice) : '—'}</span>
                                    {p.flagged && p.deltaVsBase != null && (
                                        <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: PALETTE.rust }}>↑ {fmtPct(p.deltaVsBase)}</span>
                                    )}
                                </span>
                                <span style={{ fontSize: '12.5px', color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{p.total ? usd(p.total) : '—'}</span>
                                <span style={{ textAlign: 'right', color: 'var(--text-muted)' }}><PencilSimpleIcon size={13} weight="bold" /></span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Flagged = price ≥ {Math.round(PRICE_FLAG_PCT * 100)}% above the item&apos;s listed Unit Price (falls back to the line total when no unit price was recorded). Click any purchase to edit it.
            </div>

            {editId && <PurchaseEditor expenseId={editId} invRecordId={recordId} itemName={name} onClose={() => setEditId(null)} />}
        </div>
    );
}

/**
 * Compact editor for a single linked purchase (expense) — opens as a centered modal
 * above the inventory drawer. Alongside the purchase's own fields it exposes the key
 * fields of the linked inventory item (the item whose history is being reviewed), so
 * the user can correct the listed unit price, pack size and stock counts in the same
 * pass. Both records are saved together.
 */
function PurchaseEditor({ expenseId, invRecordId, itemName, onClose }: { expenseId: string; invRecordId: string; itemName: string; onClose: () => void }) {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const expensesTable = base.tables.find(t => t.id === TABLES.expenses)!;
    const vendorsTable = base.tables.find(t => t.id === TABLES.vendors)!;
    const invTable = base.tables.find(t => t.id === TABLES.inventory)!;
    const expenses = useRecords(expensesTable);
    const vendors = useRecords(vendorsTable);
    const invRecords = useRecords(invTable);
    const vendorNames = useMemo(() => nameMap(vendors), [vendors]);
    const invNames = useMemo(() => nameMap(invRecords), [invRecords]);
    const rec = expenses.find(e => e.id === expenseId) ?? null;
    const invRec = invRecords.find(r => r.id === invRecordId) ?? null;

    const [d, setD] = useState(() => ({
        // purchase (expense) fields
        date: rec ? str(rec, EX.date) : '',
        vendor: rec ? linkIds(rec, EX.vendors) : [] as string[],
        expenseInv: rec ? linkIds(rec, EX.inventory) : [] as string[], // this expense's own Inventory link
        qty: rec ? numStr(rec, EX.unitQty) : '',
        unitPrice: rec ? numStr(rec, EX.unitPrice) : '',
        total: rec ? numStr(rec, EX.total) : '',
        // linked inventory-item fields
        invUnitPrice: invRec ? numStr(invRec, INV.unitPrice) : '',
        invPerUnit: invRec ? numStr(invRec, INV.perUnit) : '',
        invUnit: invRec ? selectName(invRec, INV.unit) : '',
        invStock763: invRec ? numStr(invRec, INV.stock763) : '',
        invBase763: invRec ? numStr(invRec, INV.base763) : '',
        invStock869: invRec ? numStr(invRec, INV.stock869) : '',
        invBase869: invRec ? numStr(invRec, INV.base869) : '',
    }));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    type D = typeof d;
    const set = <K extends keyof D>(k: K, v: D[K]) => setD(p => ({ ...p, [k]: v }));

    async function save() {
        if (!rec) return;
        setBusy(true); setErr('');
        try {
            await expensesTable.updateRecordAsync(rec, {
                [EX.date]: d.date || null,
                [EX.vendors]: d.vendor,
                [EX.inventory]: d.expenseInv,
                [EX.unitQty]: parseNum(d.qty),
                [EX.unitPrice]: parseNum(d.unitPrice),
                [EX.total]: parseNum(d.total),
            });
            if (invRec) {
                // Only write fields that carry a value so blanks don't clobber existing data
                // (mirrors InventoryForm's save). The Unit select clears only when explicitly emptied.
                const f: Record<string, unknown> = { [INV.unit]: d.invUnit || null };
                const numFields: [keyof D, string][] = [
                    ['invUnitPrice', INV.unitPrice], ['invPerUnit', INV.perUnit],
                    ['invStock763', INV.stock763], ['invBase763', INV.base763],
                    ['invStock869', INV.stock869], ['invBase869', INV.base869],
                ];
                for (const [k, fid] of numFields) { const v = parseNum(d[k] as string); if (v != null) f[fid] = v; }
                await invTable.updateRecordAsync(invRec, f);
            }
            onClose();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Save failed.');
            setBusy(false);
        }
    }

    // Portal to <body> so the overlay escapes the inventory drawer's backdrop-filter
    // containing block — otherwise `position: fixed` is trapped inside the drawer and the
    // modal clips/overlaps the form's other sections instead of floating above everything.
    if (typeof document === 'undefined') return null;
    return createPortal(
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, top: 'var(--nav-h)', zIndex: 1400, background: 'rgba(20,28,32,0.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isNarrow ? '14px' : '32px' }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: isNarrow ? '100%' : 'min(460px, 96vw)', maxHeight: '100%', overflow: 'hidden',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-hover)',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* header — fixed */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: isNarrow ? '18px 18px 12px' : '22px 24px 14px', borderBottom: '1px solid var(--hairline)' }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Edit purchase</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '22px', color: 'var(--text-primary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemName}</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={iconBtn}><XIcon size={18} weight="bold" /></button>
                </div>

                {!rec ? (
                    <div style={{ padding: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>Loading purchase…</div>
                ) : (
                    <>
                        {/* body — the only scroll region */}
                        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: isNarrow ? '14px 18px' : '16px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <Field label="Date"><input type="date" value={d.date} onChange={e => set('date', e.target.value)} style={inputStyle} /></Field>
                            <Field label="Vendor"><LinkPicker options={vendors} names={vendorNames} value={d.vendor} onChange={v => set('vendor', v)} placeholder="Search vendors…" /></Field>

                            {/* This expense's own Inventory link — re-point it if the purchase was matched to the wrong item */}
                            <div>
                                <Field label="Linked inventory item">
                                    <LinkPicker options={invRecords} names={invNames} value={d.expenseInv} onChange={v => set('expenseInv', v)} placeholder="Search inventory items…" />
                                </Field>
                                <div style={{ marginTop: '5px', fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <LinkIcon size={12} weight="bold" /> Which item this purchase counts toward — change it if it was linked incorrectly.
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <Field label="Qty"><input inputMode="decimal" value={d.qty} onChange={e => set('qty', e.target.value)} style={inputStyle} /></Field>
                                <Field label="Unit price"><MoneyInput value={d.unitPrice} onChange={v => set('unitPrice', v)} /></Field>
                                <Field label="Total"><MoneyInput value={d.total} onChange={v => set('total', v)} /></Field>
                            </div>

                            {/* The linked item's own pricing & stock — editable in the same pass */}
                            {invRec && (
                                <div style={{ ...glass({ soft: true }), border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', padding: '13px 14px 15px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                        <span style={{ width: '28px', height: '28px', borderRadius: '9px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}><PackageIcon size={16} weight="bold" /></span>
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Item pricing &amp; stock</span>
                                            <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)' }}>Listed price &amp; stock for “{itemName}”</span>
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                        <Field label="Unit price"><MoneyInput value={d.invUnitPrice} onChange={v => set('invUnitPrice', v)} /></Field>
                                        <Field label="#/Unit"><input inputMode="decimal" value={d.invPerUnit} onChange={e => set('invPerUnit', e.target.value)} style={inputStyle} /></Field>
                                        <Field label="Unit"><PlainSelect options={fieldChoices(invTable, INV.unit)} value={d.invUnit} onChange={v => set('invUnit', v)} /></Field>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                                        <Field label="763 Stock"><input inputMode="decimal" value={d.invStock763} onChange={e => set('invStock763', e.target.value)} style={inputStyle} /></Field>
                                        <Field label="763 Base"><input inputMode="decimal" value={d.invBase763} onChange={e => set('invBase763', e.target.value)} style={inputStyle} /></Field>
                                        <Field label="869 Stock"><input inputMode="decimal" value={d.invStock869} onChange={e => set('invStock869', e.target.value)} style={inputStyle} /></Field>
                                        <Field label="869 Base"><input inputMode="decimal" value={d.invBase869} onChange={e => set('invBase869', e.target.value)} style={inputStyle} /></Field>
                                    </div>
                                </div>
                            )}

                            {err && <div style={{ color: PALETTE.rust, fontSize: '13px', fontWeight: 600 }}>{err}</div>}
                        </div>

                        {/* footer — pinned, always reachable */}
                        <div style={{ flexShrink: 0, display: 'flex', gap: '10px', padding: isNarrow ? '12px 18px 18px' : '14px 24px 20px', borderTop: '1px solid var(--hairline)' }}>
                            <Button onClick={save} disabled={busy} style={{ flex: 1 }}>
                                {busy ? 'Saving…' : <><FloppyDiskIcon size={16} weight="bold" /> Save changes</>}
                            </Button>
                            <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'flag' | 'good' | 'muted' }) {
    const subColor = tone === 'flag' ? PALETTE.rust : tone === 'good' ? 'var(--accent-deep)' : 'var(--text-muted)';
    return (
        <div style={{ ...glass({ soft: true }), padding: '9px 12px' }}>
            <div style={{ fontFamily: MONO, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: '19px', color: 'var(--text-primary)', marginTop: '1px' }}>{value}</div>
            {sub && (
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: subColor, display: 'flex', alignItems: 'center', gap: '3px' }}>
                    {tone === 'flag' && <TrendUpIcon size={11} weight="bold" />}
                    {tone === 'good' && <TrendDownIcon size={11} weight="bold" />}
                    {sub}
                </div>
            )}
        </div>
    );
}

// Build sparkline geometry in a 0..100 box (x = evenly spaced priced points, y = price).
function buildSparkline(h: PriceHistory): { line: string; area: string; baselineY: number; points: { xPct: number; yPct: number; value: number; flagged: boolean }[] } | null {
    const priced = h.purchases.filter(p => p.unitPrice > 0);
    if (priced.length < 1) return null;
    const vals = priced.map(p => p.unitPrice);
    let lo = Math.min(...vals, h.baseline > 0 ? h.baseline : Infinity);
    let hi = Math.max(...vals, h.baseline > 0 ? h.baseline : -Infinity);
    if (!isFinite(lo)) lo = Math.min(...vals);
    if (!isFinite(hi)) hi = Math.max(...vals);
    const range = hi - lo || hi || 1;
    lo -= range * 0.12; hi += range * 0.12;
    const span = hi - lo || 1;
    // inset 3% each side so endpoint dots aren't clipped at the edges
    const xOf = (i: number) => (priced.length > 1 ? 3 + (i / (priced.length - 1)) * 94 : 50);
    const yOf = (v: number) => ((hi - v) / span) * 100;
    const pts = priced.map((p, i) => ({ xPct: xOf(i), yPct: yOf(p.unitPrice), value: p.unitPrice, flagged: p.flagged }));
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.xPct.toFixed(2)} ${p.yPct.toFixed(2)}`).join(' ');
    const area = `${line} L ${pts[pts.length - 1].xPct.toFixed(2)} 100 L ${pts[0].xPct.toFixed(2)} 100 Z`;
    return { line, area, baselineY: h.baseline > 0 ? yOf(h.baseline) : 0, points: pts };
}

const rowGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '78px minmax(0,1fr) 34px 84px 72px 20px', gap: '8px' };
const colHead: React.CSSProperties = { fontFamily: MONO, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
