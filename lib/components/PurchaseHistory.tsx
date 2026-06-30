'use client';

import React, { useMemo } from 'react';
import { XIcon, TrendUpIcon, WarningIcon, ReceiptIcon } from '@phosphor-icons/react';
import { useBase, useRecords } from '@/lib/airtable/hooks';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, DISPLAY, MONO, PALETTE } from '@/lib/components/ui';
import { iconBtn } from '@/lib/components/fields';
import { TABLES, INV } from '@/lib/silk/schema';
import { usd, num, str, nameMap } from '@/lib/silk/cells';
import { buildPriceHistory, PRICE_FLAG_PCT, type PriceHistory } from '@/lib/silk/history';

const fmtPct = (r: number) => `${r >= 0 ? '+' : ''}${Math.round(r * 100)}%`;

/**
 * Read-only purchase-history report for one inventory item. Self-contained (loads its own
 * tables); slides in from the right above the InventoryForm (z-index 1200). Shows a unit-price
 * sparkline (with the item's listed price as a reference line) and a chronological table,
 * flagging purchases whose unit price is ≥10% above the listed Unit Price.
 */
export function PurchaseHistory({ recordId, onClose }: { recordId: string; onClose: () => void }) {
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
    const basePerUnit = item ? num(item, INV.perUnit) : 0;
    const h: PriceHistory = useMemo(
        () => buildPriceHistory(expenses, recordId, baseline, basePerUnit, vendorNames),
        [expenses, recordId, baseline, basePerUnit, vendorNames],
    );
    const newestFirst = useMemo(() => [...h.purchases].reverse(), [h.purchases]);
    const spark = useMemo(() => buildSparkline(h), [h]);
    const dateRange = h.purchases.length
        ? `${h.purchases[0].date || '—'} → ${h.purchases[h.purchases.length - 1].date || '—'}`
        : '—';

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, top: 'var(--nav-h)', zIndex: 1200, background: 'rgba(20,28,32,0.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: isNarrow ? '100%' : 'min(560px, 96vw)', height: '100%', overflowY: 'auto',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                borderLeft: '1px solid var(--glass-border)', boxShadow: 'var(--shadow-hover)',
                padding: isNarrow ? '18px' : '24px', display: 'flex', flexDirection: 'column', gap: '16px',
            }}>
                {/* header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Purchase history · {h.count} {h.count === 1 ? 'purchase' : 'purchases'}</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '24px', color: 'var(--text-primary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{dateRange}</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={iconBtn}><XIcon size={18} weight="bold" /></button>
                </div>

                {/* summary stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    <Stat label="Listed unit price" value={baseline > 0 ? usd(baseline) : '—'} />
                    <Stat label="Latest paid" value={h.latest ? usd(h.latest.unitPrice) : '—'}
                        sub={h.latestDelta != null ? fmtPct(h.latestDelta) + ' vs listed' : undefined}
                        tone={h.latestFlagged ? 'flag' : h.latestDelta != null && h.latestDelta < 0 ? 'good' : 'muted'} />
                    <Stat label="Avg paid" value={h.avg != null ? usd(h.avg) : '—'} />
                    <Stat label="Range paid" value={h.min != null && h.max != null ? `${usd(h.min)} – ${usd(h.max)}` : '—'} />
                </div>

                {/* flag callout */}
                {h.latestFlagged && (
                    <div style={{ ...glass({ soft: true }), padding: '11px 13px', border: `1px solid var(--accent-2)`, display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <WarningIcon size={18} weight="fill" color={PALETTE.rust} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            Latest purchase is <strong style={{ color: PALETTE.rust }}>{fmtPct(h.latestDelta!)}</strong> above the listed unit price — review the vendor.
                        </span>
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
                            {/* round point markers overlaid (so they don't stretch with the svg) */}
                            {spark.points.map((p, i) => (
                                <span key={i} title={usd(p.value)} style={{ position: 'absolute', left: `${p.xPct}%`, top: `${8 + (p.yPct / 100) * (72 - 16)}px`, width: p.flagged ? '9px' : '6px', height: p.flagged ? '9px' : '6px', borderRadius: '50%', background: p.flagged ? PALETTE.rust : 'var(--accent-deep)', transform: 'translate(-50%, -50%)', border: '1.5px solid var(--glass-bg-strong)' }} />
                            ))}
                            {baseline > 0 && <span style={{ position: 'absolute', right: '6px', top: `${8 + (spark.baselineY / 100) * (72 - 16) - 8}px`, fontSize: '9px', fontFamily: MONO, color: 'var(--text-muted)' }}>listed</span>}
                        </div>
                    </div>
                ) : null}

                {/* table */}
                {newestFirst.length === 0 ? (
                    <div style={{ ...glass({ soft: true }), padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <ReceiptIcon size={30} weight="duotone" />
                        <div style={{ marginTop: '8px', fontSize: '13.5px' }}>No linked purchases yet for this item.</div>
                    </div>
                ) : (
                    <div style={{ ...glass(), padding: '2px', overflowX: 'auto' }}>
                        <div style={{ minWidth: '320px' }}>
                            <div style={{ ...rowGrid, padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>
                                {['Date', 'Vendor', 'Qty', 'Unit price', 'Total'].map((c, i) => (
                                    <span key={c} style={{ ...colHead, textAlign: i >= 2 ? 'right' : 'left' }}>{c}</span>
                                ))}
                            </div>
                            {newestFirst.map((p, i) => (
                                <div key={p.id} style={{ ...rowGrid, padding: '9px 12px', borderBottom: i === newestFirst.length - 1 ? 'none' : '1px solid var(--hairline)', alignItems: 'center', background: p.flagged ? 'rgba(181,138,58,0.07)' : 'transparent' }}>
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
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Flagged = unit price ≥ {Math.round(PRICE_FLAG_PCT * 100)}% above the item&apos;s listed Unit Price, compared per unit so pack sizes (case vs each) line up. Unit price falls back to total ÷ qty when not recorded.
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'flag' | 'good' | 'muted' }) {
    const subColor = tone === 'flag' ? PALETTE.rust : tone === 'good' ? 'var(--accent-deep)' : 'var(--text-muted)';
    return (
        <div style={{ ...glass({ soft: true }), padding: '9px 12px' }}>
            <div style={{ fontFamily: MONO, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: '19px', color: 'var(--text-primary)', marginTop: '1px' }}>{value}</div>
            {sub && <div style={{ fontSize: '11.5px', fontWeight: 700, color: subColor }}>{sub}</div>}
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

const rowGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '78px minmax(0,1fr) 40px 84px 76px', gap: '8px' };
const colHead: React.CSSProperties = { fontFamily: MONO, fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
