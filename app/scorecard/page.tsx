'use client';

// /scorecard — the weekly health check. One table grouped Location → Department, each with
// Expenses / Sales / COG% / Hours / Labor / COS% rows over a 4-week window (◀/▶ pager) plus a
// blended 4-week summary column. `deptStats()` aggregates Expenses + Sales + Time Sheets by
// week for a given location and department set; 763 splits Bar/Kitchen, 869 is one Cafe.
// Department mapping + LABOR_RATE live in lib/silk/schema.

import React, { useEffect, useMemo, useState } from 'react';
import { ChartBarIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { AirtableBoundary, useBase, useRecords } from '@/lib/airtable/hooks';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { glass, DISPLAY, MONO, PALETTE } from '@/lib/components/ui';
import { TABLES, EX, SALE, TS, LABOR_RATE } from '@/lib/silk/schema';
import { usd0 as usd, pct, num, str, linkIds, selectNames, weekKey } from '@/lib/silk/cells';

// COG/COS heat: amber once it's high, gold mid, ink when healthy.
function cogColor(v: number): string {
    return v >= 0.45 ? PALETTE.rust : v >= 0.30 ? 'var(--accent-deep)' : 'var(--text-primary)';
}

type Stats = {
    exp: number[]; sal: number[]; cog: (number | null)[]; expTot: number; salTot: number; cogAvg: number | null;
    hours: number[]; labor: number[]; cos: (number | null)[]; hoursTot: number; laborTot: number; cosAvg: number | null;
};
type Section = { location: string; dept: string; firstOfLoc: boolean; stats: Stats };

export default function ScorecardPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    return (
        <Shell>
            {mounted ? <AirtableBoundary><Scorecard /></AirtableBoundary> : <div style={{ flex: 1 }} />}
        </Shell>
    );
}

