import { airtableEnv, airtableFetch, jsonRoute, relay } from '@/lib/airtable/server';

type Ctx = { params: Promise<{ table: string; id: string }> };

// PATCH /api/airtable/records/:table/:id → update one record
export const PATCH = jsonRoute(async (req: Request, { params }: Ctx) => {
    const { table, id } = await params;
    const { baseId } = airtableEnv();
    const { fields } = await req.json();
    const res = await airtableFetch(`/${baseId}/${encodeURIComponent(table)}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields, returnFieldsByFieldId: true, typecast: true }),
    });
    return relay(res);
});

// DELETE /api/airtable/records/:table/:id → delete one record
export const DELETE = jsonRoute(async (_req: Request, { params }: Ctx) => {
    const { table, id } = await params;
    const { baseId } = airtableEnv();
    const res = await airtableFetch(`/${baseId}/${encodeURIComponent(table)}/${id}`, {
        method: 'DELETE',
    });
    return relay(res);
});
