import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { jsonRoute } from '@/lib/airtable/server';
import { CATEGORY_CHOICES, BANK_CHOICES, CARD_CHOICES } from '@/lib/silk/schema';

// Parse one uploaded invoice / receipt / bank statement into expense line items.
// Mirrors the /expense-report skill's extraction: it reads the document, pulls
// each purchasable line, and maps it onto the Expenses table's fields. The model
// is forced to answer through a tool so we always get structured JSON back.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

const SYSTEM = `You are the unattended bookkeeping parser for Silk City Coffee (Manchester "763", Willimantic "869"), mirroring the /expense-report skill. Read one uploaded invoice, receipt, vendor CSV, or bank/credit-card statement and extract every purchase line for the Airtable "Expenses" table. Run unattended — never ask questions; note any uncertainty.

LINE FIELDS
- One row per line item (invoices/CSVs); one row per transaction (statements).
- "item": concise name, ≤4 words, Title Case, no commas. "orderDescription": the full item title, no commas. "lineItem": SKU / item / line number.
- "unitQty": packages/cases. "unitPrice": price per unit/case. "totalAmount": the line total. If only a total shows, unitQty=1, unitPrice=totalAmount. "perUnit": pack size (items per case), default 1. "unitOfMeasure" ∈ LB/ea/oz/gal/dozen/in.
- "date": ISO YYYY-MM-DD (convert M/D/YYYY). One document date → use for every row.
- "vendor": the merchant/supplier. Prefer the CANONICAL name when recognizable: Webstaurant Store, SYSCO, Imperial Dade, Cintas, Mountain Dairy, Amazon, Adagio Teas, Apex, Chase, Royal Tea New York, Barista Underground. Do NOT invent a vendor — if it isn't clearly one of these (or another obvious known supplier), leave vendor empty. (The app links only existing vendors and NEVER creates new vendor records.)
- "invoice": invoice/order number. "location": "763" or "869" from the ship-to address/account (omit when not derivable — bank rows, Amazon).
- "category": best-fit tags (Bar, Kitchen, Coffee Beans, Supplies, Shipping, Fees, Utilities) only when clearly warranted; otherwise omit.

TAX & SHIPPING ARE THEIR OWN ROWS (never fold into another line)
- Shipping / freight / fuel surcharge > $0 → a row with item="Shipping", orderDescription = the raw charge text, totalAmount = the charge.
- Sales tax charged → a row with item="Tax", totalAmount = the invoice's tax total (this keeps the line totals summing to the balance due).

VENDOR RULES
- Sysco (CSV): location from Ship-To account — 760629→763, 802113→869. Skip rows with Current Quantity = 0; keep refunds (negative totals). Fuel surcharge → a Shipping row.
- Amazon (CSV): include ALL rows; invoice = Order ID; no location; unitPrice = Purchase PPU; totalAmount = Item Net Total.
- Royal Tea New York / Adagio Teas / Barista Underground: by-weight items use unitOfMeasure "LB", perUnit 1. Adagio: skip qty=0 and points-redeemed rows.
- Imperial Dade: map case (CS) to the item unit (gloves → ea); skip QUANTITY SHIPPED = 0; tax as its own row.
- Bank / card statements (Chase / Webster / Amex): NO vendor, NO location, NO invoice. Each charge is an expense — output totalAmount POSITIVE; SKIP payments, statement credits, and any positive/credit amount. Set "bank" to the issuer and "cardRaw" to the last 4 as printed; set "card" only when that last-4 is an allowed option.

GENERIC CSV/SPREADSHEET: treat every data row with an item + amount as a line; skip header/total rows; when unsure, INCLUDE rather than skip.

If you extract zero line items, you MUST fill the "note" field with why. Return your answer ONLY by calling the record_line_items tool.`;

const TOOL: Anthropic.Tool = {
    name: 'record_line_items',
    description: 'Record the extracted expense line items from the document.',
    input_schema: {
        type: 'object',
        properties: {
            documentType: { type: 'string', enum: ['invoice', 'receipt', 'bank_statement', 'card_statement', 'vendor_csv', 'other'] },
            note: { type: 'string', description: 'If you extract ZERO line items, you MUST explain why here (e.g. unreadable, no recognizable columns, all rows were payments).' },
            lineItems: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        item: { type: 'string' },
                        orderDescription: { type: 'string' },
                        lineItem: { type: 'string', description: 'SKU / item / line number' },
                        category: { type: 'array', items: { type: 'string', enum: [...CATEGORY_CHOICES] } },
                        date: { type: 'string', description: 'ISO YYYY-MM-DD' },
                        unitQty: { type: 'number' },
                        perUnit: { type: 'number', description: 'pack size / #-per-unit (default 1)' },
                        unitOfMeasure: { type: 'string', enum: ['LB', 'ea', 'oz', 'gal', 'dozen', 'in'] },
                        unitPrice: { type: 'number' },
                        totalAmount: { type: 'number' },
                        vendor: { type: 'string' },
                        invoice: { type: 'string' },
                        location: { type: 'string', enum: ['763', '869'], description: 'derived from ship-to / account' },
                        bank: { type: 'string', enum: [...BANK_CHOICES] },
                        card: { type: 'string', enum: [...CARD_CHOICES] },
                        cardRaw: { type: 'string', description: 'card last-4 as printed (even if not an allowed option)' },
                    },
                    required: ['item', 'totalAmount'],
                    additionalProperties: false,
                },
            },
        },
        required: ['lineItems'],
        additionalProperties: false,
    },
};

type ParseReq = { filename: string; contentType: string; data: string };

function contentBlock(req: ParseReq): Anthropic.ContentBlockParam {
    const ct = (req.contentType || '').toLowerCase();
    if (ct === 'application/pdf' || req.filename.toLowerCase().endsWith('.pdf')) {
        return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: req.data } };
    }
    if (ct.startsWith('image/')) {
        const media = (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ct) ? ct : 'image/jpeg') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
        return { type: 'image', source: { type: 'base64', media_type: media, data: req.data } };
    }
    // CSV / text — decode the base64 back to text.
    const text = Buffer.from(req.data, 'base64').toString('utf8');
    return { type: 'text', text: `File: ${req.filename}\n\n${text}` };
}

export const POST = jsonRoute(async (req: Request) => {
    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }, { status: 500 });
    }
    const body = (await req.json()) as ParseReq;
    if (!body?.data) return NextResponse.json({ error: 'No file data provided.' }, { status: 400 });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'record_line_items' },
        messages: [{
            role: 'user',
            content: [
                contentBlock(body),
                { type: 'text', text: 'Extract every expense line item from this document and call record_line_items.' },
            ],
        }],
    });

    const toolUse = msg.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
    const out = (toolUse?.input ?? {}) as { lineItems?: unknown[]; documentType?: string; note?: string };
    const lineItems = Array.isArray(out.lineItems) ? out.lineItems : [];
    // Surface a reason when nothing came back (truncation vs. the model's own note).
    let note = out.note ?? '';
    if (lineItems.length === 0 && !note) {
        note = msg.stop_reason === 'max_tokens'
            ? 'The response was cut off (file may be very large) — try splitting the file.'
            : `No line items were extracted (document type: ${out.documentType ?? 'unknown'}).`;
    }
    return NextResponse.json({ lineItems, documentType: out.documentType ?? 'other', note });
});
