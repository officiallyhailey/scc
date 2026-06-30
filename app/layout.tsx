import type { Metadata, Viewport } from 'next';
import './globals.css';
import './theme.css';
import { anton, montserrat } from './fonts';

export const metadata: Metadata = {
    title: 'Silk Finance',
    description: 'Silk City Coffee — upload invoices & statements, review expenses, run weekly reports.',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Silk Finance',
    },
    icons: {
        icon: '/logo.png',
        apple: '/logo.png',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    // Keep the whole page in view: stop iOS from zooming when a field is focused
    // and the keyboard appears.
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#eef0ee' },
        { media: '(prefers-color-scheme: dark)', color: '#1a2429' },
    ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${anton.variable} ${montserrat.variable}`}>
            <body>{children}</body>
        </html>
    );
}
