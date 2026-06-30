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

// ── multi-select FILTER (filter bar): {value,label} options, optional search ─────
// Closed: shows the active count / single label / an "all" placeholder. Open: a
// checkbox list (with a search box for long lists) + a "Clear" row. An empty
// selection means "no filter" (all rows). Values can include a '__none__' sentinel
// that callers treat as "this field is blank".
export function MultiFilter({
    allLabel, options, value, onChange, searchable,
}: {
    allLabel: string; options: { value: string; label: string }[];
    value: string[]; onChange: (v: string[]) => void; searchable?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
    const label = value.length === 0 ? allLabel
        : value.length === 1 ? (options.find(o => o.value === value[0])?.label ?? '1 selected')
        : `${value.length} selected`;
    const shown = searchable && q.trim()
        ? options.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase()))
        : options;
    return (
        <div ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
            <button type="button" onClick={() => setOpen(o => !o)}
                style={{ ...inputStyle, width: 'auto', maxWidth: '210px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', textAlign: 'left' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value.length ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: value.length ? 700 : 400 }}>{label}</span>
                <CaretDownIcon size={14} weight="bold" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }} />
            </button>
            {open && (
                <div style={{ ...dropdown, right: 'auto', minWidth: '230px' }}>
                    {searchable && (
                        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                            style={{ ...inputStyle, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--hairline)' }} />
                    )}
                    {value.length > 0 && (
                        <div onClick={() => onChange([])} style={{ ...dropItem, fontSize: '12px', fontWeight: 700, color: 'var(--accent-deep)' }}>Clear selection</div>
                    )}
                    {shown.map(o => {
                        const on = value.includes(o.value);
                        return (
                            <div key={o.value} onClick={() => toggle(o.value)} style={{ ...dropItem, display: 'flex', alignItems: 'center', gap: '9px', color: on ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: on ? 700 : 500 }}>
                                <span style={{ width: '17px', height: '17px', borderRadius: '5px', border: '1px solid var(--hairline)', background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {on && <CheckIcon size={12} weight="bold" color="var(--accent-text)" />}
                                </span>
                                {o.label}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── searchable single linked-record picker (stores [id]) ────────────────────────
// `onCreate` (optional): when the typed name matches nothing, offer to create the record
// (e.g. a new vendor) and link it. Returns the new id (or null on failure).
export function LinkPicker({ options, names, value, onChange, placeholder, onCreate }: { options: RecordModel[]; names: Map<string, string>; value: string[]; onChange: (v: string[]) => void; placeholder?: string; onCreate?: (name: string) => Promise<string | null> }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const current = value[0];
    const matches = useMemo(() => {
        const n = q.trim().toLowerCase();
        return options.filter(o => (n ? (names.get(o.id) ?? '').toLowerCase().includes(n) : true)).slice(0, 40);
    }, [q, options, names]);
    const trimmed = q.trim();
    const exact = options.some(o => (names.get(o.id) ?? '').trim().toLowerCase() === trimmed.toLowerCase());
    const showCreate = !!onCreate && trimmed.length > 0 && !exact;
    async function create() {
        if (!onCreate || creating) return;
        setCreating(true);
        const id = await onCreate(trimmed);
        setCreating(false);
        if (id) onChange([id]);
        setOpen(false); setQ('');
    }

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
            {open && (matches.length > 0 || showCreate) && (
                <div style={dropdown}>
                    {matches.map(o => <div key={o.id} onMouseDown={() => { onChange([o.id]); setOpen(false); setQ(''); }} style={dropItem}>{names.get(o.id) ?? '(untitled)'}</div>)}
                    {showCreate && <div onMouseDown={create} style={{ ...dropItem, color: 'var(--accent-deep)', fontWeight: 700 }}>{creating ? 'Adding…' : `+ Add “${trimmed}”`}</div>}
                </div>
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

// ── inline editors for list rows (edit without opening the drawer) ──────────────
// Compact chip that opens a popover; stops click propagation so the row's own
// onClick (open drawer) doesn't fire. `onToggle` lets the parent row lift its
// z-index while open so the popover isn't covered by later rows.
const inlineChip: React.CSSProperties = {
    position: 'relative', overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '200px',
    padding: '3px 8px', borderRadius: '7px', border: '1px solid var(--hairline)',
    background: 'var(--glass-bg)', cursor: 'pointer', fontFamily: 'var(--font-body)',
    fontSize: '12px', fontWeight: 600, lineHeight: 1.55,
};
const ellip: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// single linked-record (Vendor, Location, Inventory): searchable popover, stores [id].
// `fill` makes the chip stretch to its container width (for aligned grid columns).
export function InlineLink({ value, names, options, placeholder, onChange, onToggle, saving, fill, onCreate }: {
    value: string[]; names: Map<string, string>; options: RecordModel[]; placeholder: string;
    onChange: (v: string[]) => void; onToggle?: (open: boolean) => void; saving?: boolean; fill?: boolean;
    onCreate?: (name: string) => Promise<string | null>;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [creating, setCreating] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { onToggle?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    const current = value[0];
    const matches = useMemo(() => {
        const n = q.trim().toLowerCase();
        return options.filter(o => (n ? (names.get(o.id) ?? '').toLowerCase().includes(n) : true)).slice(0, 40);
    }, [q, options, names]);
    const trimmed = q.trim();
    const exact = options.some(o => (names.get(o.id) ?? '').trim().toLowerCase() === trimmed.toLowerCase());
    const showCreate = !!onCreate && trimmed.length > 0 && !exact;
    async function create() {
        if (!onCreate || creating) return;
        setCreating(true);
        const id = await onCreate(trimmed);
        setCreating(false);
        if (id) onChange([id]);
        setOpen(false); setQ('');
    }
    return (
        <div ref={ref} style={{ position: 'relative', width: fill ? '100%' : undefined, minWidth: 0 }} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inlineChip, maxWidth: fill ? undefined : '200px', width: fill ? '100%' : undefined, opacity: saving ? 0.7 : 1, color: current ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                <span style={{ ...ellip, ...(fill ? { flex: 1, minWidth: 0 } : {}) }}>{current ? (names.get(current) ?? '(item)') : `+ ${placeholder}`}</span>
                <CaretDownIcon size={11} weight="bold" style={{ opacity: 0.55, flexShrink: 0 }} />
                {saving && <span className="dd-savebar" aria-hidden />}
            </button>
            {open && (
                <div style={{ ...dropdown, right: 'auto', minWidth: '210px' }}>
                    <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${placeholder.toLowerCase()}…`} style={{ ...inputStyle, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--hairline)' }} />
                    {current && <div onClick={() => { onChange([]); setOpen(false); }} style={{ ...dropItem, fontSize: '12px', fontWeight: 700, color: 'var(--accent-deep)' }}>Clear</div>}
                    {matches.map(o => <div key={o.id} onClick={() => { onChange([o.id]); setOpen(false); setQ(''); }} style={dropItem}>{names.get(o.id) ?? '(untitled)'}</div>)}
                    {showCreate && <div onClick={create} style={{ ...dropItem, color: 'var(--accent-deep)', fontWeight: 700 }}>{creating ? 'Adding…' : `+ Add “${trimmed}”`}</div>}
                </div>
            )}
        </div>
    );
}

// multi-select choices (Category): checkbox popover, stays open while toggling.
export function InlineMulti({ value, options, onChange, placeholder, onToggle, saving, fill }: {
    value: string[]; options: string[]; onChange: (v: string[]) => void; placeholder: string;
    onToggle?: (open: boolean) => void; saving?: boolean; fill?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { onToggle?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
    return (
        <div ref={ref} style={{ position: 'relative', width: fill ? '100%' : undefined, minWidth: 0 }} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inlineChip, maxWidth: fill ? undefined : '200px', width: fill ? '100%' : undefined, opacity: saving ? 0.7 : 1, color: value.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                <span style={{ ...ellip, ...(fill ? { flex: 1, minWidth: 0 } : {}) }}>{value.length ? value.join(', ') : `+ ${placeholder}`}</span>
                <CaretDownIcon size={11} weight="bold" style={{ opacity: 0.55, flexShrink: 0 }} />
                {saving && <span className="dd-savebar" aria-hidden />}
            </button>
            {open && (
                <div style={{ ...dropdown, right: 'auto', minWidth: '200px' }}>
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

// single-select choice (Department, Type): popover list, stores a string ('' clears it).
export function InlineSelect({ value, options, placeholder, onChange, onToggle, saving, fill }: {
    value: string; options: string[]; placeholder: string;
    onChange: (v: string) => void; onToggle?: (open: boolean) => void; saving?: boolean; fill?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { onToggle?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    return (
        <div ref={ref} style={{ position: 'relative', width: fill ? '100%' : undefined, minWidth: 0 }} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inlineChip, maxWidth: fill ? undefined : '200px', width: fill ? '100%' : undefined, opacity: saving ? 0.7 : 1, color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                <span style={{ ...ellip, ...(fill ? { flex: 1, minWidth: 0 } : {}) }}>{value || `+ ${placeholder}`}</span>
                <CaretDownIcon size={11} weight="bold" style={{ opacity: 0.55, flexShrink: 0 }} />
                {saving && <span className="dd-savebar" aria-hidden />}
            </button>
            {open && (
                <div style={{ ...dropdown, right: 'auto', minWidth: '180px' }}>
                    {value && <div onClick={() => { onChange(''); setOpen(false); }} style={{ ...dropItem, fontSize: '12px', fontWeight: 700, color: 'var(--accent-deep)' }}>Clear</div>}
                    {options.map(o => (
                        <div key={o} onClick={() => { onChange(o); setOpen(false); }} style={{ ...dropItem, color: o === value ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: o === value ? 700 : 500 }}>{o}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

// multi linked-record (Tracking Locations): searchable checkbox popover, stores [id, …].
export function InlineMultiLink({ value, names, options, placeholder, onChange, onToggle, saving, fill }: {
    value: string[]; names: Map<string, string>; options: RecordModel[]; placeholder: string;
    onChange: (v: string[]) => void; onToggle?: (open: boolean) => void; saving?: boolean; fill?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { onToggle?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
    const matches = useMemo(() => {
        const n = q.trim().toLowerCase();
        return options.filter(o => (n ? (names.get(o.id) ?? '').toLowerCase().includes(n) : true)).slice(0, 40);
    }, [q, options, names]);
    return (
        <div ref={ref} style={{ position: 'relative', width: fill ? '100%' : undefined, minWidth: 0 }} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(o => !o)} style={{ ...inlineChip, maxWidth: fill ? undefined : '200px', width: fill ? '100%' : undefined, opacity: saving ? 0.7 : 1, color: value.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                <span style={{ ...ellip, ...(fill ? { flex: 1, minWidth: 0 } : {}) }}>{value.length ? value.map(id => names.get(id) ?? '?').join(', ') : `+ ${placeholder}`}</span>
                <CaretDownIcon size={11} weight="bold" style={{ opacity: 0.55, flexShrink: 0 }} />
                {saving && <span className="dd-savebar" aria-hidden />}
            </button>
            {open && (
                <div style={{ ...dropdown, right: 'auto', minWidth: '210px' }}>
                    <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${placeholder.toLowerCase()}…`} style={{ ...inputStyle, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--hairline)' }} />
                    {matches.map(o => {
                        const on = value.includes(o.id);
                        return (
                            <div key={o.id} onClick={() => toggle(o.id)} style={{ ...dropItem, display: 'flex', alignItems: 'center', gap: '9px', color: on ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: on ? 700 : 500 }}>
                                <span style={{ width: '17px', height: '17px', borderRadius: '5px', border: '1px solid var(--hairline)', background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {on && <CheckIcon size={12} weight="bold" color="var(--accent-text)" />}
                                </span>
                                {names.get(o.id) ?? '(untitled)'}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── shared styles ───────────────────────────────────────────────────────────
export const iconBtn: React.CSSProperties = { width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
export const iconBtnSm: React.CSSProperties = { width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: 'rgba(50,70,79,0.10)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
export const dropdown: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, maxHeight: '260px', overflowY: 'auto', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg-strong)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', boxShadow: 'var(--shadow)' };
export const dropItem: React.CSSProperties = { padding: '9px 12px', fontSize: '13.5px', color: 'var(--text-primary)', cursor: 'pointer', borderBottom: '1px solid var(--hairline)' };
