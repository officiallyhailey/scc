'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    ListIcon, XIcon, HouseIcon, QuestionIcon,
    UploadSimpleIcon, ReceiptIcon, PackageIcon, ChartLineUpIcon, ChartBarIcon,
} from '@phosphor-icons/react';
import { useIsNarrow, useMounted } from '@/lib/useIsNarrow';
import { WeeklyLoop } from '@/lib/components/WeeklyLoop';

export const NAV_HEIGHT = 60;

const LINKS = [
    { href: '/', label: 'Home', Icon: HouseIcon },
    { href: '/upload', label: 'Upload', Icon: UploadSimpleIcon },
    { href: '/expenses', label: 'Expenses', Icon: ReceiptIcon },
    { href: '/inventory', label: 'Inventory', Icon: PackageIcon },
    { href: '/sales', label: 'Sales', Icon: ChartLineUpIcon },
    { href: '/scorecard', label: 'Scorecard', Icon: ChartBarIcon },
];

function isActive(pathname: string, href: string): boolean {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function TopNav() {
    const pathname = usePathname() ?? '/';
    const isNarrow = useIsNarrow();
    const mounted = useMounted();
    const [open, setOpen] = useState(false);
    const [help, setHelp] = useState(false);
    useEffect(() => { setOpen(false); }, [pathname]);

    // Until mounted, render a breakpoint-neutral nav (logo + help). After mount the layout
    // effect has run (before paint), so the correct desktop/mobile nav swaps in with no flash.
    const showWide = mounted && !isNarrow;
    const showNarrow = mounted && isNarrow;

    // Only one of { menu, help } may be open at a time.
    const openMenu = () => { setHelp(false); setOpen(o => !o); };
    const openHelp = () => { setOpen(false); setHelp(true); };

    const iconBtn: React.CSSProperties = {
        width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '12px', border: '1px solid var(--glass-border)', cursor: 'pointer',
        background: 'var(--glass-bg)', color: 'var(--text-primary)',
    };

    const navIcon = (active: boolean): React.CSSProperties => ({
        width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', cursor: 'pointer', transition: 'background .12s, color .12s',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--accent-text)' : 'var(--text-primary)',
    });

    const logo = (
        <Link href="/" aria-label="Silk City Coffee" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Silk City Coffee" style={{ height: '40px', width: 'auto', objectFit: 'contain', display: 'block' }} />
        </Link>
    );

    const helpBtn = (
        <button onClick={openHelp} aria-label="How it works" title="How it works — running a report & the pages" style={{ ...iconBtn, borderRadius: '50%' }}>
            <QuestionIcon size={20} weight="bold" />
        </button>
    );

    // Mobile dropdown menu, portaled so the header's backdrop-filter doesn't trap fixed positioning.
    const menu = (
        <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, top: `${NAV_HEIGHT}px`, zIndex: 1290, background: 'rgba(14,18,20,0.22)' }} />
            <nav style={{
                position: 'fixed', top: `${NAV_HEIGHT + 6}px`, right: '8px', left: '8px', zIndex: 1300,
                background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(150%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)',
                display: 'flex', flexDirection: 'column', padding: '8px', gap: '4px',
                boxShadow: 'var(--shadow-hover)',
            }}>
                {LINKS.map(link => {
                    const active = isActive(pathname, link.href);
                    return (
                        <Link key={link.href} href={link.href}
                            style={{
                                fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 700, textDecoration: 'none',
                                padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                                background: active ? 'var(--accent)' : 'transparent',
                                color: active ? 'var(--accent-text)' : 'var(--text-primary)',
                                display: 'flex', alignItems: 'center', gap: '11px',
                            }}>
                            <link.Icon size={18} weight="bold" /> {link.label}
                        </Link>
                    );
                })}
            </nav>
        </>
    );

    return (
        <>
            <header style={{
                height: `${NAV_HEIGHT}px`, flexShrink: 0, position: 'sticky', top: 0, zIndex: 1200,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: showNarrow ? '0 14px' : '0 22px', transition: 'padding .18s ease',
                background: 'var(--glass-bg-strong)',
                backdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                borderBottom: '1px solid var(--glass-border)',
            }}>
                {logo}

                {/* Desktop / tablet: centered icon nav */}
                {showWide && (
                    <nav style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {LINKS.map(link => {
                            const active = isActive(pathname, link.href);
                            return (
                                <Link key={link.href} href={link.href} aria-label={link.label} title={link.label} style={navIcon(active)}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--glass-bg)'; }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                                    <link.Icon size={20} weight="bold" />
                                </Link>
                            );
                        })}
                    </nav>
                )}

                {/* Right side — neutral (just help) until mounted, then hamburger on mobile */}
                {showNarrow ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {helpBtn}
                        <button aria-label={open ? 'Close menu' : 'Open menu'} onClick={openMenu}
                            style={{ ...iconBtn, background: open ? 'var(--accent)' : 'var(--glass-bg)', color: open ? 'var(--accent-text)' : 'var(--text-primary)' }}>
                            {open ? <XIcon size={20} weight="bold" /> : <ListIcon size={20} weight="bold" />}
                        </button>
                    </div>
                ) : (
                    helpBtn
                )}
            </header>

            {showNarrow && open && createPortal(menu, document.body)}
            {mounted && help && createPortal(<WeeklyLoop onClose={() => setHelp(false)} />, document.body)}
        </>
    );
}
