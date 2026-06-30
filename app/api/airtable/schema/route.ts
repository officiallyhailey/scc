import { NextResponse } from 'next/server';
import { airtableEnv, airtableFetch, jsonRoute } from '@/lib/airtable/server';

// Base structure (table/field metadata) rarely changes, so cache it server-side
// to collapse the schema→records load waterfall. This is metadata only and sits
// behind the auth gate; it is NOT an HTTP/public cache. Per warm server instance.
// To pick up structural changes (e.g. a new single-select option), reload the app
// after the TTL — the client also holds the schema for the session.
const SCHEMA_TTL_MS = 10 * 60 * 1000; // 10 minutes
let schemaCache: { body: unknown; ts: number } | null = null;

// GET /api/airtable/schema → base tables + fields (metadata API)
export const GET = jsonRoute(async () => {
    if (schemaCache && Date.now() - schemaCache.ts < SCHEMA_TTL_MS) {
        return NextResponse.json(schemaCache.body);
    }
    const { baseId } = airtableEnv();
    const res = await airtableFetch(`/meta/bases/${baseId}/tables`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(body, { status: res.status });
    schemaCache = { body, ts: Date.now() };
    return NextResponse.json(body);
});
