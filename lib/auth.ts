// Tiny signed-cookie session. Single shared password → HMAC-signed cookie.
// Runs in both the Edge middleware and Node route handlers (Web Crypto only).

export const COOKIE_NAME = 'cs_session';

const encoder = new TextEncoder();

function bytesToB64url(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return bytesToB64url(new Uint8Array(sig));
}

// Constant-time-ish string compare
function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function createSessionValue(secret: string): Promise<string> {
    const payload = bytesToB64url(encoder.encode(JSON.stringify({ iat: Date.now() })));
    const sig = await hmac(secret, payload);
    return `${payload}.${sig}`;
}

export async function verifySessionValue(value: string | undefined, secret: string): Promise<boolean> {
    if (!value || !secret) return false;
    const [payload, sig] = value.split('.');
    if (!payload || !sig) return false;
    const expected = await hmac(secret, payload);
    return safeEqual(sig, expected);
}
