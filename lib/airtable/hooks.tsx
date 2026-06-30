'use client';

import React, { Suspense, useMemo } from 'react';
import useSWR from 'swr';
import { BaseModel, RecordModel, TableModel } from './models';
import { recordsKey, SCHEMA_KEY } from './keys';
import type { RawRecord } from './types';
import { MarqueeLoader } from '@/lib/components/MarqueeLoader';

export { FieldType } from './fieldTypes';
export type { FieldType as FieldTypeValue } from './fieldTypes';

const jsonFetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? body?.error ?? `Request failed (${res.status})`);
    }
    return res.json();
};

// Live-poll interval so AI / formula fields fill in without a manual refresh.
const RECORDS_REFRESH_MS = 6000;

/** Drop-in for the Blocks SDK `useBase()`. Suspends until the schema loads. */
export function useBase(): BaseModel {
    const { data } = useSWR(SCHEMA_KEY, jsonFetcher, { suspense: true, revalidateOnFocus: false });
    return useMemo(() => new BaseModel(data), [data]);
}

/** Drop-in for the Blocks SDK `useRecords(table)`. Suspends until records load. */
export function useRecords(table: TableModel | null | undefined): RecordModel[] {
    const tableId = table?.id;
    const { data } = useSWR(
        tableId ? recordsKey(tableId) : null,
        () => jsonFetcher(`/api/airtable/records/${tableId}`),
        { suspense: true, refreshInterval: RECORDS_REFRESH_MS },
    );
    return useMemo(
        () => (table ? ((data?.records as RawRecord[]) ?? []).map(r => new RecordModel(r, table)) : []),
        [data, table],
    );
}

// ── Boundary: catches load errors and shows the suspense fallback ──────────────
class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{
                    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '32px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    background: 'var(--page, #f4f4f5)', color: 'var(--text-primary, #1c1c1f)',
                }}>
                    <div style={{ maxWidth: '440px', textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
                            // Could not load data
                        </div>
                        <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-muted, #71717a)' }}>{this.state.error.message}</div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

/** Wrap any component that uses useBase/useRecords. */
export function AirtableBoundary({ children }: { children: React.ReactNode }) {
    return (
        <ErrorBoundary>
            <Suspense fallback={<MarqueeLoader />}>{children}</Suspense>
        </ErrorBoundary>
    );
}
