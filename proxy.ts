// Next.js 16 renamed `middleware` → `proxy` (runs on the Node runtime).
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_NAME, verifySessionValue } from '@/lib/auth';

// Paths that never need auth (the login page + its API, plus public assets).
const ALWAYS_ALLOW = ['/login', '/api/login', '/manifest.webmanifest', '/icon.svg'];

export async function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (ALWAYS_ALLOW.some(p => pathname === p || pathname.startsWith(p + '/'))) {
        return NextResponse.next();
    }

    const ok = await verifySessionValue(
        req.cookies.get(COOKIE_NAME)?.value,
        process.env.SESSION_SECRET ?? '',
    );
    if (ok) return NextResponse.next();

    // Unauthenticated: API calls get a 401, page loads get redirected to /login.
    if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg).*)'],
};
