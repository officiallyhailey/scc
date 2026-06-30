'use client';

import React from 'react';
import { XIcon } from '@phosphor-icons/react';
import { DISPLAY, MONO } from '@/lib/components/ui';
import { useIsNarrow } from '@/lib/useIsNarrow';

const LOOP_STEPS: [string, string][] = [
    ['Upload files', 'Drop the week’s invoices, receipts and bank/card statements (PDF, CSV or photo).'],
    ['Claude extracts', 'Each file is read and its line items pulled out automatically.'],
    ['Drafts land in Airtable', 'Line items become draft expenses, tagged to the chosen location.'],
    ['Review & link', 'Tidy each expense — category, vendor, inventory — on the Expenses page.'],
    ['Sales flow in', 'Square/Shopify sales arrive via the report and get categorized by product.'],
    ['Scorecard rolls up', 'Expenses ÷ sales gives COG % by department over the last 4 weeks.'],
];

export function WeeklyLoop({ onClose }: { onClose: () => void }) {
    const isNarrow = useIsNarrow();
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, top: 'var(--nav-h)', zIndex: 1400, background: 'rgba(14,18,20,0.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: isNarrow ? 'flex-end' : 'center', justifyContent: 'center', padding: isNarrow ? 0 : '20px' }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: isNarrow ? '100%' : 'min(520px, 94vw)', maxHeight: '100%', overflowY: 'auto',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                border: '1px solid var(--glass-border)', borderRadius: isNarrow ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
                boxShadow: 'var(--shadow-hover)', padding: isNarrow ? '22px 18px 28px' : '26px',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// How it works</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: '30px', textTransform: 'uppercase', color: 'var(--text-primary)', marginTop: '2px' }}>The weekly loop</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <XIcon size={18} weight="bold" />
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {LOOP_STEPS.map(([title, body], i) => (
                        <div key={title} style={{ display: 'flex', gap: '13px', alignItems: 'flex-start' }}>
                            <span style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: MONO, fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
                                <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-muted)' }}>{body}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
