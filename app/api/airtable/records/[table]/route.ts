import { NextResponse } from 'next/server';
import { airtableEnv, airtableFetch, jsonRoute, relay } from '@/lib/airtable/server';
import { FIELD_PROJECTION } from '@/lib/airtable/projection';

type Ctx = { params: Promise<{ table: string }> };

// GET /api/airtable/records/:table → all records (follows offset pagination)
export const GET = jsonRoute(async (_req: Request, { params }: Ctx) => {
    const { table } = await params;
    const { baseId } = airtableEnv();

    // Fetch only the fields this table's interface uses, when known.
    const projection = FIELD_PROJECTION[table];

    const records: unknown[] = [];
    let offset: string | undefined;
    do {
        const qs = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' });
        if (projection) for (const fieldId of projection) qs.append('fields[]', fieldId);
        if (offset) qs.set('offset', offset);
        const res = await airtableFetch(`/${baseId}/${encodeURIComponent(table)}?${qs.toString()}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return NextResponse.json(body, { status: res.status });
        records.push(...(body.records ?? []));
        offset = body.offset;
    } while (offset);

    return NextResponse.json({ records });
});

// POST /api/airtable/records/:table → create one record
export const POST = jsonRoute(async (req: Request, { params }: Ctx) => {
    const { table } = await params;
    const { baseId } = airtableEnv();
    const { fields } = await req.json();
    const res = await airtableFetch(`/${baseId}/${encodeURIComponent(table)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields, returnFieldsByFieldId: true, typecast: true }),
    });
    return relay(res);
});
