'use client';

// Shared form-field components for the detail drawers (Expenses, Sales, Inventory).
// Previously each drawer carried its own copies of these; they're unified here.
// Glass styling comes from `ui.tsx`; values are plain strings / string[] of record IDs.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { XIcon, CaretDownIcon, CheckIcon } from '@phosphor-icons/react';
import type { RecordModel } from '@/lib/airtable/models';
import { inputStyle, Pill, MONO } from '@/lib/components/ui';

// ── labelled wrapper ──────────────────────────────────────────────────────────
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'block' }}>
            <div style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
            {children}
        </label>
    );
}

// ── native single-select ───────────────────────────────────────────────────────
export function PlainSelect({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );
}

// ── auto-growing textarea (e.g. order description) ──────────────────────────────
export function AutoTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const grow = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };
    useEffect(() => { grow(ref.current); }, [value]);
    return (
        <textarea ref={ref} value={value} rows={2}
            onChange={e => { onChange(e.target.value); grow(e.target); }}
            style={{ ...inputStyle, resize: 'none', overflow: 'hidden', lineHeight: 1.5, minHeight: '44px' }} />
    );
}

// ── multi-select shown as a dropdown checklist (closed: chips; open: checkboxes) ──
export function MultiSelectDropdown({ options, value, onChange, placeholder }: { options: string[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minHeight: '40px', textAlign: 'left' }}>
                {value.length === 0
                    ? <span style={{ color: 'var(--text-muted)' }}>{placeholder ?? 'Select…'}</span>
                    : value.map(c => <Pill key={c} text={c} tone="olive" />)}
                <CaretDownIcon size={14} weight="bold" style={{ marginLeft: 'auto', color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }} />
            </button>
            {open && (
                <div style={dropdown}>
                    {options.map(o => {
                        const on = value.includes(o);
                        return (
                            <div key={o} onClick={() => toggle(o)} style={{ ...dropItem, display: 'flex', alignItems: 'center', gap: '9px', color: on ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: on ? 700 : 500 }}>
                                <span style={{ width: '17px', height: '17px', borderRadius: '5px', border: '1px solid var(--hairline)', background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {on && <CheckIcon size={12} weight="bold" color="var(--accent-text)" />}
                                </span>
                                {o}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── searchable single linked-record picker (stores [id]) ────────────────────────
export function LinkPicker({ options, names, value, onChange, placeholder }: { options: RecordModel[]; names: Map<string, string>; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const current = value[0];
    const matches = useMemo(() => {
        const n = q.trim().toLowerCase();
        return options.filter(o => (n ? (names.get(o.id) ?? '').toLowerCase().includes(n) : true)).slice(0, 40);
    }, [q, options, names]);

    if (current && !open) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...inputStyle, padding: '8px 10px' }}>
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>{names.get(current) ?? current}</span>
                <button onMouseDown={() => onChange([])} style={iconBtnSm} aria-label="Remove"><XIcon size={13} weight="bold" /></button>
            </div>
        );
    }
    return (
        <div style={{ position: 'relative' }}>
            <input value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={e => setQ(e.target.value)} style={inputStyle} />
            {open && matches.length > 0 && (
                <div style={dropdown}>{matches.map(o => <div key={o.id} onMouseDown={() => { onChange([o.id]); setOpen(false); setQ(''); }} style={dropItem}>{names.get(o.id) ?? '(untitled)'}</div>)}</div>
            )}
        </div>
    );
}

// ── searchable multi linked-record picker (stores [id, …]) ──────────────────────
export function MultiLinkPicker({ options, names, value, onChange, placeholder }: { options: RecordModel[]; names: Map<string, string>; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const matches = useMemo(() => {
        const n = q.trim().toLowerCase();
        return options.filter(o => !value.includes(o.id) && (n ? (names.get(o.id) ?? '').toLowerCase().includes(n) : true)).slice(0, 40);
    }, [q, options, names, value]);
    return (
        <div style={{ position: 'relative' }}>
            <div style={{ ...inputStyle, display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', minHeight: '40px' }}>
                {value.map(id => (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 4px 2px 9px', borderRadius: '999px', background: 'rgba(113,122,73,0.18)', color: '#5c6539', fontSize: '12px', fontWeight: 700 }}>
                        {names.get(id) ?? id}
                        <button onMouseDown={() => onChange(value.filter(x => x !== id))} style={{ ...iconBtnSm, width: '18px', height: '18px' }} aria-label="Remove"><XIcon size={11} weight="bold" /></button>
                    </span>
                ))}
                <input value={q} placeholder={value.length ? '' : placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={e => { setQ(e.target.value); setOpen(true); }} style={{ flex: 1, minWidth: '80px', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)' }} />
            </div>
            {open && matches.length > 0 && (
                <div style={dropdown}>{matches.map(o => <div key={o.id} onMouseDown={() => { onChange([...value, o.id]); setQ(''); }} style={dropItem}>{names.get(o.id) ?? '(untitled)'}</div>)}</div>
            )}
        </div>
    );
}

// ── shared styles ───────────────────────────────────────────────────────────
export const iconBtn: React.CSSProperties = { width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
export const iconBtnSm: React.CSSProperties = { width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: 'rgba(50,70,79,0.10)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
export const dropdown: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, maxHeight: '260px', overflowY: 'auto', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg-strong)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow)' };
export const dropItem: React.CSSProperties = { padding: '9px 12px', fontSize: '13.5px', color: 'var(--text-primary)', cursor: 'pointer', borderBottom: '1px solid var(--hairline)' };
