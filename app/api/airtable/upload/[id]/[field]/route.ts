import { airtableEnv, airtableFetch, jsonRoute, relay } from '@/lib/airtable/server';

type Ctx = { params: Promise<{ id: string; field: string }> };

// POST /api/airtable/upload/:recordId/:fieldId → upload a base64 attachment
// (Airtable content API; the SDK accepted File objects, REST needs base64.)
export const POST = jsonRoute(async (req: Request, { params }: Ctx) => {
    const { id, field } = await params;
    const { baseId } = airtableEnv();
    const { contentType, file, filename } = await req.json();
    const res = await airtableFetch(
        `/${baseId}/${id}/${field}/uploadAttachment`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ contentType, file, filename }),
        },
        { content: true },
    );
    return relay(res);
});
