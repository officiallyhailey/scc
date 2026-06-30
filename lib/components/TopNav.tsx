'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    ListIcon, XIcon, HouseIcon, CoffeeIcon, QuestionIcon,
    UploadSimpleIcon, ReceiptIcon, PackageIcon, ChartLineUpIcon, ChartBarIcon,
} from '@phosphor-icons/react';
import { useIsNarrow } from '@/lib/useIsNarrow';
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

const DISPLAY = 'var(--font-display)';

function isActive(pathname: string, href: string): boolean {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function TopNav() {
    const pathname = usePathname() ?? '/';
    const isNarrow = useIsNarrow();
    const [open, setOpen] = useState(false);
    const [help, setHelp] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { setOpen(false); }, [pathname]);

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
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <span style={{
                width: '30px', height: '30px', borderRadius: '9px',
                background: 'linear-gradient(135deg, var(--accent), var(--c-slate))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f6bd95', flexShrink: 0,
                boxShadow: 'var(--shadow-sm)',
            }}><CoffeeIcon size={17} weight="fill" /></span>
            <span style={{ fontFamily: DISPLAY, fontSize: '21px', letterSpacing: '0.03em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>Silk Finance</span>
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
                padding: isNarrow ? '0 14px' : '0 22px',
                background: 'var(--glass-bg-strong)',
                backdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
                borderBottom: '1px solid var(--glass-border)',
            }}>
                {logo}

                {/* Desktop / tablet: centered icon nav */}
                {!isNarrow && (
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

                {/* Right side */}
                {isNarrow ? (
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

            {mounted && isNarrow && open && createPortal(menu, document.body)}
            {mounted && help && createPortal(<WeeklyLoop onClose={() => setHelp(false)} />, document.body)}
        </>
    );
}
