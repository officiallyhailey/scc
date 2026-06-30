'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ClockCountdownIcon } from '@phosphor-icons/react';
import { glass, Button, DISPLAY, MONO } from '@/lib/components/ui';

const TOTAL_MS = 15 * 60 * 1000; // sign out after 15 min idle
const WARN_MS = 12 * 60 * 1000;  // warn 3 min before (at the 12-min mark)

// "Activity" = real interaction (clicks/taps, keys, scroll/wheel) — not idle mouse
// drift — so the warning fires when the user truly hasn't done anything.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'];

export function IdleTimeout() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [remaining, setRemaining] = useState(TOTAL_MS - WARN_MS);
    const last = useRef(Date.now());
    const loggingOut = useRef(false);

    const logout = useCallback(async () => {
        if (loggingOut.current) return;
        loggingOut.current = true;
        try { await fetch('/api/login', { method: 'DELETE' }); } catch { /* clear anyway */ }
        router.replace('/login');
        router.refresh();
    }, [router]);

    useEffect(() => { setMounted(true); }, []);

    // Any real interaction resets the idle clock (and dismisses the warning).
    useEffect(() => {
        const bump = () => { last.current = Date.now(); };
        const opts = { capture: true, passive: true } as AddEventListenerOptions;
        ACTIVITY_EVENTS.forEach(e => document.addEventListener(e, bump, opts));
        return () => ACTIVITY_EVENTS.forEach(e => document.removeEventListener(e, bump, opts));
    }, []);

    // One-second tick: open the warning at 12 min, sign out at 15.
    useEffect(() => {
        const id = window.setInterval(() => {
            const idle = Date.now() - last.current;
            if (idle >= TOTAL_MS) { void logout(); return; }
            const warn = idle >= WARN_MS;
            setOpen(warn);
            if (warn) setRemaining(TOTAL_MS - idle);
        }, 1000);
        return () => clearInterval(id);
    }, [logout]);

    if (!mounted || !open) return null;

    const stay = () => { last.current = Date.now(); setOpen(false); };
    const mm = Math.floor(remaining / 60000);
    const ss = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(14,18,20,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{
                ...glass({ strong: true, radius: 'var(--radius-lg)' }),
                width: 'min(420px, 94vw)', padding: '28px', textAlign: 'center',
                backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
                boxShadow: 'var(--shadow-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            }}>
                <span style={{ width: '54px', height: '54px', borderRadius: '16px', background: 'var(--accent-soft)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ClockCountdownIcon size={28} weight="bold" />
                </span>
                <div style={{ fontFamily: DISPLAY, fontSize: '26px', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Still there?</div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    You&apos;ll be signed out for inactivity in
                </div>
                <div style={{ fontFamily: MONO, fontSize: '34px', fontWeight: 700, color: 'var(--accent-deep)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>{mm}:{ss}</div>
                <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '6px' }}>
                    <Button onClick={stay} style={{ flex: 1, padding: '12px' }}>Stay signed in</Button>
                    <Button variant="ghost" onClick={() => void logout()}>Sign out</Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
