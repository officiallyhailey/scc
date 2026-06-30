'use client';

// The "?" guide (opened from the nav on every page). This is the platform's primary
// in-app documentation: it explains what happens when you run a report and provides a
// clickable map of the pages. Keep the steps accurate to the real Upload behavior —
// users rely on this to navigate and to understand the run.

import React from 'react';
import Link from 'next/link';
import {
    XIcon, UploadSimpleIcon, ReceiptIcon, PackageIcon, ChartLineUpIcon, ChartBarIcon,
} from '@phosphor-icons/react';
import { DISPLAY, MONO } from '@/lib/components/ui';
import { useIsNarrow } from '@/lib/useIsNarrow';

// What happens, in order, when you upload a report. Accurate to app/upload/page.tsx.
const RUN_STEPS: [string, string][] = [
    ['Choose a report & drop files', 'Upload → pick Expense or Sales. Expense takes invoices, receipts and bank/card statements (PDF, CSV or photo). Sales takes a Square item-sales-summary CSV — pick the location it’s for.'],
    ['Watch it read each file', 'Expenses are read by Claude; sales CSVs are parsed directly. Each file shows its progress live — reading, then filing — so you can see exactly where the run is.'],
    ['Rows land in Airtable automatically', 'Expense line items become draft expenses (the location is detected from each document); each sale becomes one row for the location you chose. Tax and shipping come in as their own lines.'],
    ['Read the summary flags', 'When the run finishes you get a count plus anything to check: an unrecognized vendor (left blank — never invented), a card that isn’t a known option, rows with no category yet, or a file that produced nothing.'],
    ['Refine on Expenses / Sales', 'Open the list and tidy each row — category, vendor, inventory link, amounts. Sales need a product link, which sets their department. This is where the data becomes report-ready.'],
    ['Scorecard rolls it up', 'Expenses, sales, COG % and labor / cost-of-service by department over the last 4 weeks — the weekly numbers you make decisions from.'],
];

// Clickable map of the platform. Clicking navigates and closes the guide.
const PAGES: { href: string; label: string; desc: string; Icon: typeof ReceiptIcon }[] = [
    { href: '/upload', label: 'Upload', desc: 'Get a week’s paperwork into Airtable.', Icon: UploadSimpleIcon },
    { href: '/expenses', label: 'Expenses', desc: 'Every expense — refine each line.', Icon: ReceiptIcon },
    { href: '/sales', label: 'Sales', desc: 'Every sale — link a product to categorize.', Icon: ChartLineUpIcon },
    { href: '/inventory', label: 'Inventory', desc: 'The pantry — items, vendors, cost, stock.', Icon: PackageIcon },
    { href: '/scorecard', label: 'Scorecard', desc: 'The weekly numbers by department.', Icon: ChartBarIcon },
];

export function WeeklyLoop({ onClose }: { onClose: () => void }) {
    const isNarrow = useIsNarrow();
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, top: 'var(--nav-h)', zIndex: 1400, background: 'rgba(14,18,20,0.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: isNarrow ? 'flex-end' : 'center', justifyContent: 'center', padding: isNarrow ? 0 : '20px' }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: isNarrow ? '100%' : 'min(540px, 94vw)', maxHeight: '100%', overflowY: 'auto',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                border: '1px solid var(--glass-border)', borderRadius: isNarrow ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
                boxShadow: 'var(--shadow-hover)', padding: isNarrow ? '22px 18px 28px' : '26px',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
                    <div>
                        <div style={eyebrow}>// How it works</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '30px', textTransform: 'uppercase', color: 'var(--text-primary)', marginTop: '2px', lineHeight: 1 }}>Running a report</div>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '8px 0 0' }}>
                            Get the week’s numbers into Airtable, tidy them here, and read the scorecard. You’ll get a notification when a run finishes.
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <XIcon size={18} weight="bold" />
                    </button>
                </div>

                {/* The run, step by step */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {RUN_STEPS.map(([title, body], i) => (
                        <div key={title} style={{ display: 'flex', gap: '13px', alignItems: 'flex-start' }}>
                            <span style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: MONO, fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
                                <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-muted)' }}>{body}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Page map */}
                <div style={{ ...eyebrow, margin: '22px 0 10px' }}>// The pages</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {PAGES.map(p => (
                        <Link key={p.href} href={p.href} onClick={onClose} style={{ textDecoration: 'none' }}>
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', background: 'var(--glass-bg)', cursor: 'pointer', transition: 'border-color .12s, background .12s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hairline)'; }}
                            >
                                <span style={{ flexShrink: 0, width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}>
                                    <p.Icon size={18} weight="duotone" />
                                </span>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.label}</div>
                                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.desc}</div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}

const eyebrow: React.CSSProperties = {
    fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
};
