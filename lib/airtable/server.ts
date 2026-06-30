// Server-only Airtable helpers. The token lives here and never reaches the browser.
import { NextResponse } from 'next/server';

const DATA_API = 'https://api.airtable.com/v0';
const CONTENT_API = 'https://content.airtable.com/v0';

export function airtableEnv(): { token: string; baseId: string } {
    const token = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (!token || !baseId) {
        throw new Error('Airtable not configured: set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in your environment.');
    }
    return { token, baseId };
}

/** Forward a request to Airtable with the bearer token attached. */
export async function airtableFetch(
    path: string,
    init: RequestInit = {},
    opts: { content?: boolean } = {},
): Promise<Response> {
    const { token } = airtableEnv();
    const base = opts.content ? CONTENT_API : DATA_API;
    return fetch(`${base}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(init.headers ?? {}),
        },
        cache: 'no-store',
    });
}

/** Wrap a route handler so thrown errors become clean JSON instead of an HTML 500. */
export function jsonRoute<T extends unknown[]>(
    handler: (req: Request, ...rest: T) => Promise<NextResponse>,
) {
    return async (req: Request, ...rest: T): Promise<NextResponse> => {
        try {
            return await handler(req, ...rest);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unexpected server error.';
            return NextResponse.json({ error: message }, { status: 500 });
        }
    };
}

/** Relay an Airtable response (status + JSON body) straight back to the client. */
export async function relay(res: Response): Promise<NextResponse> {
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
}
