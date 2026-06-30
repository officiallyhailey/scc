// Raw shapes returned by the Airtable REST API (via our proxy).
export interface RawField {
    id: string;
    name: string;
    type: string;
    options?: { choices?: Array<{ id: string; name: string; color?: string }> } & Record<string, unknown>;
}

export interface RawTable {
    id: string;
    name: string;
    primaryFieldId: string;
    fields: RawField[];
}

export interface RawSchema {
    tables: RawTable[];
}

export interface RawRecord {
    id: string;
    createdTime: string;
    fields: Record<string, unknown>;
}
