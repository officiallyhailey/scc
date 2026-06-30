'use client';

// / — the landing hub. A marquee hero + a glass card linking to each section. No data
// fetching here; the shared TopNav (in Shell) carries the nav, ? help and idle timeout.

import React from 'react';
import Link from 'next/link';
import {
    UploadSimpleIcon, ReceiptIcon, PackageIcon, ChartLineUpIcon, ChartBarIcon, ArrowRightIcon,
} from '@phosphor-icons/react';
import { Shell } from '@/lib/components/Shell';
import { glass, DISPLAY, MONO, PALETTE } from '@/lib/components/ui';
import { useIsNarrow, useMounted } from '@/lib/useIsNarrow';

const SECTIONS = [
    { href: '/upload', n: '01', label: 'Upload', desc: 'Drop in invoices, receipts and statements — Claude files the line items as draft expenses.', Icon: UploadSimpleIcon, gold: true },
    { href: '/expenses', n: '02', label: 'Expenses', desc: 'Every expense in one list. Fix category, vendor, inventory and amounts before the report.', Icon: ReceiptIcon, gold: false },
    { href: '/inventory', n: '03', label: 'Inventory', desc: 'The pantry — every item, its vendor, cost and stock. Add new items as they appear.', Icon: PackageIcon, gold: false },
    { href: '/sales', n: '04', label: 'Sales', desc: 'Square + Shopify sales by item. Link products so each sale lands in the right department.', Icon: ChartLineUpIcon, gold: true },
    { href: '/scorecard', n: '05', label: 'Scorecard', desc: 'Four-week expenses, sales and COG % by department — the weekly health check.', Icon: ChartBarIcon, gold: true },
];

const MARQUEE = ['Expenses', 'Sales', 'Inventory', 'Scorecard', 'Silk City'];

export default function Home() {
    // Guard against SSR mismatch: stay desktop until mounted (the layout effect commits
    // the correct value before paint), so the landing doesn't flash desktop→mobile.
    const mounted = useMounted();
    const isNarrow = useIsNarrow() && mounted;

    return (
        <Shell>
            <div style={{ maxWidth: '1000px', width: '100%', margin: '0 auto', padding: isNarrow ? '0 16px 60px' : '0 28px 80px', position: 'relative' }}>
                {/* ── Loading-style marquee hero ───────────────────────────────── */}
                <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-lg)', margin: isNarrow ? '18px 0 0' : '28px 0 0', padding: isNarrow ? '34px 18px 30px' : '52px 36px 46px', ...glass({ radius: 'var(--radius-lg)' }) }}>
                    {/* scrolling word backdrop */}
                    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.04em', opacity: 0.06, pointerEvents: 'none' }}>
                        {[0, 1, 2].map(row => {
                            const off = row % MARQUEE.length;
                            const items = [...MARQUEE.slice(off), ...MARQUEE.slice(0, off)];
                            return (
                                <div key={row} style={{ flexShrink: 0, width: 'max-content', display: 'inline-flex', whiteSpace: 'nowrap', lineHeight: 1.05, animation: `ddMarquee ${20 + row * 5}s linear infinite`, animationDirection: row % 2 ? 'reverse' : 'normal' }}>
                                    {[0, 1].map(seq => (
                                        <div key={seq} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                                            {items.map((it, i) => (
                                                <span key={`${seq}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', fontFamily: DISPLAY, fontSize: 'clamp(40px, 9vw, 92px)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                                                    <span style={{ padding: '0 0.18em' }}>{it}</span><span style={{ fontSize: '0.4em', color: PALETTE.gold }}>✦</span>
                                                </span>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>

                    {/* hero text */}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={monoEyebrow}>// Silk City Coffee · Finance</div>
                        <h1 style={{ fontFamily: DISPLAY, fontWeight: 400, textTransform: 'uppercase', fontSize: isNarrow ? 'clamp(40px, 13vw, 60px)' : '78px', lineHeight: 0.97, letterSpacing: '0.01em', margin: '14px 0 0', color: 'var(--text-primary)' }}>
                            Run the<br /><span style={{ color: PALETTE.gold }}> numbers.</span>
                        </h1>
                        <p style={{ fontSize: isNarrow ? '15px' : '17px', lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: '540px', margin: '18px 0 0' }}>
                            Part 1. Upload the week’s reports <br /> Part 2. Little silk agents go file them <br /> Part 3. Do a final review of the data populating the scorecard <br /> Part 4. Make informed decisions!
                        </p>
                    </div>
                </section>

                {/* ── Nav cards: one per section ───────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(3, 1fr)', gap: '16px', marginTop: '18px' }}>
                    {SECTIONS.map(s => (
                        <Link key={s.href} href={s.href} style={{ textDecoration: 'none' }}>
                            <div
                                style={{ ...glass({ radius: 'var(--radius-lg)' }), padding: '22px', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'box-shadow .15s, transform .15s', cursor: 'pointer' }}
                                onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ width: '44px', height: '44px', borderRadius: '13px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.gold ? 'var(--accent-soft)' : 'rgba(50,70,79,0.10)', color: s.gold ? 'var(--accent-deep)' : 'var(--c-slate)' }}>
                                        <s.Icon size={23} weight="duotone" />
                                    </span>
                                    <span style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>{s.n}</span>
                                </div>
                                <div style={{ fontFamily: DISPLAY, fontSize: '27px', textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--text-primary)' }}>{s.label}</div>
                                <p style={{ fontSize: '13.5px', lineHeight: 1.5, color: 'var(--text-muted)', margin: 0, flex: 1 }}>{s.desc}</p>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 700, color: 'var(--accent-deep)' }}>
                                    Open {s.label} <ArrowRightIcon size={15} weight="bold" />
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </Shell>
    );
}

const monoEyebrow: React.CSSProperties = {
    fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
};
