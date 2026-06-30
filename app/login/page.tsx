'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScrollProgress } from '@/lib/components/ScrollProgress';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const DISPLAY = 'var(--font-display)';

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
            minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            fontFamily: 'var(--font-body), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            <ScrollProgress />
            <form onSubmit={submit} style={{
                width: '100%', maxWidth: '380px',
                background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-lg)', padding: '32px 28px', boxShadow: 'var(--shadow)',
                display: 'flex', flexDirection: 'column', gap: '18px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                    <span style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'linear-gradient(135deg, var(--accent), var(--c-slate))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: '22px', color: '#f6bd95' }}>S</span>
                    <span style={{ fontFamily: DISPLAY, fontSize: '25px', letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Silk Finance</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>// Enter password</div>
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