function Scorecard() {
    const isNarrow = useIsNarrow();
    const base = useBase();
    const expensesTable = base.tables.find(t => t.id === TABLES.expenses)!;
    const locationsTable = base.tables.find(t => t.id === TABLES.locations)!;
    const salesTable = base.tables.find(t => t.id === TABLES.sales)!;
    const timeSheetsTable = base.tables.find(t => t.id === TABLES.timeSheets)!;
    const expenses = useRecords(expensesTable);
    const locations = useRecords(locationsTable);
    const sales = useRecords(salesTable);
    const timeSheets = useRecords(timeSheetsTable);

    const [offset, setOffset] = useState(0);

    const { weeks, sections, allCount } = useMemo(() => {
        // Union of expense + sales weeks (Sunday MM/DD/YYYY), newest first.
        const weekSet = new Set<string>();
        for (const r of expenses) { const w = str(r, EX.weekOf); if (w) weekSet.add(w); }
        for (const r of sales) { const w = str(r, SALE.weekStart); if (w) weekSet.add(w); }
        const allWeeks = Array.from(weekSet).sort((a, b) => weekKey(b).localeCompare(weekKey(a)));
        const start = Math.min(offset, Math.max(0, allWeeks.length - 4));
        const weeks = allWeeks.slice(start, start + 4);
        const idx = new Map(weeks.map((w, i) => [w, i]));

        // Expenses (by category), sales (by dept lookup), and labor hours (by timesheet dept) for a location.
        function deptStats(locId: string, expCats: Set<string>, salDepts: Set<string>, tsDepts: Set<string>): Stats {
            const exp = [0, 0, 0, 0], sal = [0, 0, 0, 0], hours = [0, 0, 0, 0];
            for (const r of expenses) {
                if (!linkIds(r, EX.locations).includes(locId)) continue;
                const wi = idx.get(str(r, EX.weekOf)); if (wi === undefined) continue;
                if (selectNames(r, EX.category).some(c => expCats.has(c))) exp[wi] += num(r, EX.total);
            }
            for (const r of sales) {
                if (!linkIds(r, SALE.locations).includes(locId)) continue;
                const wi = idx.get(str(r, SALE.weekStart)); if (wi === undefined) continue;
                if (selectNames(r, SALE.department).some(d => salDepts.has(d))) sal[wi] += num(r, SALE.netSales);
            }
            for (const r of timeSheets) {
                if (!linkIds(r, TS.locations).includes(locId)) continue;
                const wi = idx.get(str(r, TS.weekStart)); if (wi === undefined) continue;
                if (tsDepts.has(str(r, TS.department))) hours[wi] += num(r, TS.totalHours) + num(r, TS.holiday);
            }
            const labor = hours.map(h => h * LABOR_RATE);
            const cog = weeks.map((_, i) => (sal[i] > 0 ? exp[i] / sal[i] : null));
            const cos = weeks.map((_, i) => (sal[i] > 0 ? labor[i] / sal[i] : null));
            let te = 0, ts = 0, tl = 0, tsl = 0;
            weeks.forEach((_, i) => {
                if (sal[i] > 0) { te += exp[i]; ts += sal[i]; tl += labor[i]; tsl += sal[i]; }
            });
            return {
                exp, sal, cog, expTot: exp.reduce((s, n) => s + n, 0), salTot: sal.reduce((s, n) => s + n, 0), cogAvg: ts > 0 ? te / ts : null,
                hours, labor, cos, hoursTot: hours.reduce((s, n) => s + n, 0), laborTot: labor.reduce((s, n) => s + n, 0), cosAvg: tsl > 0 ? tl / tsl : null,
            };
        }

        const BAR = new Set(['Bar']), KIT = new Set(['Kitchen']), CAFE_E = new Set(['Bar', 'Kitchen']);
        const BAR_S = new Set(['Bar', 'Retail Coffee']), KIT_S = new Set(['Kitchen']), CAFE_S = new Set(['Bar', 'Retail Coffee', 'Kitchen']);
        const BAR_TS = new Set(['Bar']), KIT_TS = new Set(['Kitchen']), CAFE_TS = new Set(['Bar']); // 869 only tracks Bar timesheets

        const find = (name: string) => locations.find(l => (l.name || '').trim() === name);
        const sections: Section[] = [];
        const l763 = find('763');
        if (l763) {
            sections.push({ location: '763', dept: 'Bar', firstOfLoc: true, stats: deptStats(l763.id, BAR, BAR_S, BAR_TS) });
            sections.push({ location: '763', dept: 'Kitchen', firstOfLoc: false, stats: deptStats(l763.id, KIT, KIT_S, KIT_TS) });
        }
        const l869 = find('869');
        if (l869) {
            sections.push({ location: '869', dept: 'Cafe', firstOfLoc: true, stats: deptStats(l869.id, CAFE_E, CAFE_S, CAFE_TS) });
        }
        return { weeks, sections, allCount: allWeeks.length };
    }, [expenses, sales, timeSheets, locations, offset]);

    const maxOffset = Math.max(0, allCount - 4);
    const startOff = Math.min(offset, maxOffset);
    const canOlder = startOff < maxOffset;
    const canNewer = startOff > 0;
    const cols = weeks.length;
    const gridCols = `minmax(116px, 1.5fr) repeat(${cols}, minmax(70px, 1fr)) minmax(92px, 1fr)`;

    return (
        <div style={{ width: '100%', maxWidth: '1040px', margin: '0 auto', padding: `${isNarrow ? '18px' : '28px'} ${isNarrow ? '14px' : '26px'} 70px` }}>
            <div style={{ marginBottom: '14px' }}>
                <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Scorecard</div>
                <h1 style={{ fontFamily: DISPLAY, fontSize: isNarrow ? '34px' : '44px', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '6px 0 0', color: 'var(--text-primary)' }}>Last 4 Weeks</h1>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '6px 0 0' }}>Expenses, sales, COG %, labor and cost-of-service by location and department. 869 combines bar + kitchen as one cafe.</p>
            </div>

            {/* Week pager */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PagerBtn caret="left" label="Later weeks" disabled={!canNewer} onClick={() => setOffset(o => Math.max(0, o - 4))} />
                    <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', minWidth: '120px', textAlign: 'center' }}>
                        {weeks.length ? `${weeks[0]} – ${weeks[weeks.length - 1]}` : '—'}
                    </span>
                    <PagerBtn caret="right" label="Earlier weeks" disabled={!canOlder} onClick={() => setOffset(o => Math.min(maxOffset, o + 4))} />
                </div>
            </div>

            {weeks.length === 0 || sections.length === 0 ? (
                <div style={{ ...glass({ soft: true }), padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ChartBarIcon size={34} weight="duotone" />
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>No scorecard data yet.</div>
                </div>
            ) : (
                <div style={{ ...glass(), padding: isNarrow ? '6px' : '10px', overflowX: 'auto' }}>
                    <div style={{ minWidth: isNarrow ? '540px' : undefined }}>
                        {/* column header */}
                        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '6px', padding: '8px 12px', alignItems: 'end' }}>
                            <span style={head} />
                            {weeks.map((w, i) => <span key={w} style={{ ...head, textAlign: 'right', color: i === 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{w.slice(0, 5)}</span>)}
                            <span style={{ ...head, textAlign: 'right' }}>4-wk</span>
                        </div>

                        {sections.map(sec => (
                            <React.Fragment key={`${sec.location}-${sec.dept}`}>
                                {sec.firstOfLoc && (
                                    <div style={{ gridColumn: '1 / -1', padding: '12px 12px 6px', marginTop: sec.location === '869' ? '6px' : 0 }}>
                                        <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-deep)' }}>Location: {sec.location}</span>
                                    </div>
                                )}
                                <div style={{ padding: '6px 12px 2px' }}>
                                    <span style={{ fontFamily: DISPLAY, fontSize: '17px', textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--text-primary)' }}>{sec.dept}</span>
                                </div>
                                <MetricRow label="Expenses" kind="money" cells={sec.stats.exp} summary={sec.stats.expTot} gridCols={gridCols} />
                                <MetricRow label="Sales" kind="money" cells={sec.stats.sal} summary={sec.stats.salTot} gridCols={gridCols} />
                                <MetricRow label="COG %" kind="pct" cells={sec.stats.cog} summary={sec.stats.cogAvg} gridCols={gridCols} />
                                <MetricRow label="Hours" kind="num" cells={sec.stats.hours} summary={sec.stats.hoursTot} gridCols={gridCols} divider />
                                <MetricRow label="Labor" kind="money" cells={sec.stats.labor} summary={sec.stats.laborTot} gridCols={gridCols} />
                                <MetricRow label="COS %" kind="pct" cells={sec.stats.cos} summary={sec.stats.cosAvg} gridCols={gridCols} />
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                COG % = department expenses ÷ department sales (Bar sales include Retail Coffee; 869 Cafe combines bar + kitchen). Hours = Time Sheet total hours for the department; Labor = Hours × ${LABOR_RATE}/hr; COS % = Labor ÷ department sales. The 4-wk column blends totals across the window (sum ÷ sum), counting only weeks that have sales. 869 labor uses the Bar time-sheet department only.
            </div>
        </div>
    );
}

type Kind = 'money' | 'pct' | 'num';
const fmtCell = (kind: Kind, v: number) => (kind === 'pct' ? pct(v) : kind === 'num' ? v.toFixed(1) : usd(v));

function MetricRow({ label, kind, cells, summary, gridCols, divider }: { label: string; kind: Kind; cells: (number | null)[]; summary: number | null; gridCols: string; divider?: boolean }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '6px', padding: '8px 12px', alignItems: 'center', borderTop: divider ? '1px dashed var(--hairline)' : '1px solid var(--hairline)' }}>
            <span style={{ paddingLeft: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
            {cells.map((v, i) => (
                <span key={i} style={{ textAlign: 'right', fontSize: '13.5px', fontVariantNumeric: 'tabular-nums', fontWeight: i === 0 && v ? 700 : 500, color: v == null || v === 0 ? 'var(--hairline)' : kind === 'pct' ? cogColor(v) : (i === 0 ? 'var(--text-primary)' : 'var(--text-muted)') }}>
                    {v == null || v === 0 ? '·' : fmtCell(kind, v)}
                </span>
            ))}
            <span style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: '15px', fontVariantNumeric: 'tabular-nums', color: summary == null ? 'var(--text-muted)' : kind === 'pct' ? cogColor(summary) : kind === 'num' ? 'var(--text-primary)' : 'var(--accent-deep)' }}>
                {summary == null ? '—' : fmtCell(kind, summary)}
            </span>
        </div>
    );
}

function PagerBtn({ caret, label, disabled, onClick }: { caret: 'left' | 'right'; label: string; disabled: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
            style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {caret === 'left' ? <CaretLeftIcon size={16} weight="bold" /> : <CaretRightIcon size={16} weight="bold" />}
        </button>
    );
}

const head: React.CSSProperties = { fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' };
