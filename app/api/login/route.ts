import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE_NAME, createSessionValue } from '@/lib/auth';

export async function POST(req: Request) {
    const expected = process.env.APP_PASSWORD;
    const secret = process.env.SESSION_SECRET;
    if (!expected || !secret) {
        return NextResponse.json(
            { error: 'Server not configured: set APP_PASSWORD and SESSION_SECRET.' },
            { status: 500 },
        );
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body.password !== 'string' || body.password !== expected) {
        return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    }

    const value = await createSessionValue(secret);
    const jar = await cookies();
    jar.set(COOKIE_NAME, value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return NextResponse.json({ ok: true });
}

export async function DELETE() {
    const jar = await cookies();
    jar.delete(COOKIE_NAME);
    return NextResponse.json({ ok: true });
}
