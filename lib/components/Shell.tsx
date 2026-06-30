'use client';

import React from 'react';
import { TopNav } from './TopNav';
import { ScrollProgress } from './ScrollProgress';
import { IdleTimeout } from './IdleTimeout';

/**
 * App shell for the full-screen interfaces: glass top nav above a
 * height-constrained main region. The interface inside should use height:100%
 * (not 100vh) so it fills the area left below the nav. IdleTimeout signs the
 * user out after inactivity (warns at 12 min, logs out at 15).
 */
export function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'transparent' }}>
            <ScrollProgress />
            <TopNav />
            <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
                {children}
            </main>
            <IdleTimeout />
        </div>
    );
}
