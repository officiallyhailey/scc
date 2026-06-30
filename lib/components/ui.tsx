'use client';

/**
 * Shared glassmorphism UI primitives for the Silk Finance pages.
 * Frosted translucent surfaces, soft shadows, rounded corners, palette accents.
 */
import React from 'react';

// Minimal scheme: gold accent + slate ink. The old palette names are kept and
// remapped so existing usages restyle automatically (olive→slate, rust→amber).
export const PALETTE = {
    mist: '#8a979c',   // muted slate-grey
    olive: '#32464f',  // → slate (category pills / markers)
    slate: '#32464f',
    sand: '#ecd1be',
    rust: '#b58a3a',   // → deep amber (the only attention tone)
    gold: '#d8b358',
    peach: '#f6bd95',
} as const;

export const DISPLAY = 'var(--font-display)';
export const BODY = 'var(--font-body)';
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Core frosted-glass surface style. */
export function glass(opts: { strong?: boolean; soft?: boolean; radius?: number | string } = {}): React.CSSProperties {
    const bg = opts.strong ? 'var(--glass-bg-strong)' : opts.soft ? 'var(--glass-bg-soft)' : 'var(--glass-bg)';
    return {
        background: bg,
        backdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
        border: '1px solid var(--glass-border)',
        borderRadius: typeof opts.radius === 'number' ? `${opts.radius}px` : (opts.radius ?? 'var(--radius)'),
        boxShadow: 'var(--shadow)',
    };
}

export function GlassCard({
    children, style, onClick, hover,
}: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void; hover?: boolean }) {
    return (
        <div
            onClick={onClick}
            style={{ ...glass(), padding: '18px', ...style }}
            onMouseEnter={hover ? e => { e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; e.currentTarget.style.transform = 'translateY(-2px)'; } : undefined}
            onMouseLeave={hover ? e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'none'; } : undefined}
        >
            {children}
        </div>
    );
}

export const monoLabel: React.CSSProperties = {
    fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
};

/** Small rounded pill / chip. */
export function Pill({ text, tone = 'neutral', style }: { text: string; tone?: 'neutral' | 'olive' | 'rust' | 'gold' | 'mist' | 'slate'; style?: React.CSSProperties }) {
    const tones: Record<string, { bg: string; fg: string }> = {
        neutral: { bg: 'rgba(50,70,79,0.08)', fg: 'var(--text-muted)' },
        olive: { bg: 'rgba(50,70,79,0.10)', fg: '#32464f' },   // slate category pill
        rust: { bg: 'rgba(181,138,58,0.18)', fg: '#8f6c20' },  // amber attention
        gold: { bg: 'rgba(216,179,88,0.24)', fg: '#9a7d27' },
        mist: { bg: 'rgba(50,70,79,0.07)', fg: 'var(--text-muted)' },
        slate: { bg: 'rgba(50,70,79,0.13)', fg: '#32464f' },
    };
    const t = tones[tone] ?? tones.neutral;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px',
            borderRadius: '999px', background: t.bg, color: t.fg,
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.01em', whiteSpace: 'nowrap', ...style,
        }}>{text}</span>
    );
}

export const STATUS_TONE: Record<string, 'mist' | 'olive' | 'gold'> = {
    Submitted: 'mist',
    Approved: 'olive',
    Processed: 'gold',
};

/** Glass input. */
export const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 13px', fontSize: '14px', color: 'var(--text-primary)',
    background: 'var(--glass-bg-soft)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)',
    outline: 'none', fontFamily: BODY, boxSizing: 'border-box',
};

/** Currency input — a leading "$" marks it as a money field (vs. a plain number). */
export function MoneyInput({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
    return (
        <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-deep)', fontSize: '14px', fontWeight: 700, pointerEvents: 'none' }}>$</span>
            <input inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, paddingLeft: '24px', ...style }} />
        </div>
    );
}

/** Primary / ghost button. */
export function Button({
    children, onClick, variant = 'primary', disabled, type = 'button', style,
}: {
    children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'rust';
    disabled?: boolean; type?: 'button' | 'submit'; style?: React.CSSProperties;
}) {
    const base: React.CSSProperties = {
        padding: '10px 18px', borderRadius: 'var(--radius-sm)', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: BODY, fontSize: '13px', fontWeight: 700, letterSpacing: '0.02em',
        border: '1px solid transparent', opacity: disabled ? 0.55 : 1, transition: 'filter .12s, transform .12s',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    };
    const variants: Record<string, React.CSSProperties> = {
        primary: { background: 'var(--accent)', color: 'var(--accent-text)', boxShadow: 'var(--shadow-sm)' },
        rust: { background: 'var(--accent-2)', color: '#fff' },
        ghost: { background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' },
    };
    return (
        <button type={type} onClick={onClick} disabled={disabled}
            style={{ ...base, ...variants[variant], ...style }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = 'brightness(1.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
        >{children}</button>
    );
}
