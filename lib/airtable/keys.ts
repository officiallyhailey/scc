// SWR cache keys, shared between hooks (read) and models (revalidate-after-write).
export const SCHEMA_KEY = '/api/airtable/schema';
export const recordsKey = (tableId: string) => ['airtable-records', tableId] as const;
