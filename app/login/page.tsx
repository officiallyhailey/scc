'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScrollProgress } from '@/lib/components/ScrollProgress';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const DISPLAY = 'var(--font-display)';
const MARQUEE = ['Expenses', 'Sales', 'Inventory', 'Scorecard', 'Silk City'];

// Slow scrolling word-marquee behind the login card (mirrors the landing hero). Each row
// holds two copies of the word list so the -50% translate loops seamlessly; alternating
// rows scroll the opposite way. Low opacity + the card's backdrop blur keep it subtle.
function MarqueeBackground() {
    return (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 0, opacity: 0.06, pointerEvents: 'none' }}>
            {Array.from({ length: 28 }, (_, row) => {
                const off = row % MARQUEE.length;
                const items = [...MARQUEE.slice(off), ...MARQUEE.slice(0, off)];
                return (
                    <div key={row} style={{ flexShrink: 0, width: 'max-content', display: 'inline-flex', whiteSpace: 'nowrap', lineHeight: 1.05, animation: `ddMarquee ${20 + (row % 6) * 4}s linear infinite`, animationDirection: row % 2 ? 'reverse' : 'normal' }}>
                        {[0, 1].map(seq => (
                            <div key={seq} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                                {items.map((it, i) => (
                                    <span key={`${seq}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', fontFamily: DISPLAY, fontSize: 'clamp(40px, 9vw, 92px)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                                        <span style={{ padding: '0 0.18em' }}>{it}</span><span style={{ fontSize: '0.4em', color: 'var(--accent)' }}>✦</span>
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

function LoginForm() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get('next') || '/';

    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (res.ok) {
                router.replace(next);
                router.refresh();
                return;
            }
            const body = await res.json().catch(() => ({}));
            setError(body?.error ?? 'Login failed.');
        } catch {
            setError('Network error. Try again.');
        }
        setBusy(false);
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '14px 16px', fontSize: '16px', color: 'var(--text-primary)',
        background: 'var(--glass-bg-soft)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)',
        outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box',
    };

    return (
        <div style={{
            position: 'relative', overflow: 'hidden',
            minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            fontFamily: 'var(--font-body), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            <ScrollProgress />
            <MarqueeBackground />
            <form onSubmit={submit} style={{
                position: 'relative', zIndex: 1,
                width: '100%', maxWidth: '380px',
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-lg)', padding: '32px 28px', boxShadow: 'var(--shadow-hover)',
                display: 'flex', flexDirection: 'column', gap: '18px',
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '2px' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="Silk City Coffee" style={{ height: '100px', width: 'auto', objectFit: 'contain', display: 'block' }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}></div>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    autoFocus
                    style={inputStyle}
                />
                {error && <div style={{ fontSize: '13px', color: '#c0623b', fontWeight: 600 }}>{error}</div>}
                <button type="submit" disabled={busy} style={{
                    padding: '15px 20px', borderRadius: 'var(--radius-sm)', cursor: busy ? 'wait' : 'pointer',
                    background: 'var(--accent)', color: 'var(--accent-text)', border: 'none',
                    fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 700, letterSpacing: '0.04em',
                    opacity: busy ? 0.7 : 1,
                }}>
                    {busy ? 'Checking…' : 'Enter →'}
                </button>
            </form>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
