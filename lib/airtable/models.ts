// Client-side stand-ins for the Blocks SDK's Base/Table/Field/Record objects.
// They expose the same method surface the ported interface relies on
// (getCellValue, getCellValueAsString, getFieldIfExists, createRecordAsync, …)
// but are backed by our REST proxy instead of Airtable's runtime.
import { mutate } from 'swr';
import { isComputedType, normalizeRead, normalizeString, normalizeWrite } from './normalize';
import { recordsKey } from './keys';
import type { RawField, RawRecord, RawSchema, RawTable } from './types';

export class FieldModel {
    id: string;
    name: string;
    type: string;
    options: RawField['options'];

    constructor(raw: RawField) {
        this.id = raw.id;
        this.name = raw.name;
        this.type = raw.type;
        this.options = raw.options;
    }

    get isComputed(): boolean {
        return isComputedType(this.type);
    }

    // Mirrors field.config.{type,options} used by the interface code.
    get config(): { type: string; options: RawField['options'] } {
        return { type: this.type, options: this.options };
    }
}

export class RecordModel {
    id: string;
    createdTime: string;
    private _fields: Record<string, unknown>;
    private _table: TableModel;

    constructor(raw: RawRecord, table: TableModel) {
        this.id = raw.id;
        this.createdTime = raw.createdTime;
        this._fields = raw.fields ?? {};
        this._table = table;
    }

    get name(): string {
        const pf = this._table.primaryField;
        return pf ? normalizeString(pf.type, this._fields[pf.id]) : '';
    }

    private resolve(field: FieldModel | string): FieldModel | null {
        return typeof field === 'string' ? this._table.getFieldIfExists(field) : field;
    }

    getCellValue(field: FieldModel | string): unknown {
        const f = this.resolve(field);
        return f ? normalizeRead(f.type, this._fields[f.id]) : null;
    }

    getCellValueAsString(field: FieldModel | string): string {
        const f = this.resolve(field);
        return f ? normalizeString(f.type, this._fields[f.id]) : '';
    }
}

type AttachmentUpload = { fieldId: string; files: File[] };

export class TableModel {
    id: string;
    name: string;
    primaryFieldId: string;
    fields: FieldModel[];

    constructor(raw: RawTable) {
        this.id = raw.id;
        this.name = raw.name;
        this.primaryFieldId = raw.primaryFieldId;
        this.fields = raw.fields.map(f => new FieldModel(f));
    }

    getFieldIfExists(id: string): FieldModel | null {
        return this.fields.find(f => f.id === id) ?? null;
    }

    get primaryField(): FieldModel | null {
        return this.getFieldIfExists(this.primaryFieldId);
    }

    private revalidate() {
        return mutate(recordsKey(this.id));
    }

    // Split out attachment fields carrying browser File objects (SDK style:
    // [{ file }]) — REST can't take those inline, they go via uploadAttachment.
    private partition(input: Record<string, unknown>): {
        writeFields: Record<string, unknown>;
        uploads: AttachmentUpload[];
    } {
        const writeFields: Record<string, unknown> = {};
        const uploads: AttachmentUpload[] = [];
        for (const [fieldId, value] of Object.entries(input)) {
            const f = this.getFieldIfExists(fieldId);
            if (f?.type === 'multipleAttachments' && Array.isArray(value)) {
                // The array is the full desired set: already-saved attachments to keep
                // ({id,url,…} objects) + new browser File objects. Write the kept set as
                // {id} (PATCH happens before uploads, so dropped ones are removed), then
                // upload the new files (the upload endpoint appends them).
                const files = value
                    .filter(v => (v as { file?: unknown })?.file instanceof File)
                    .map(v => (v as { file: File }).file);
                const keep = value
                    .filter(v => v && !((v as { file?: unknown }).file instanceof File) && (v as { id?: string }).id)
                    .map(v => ({ id: (v as { id: string }).id }));
                writeFields[fieldId] = keep;
                if (files.length > 0) uploads.push({ fieldId, files });
            } else {
                writeFields[fieldId] = f ? normalizeWrite(f.type, value) : value;
            }
        }
        return { writeFields, uploads };
    }

    async createRecordAsync(fields: Record<string, unknown>): Promise<string> {
        const { writeFields, uploads } = this.partition(fields);
        const res = await fetch(`/api/airtable/records/${this.id}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fields: writeFields }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errMessage(body) ?? 'Could not create record.');
        const id: string = body.id;
        await this.runUploads(id, uploads);
        await this.revalidate();
        return id;
    }

    async updateRecordAsync(record: RecordModel | string, updates: Record<string, unknown>): Promise<void> {
        const id = typeof record === 'string' ? record : record.id;
        const { writeFields, uploads } = this.partition(updates);
        if (Object.keys(writeFields).length > 0) {
            const res = await fetch(`/api/airtable/records/${this.id}/${id}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ fields: writeFields }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(errMessage(body) ?? 'Save failed — check field permissions.');
        }
        await this.runUploads(id, uploads);
        await this.revalidate();
    }

    async deleteRecordAsync(record: RecordModel | string): Promise<void> {
        const id = typeof record === 'string' ? record : record.id;
        const res = await fetch(`/api/airtable/records/${this.id}/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(errMessage(body) ?? 'Delete failed.');
        }
        await this.revalidate();
    }

    private async runUploads(recordId: string, uploads: AttachmentUpload[]): Promise<void> {
        for (const up of uploads) {
            for (const file of up.files) {
                const base64 = await fileToBase64(file);
                const res = await fetch(`/api/airtable/upload/${recordId}/${up.fieldId}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        contentType: file.type || 'application/octet-stream',
                        filename: file.name,
                        file: base64,
                    }),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(errMessage(body) ?? `Could not upload ${file.name}.`);
                }
            }
        }
    }
}

export class BaseModel {
    tables: TableModel[];
    constructor(raw: RawSchema) {
        this.tables = (raw.tables ?? []).map(t => new TableModel(t));
    }
}

function errMessage(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const b = body as { error?: unknown };
    if (typeof b.error === 'string') return b.error;
    if (b.error && typeof b.error === 'object') {
        const m = (b.error as { message?: unknown }).message;
        if (typeof m === 'string') return m;
    }
    return undefined;
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] ?? '');
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
