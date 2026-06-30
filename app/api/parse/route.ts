import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { jsonRoute } from '@/lib/airtable/server';
import { CATEGORY_CHOICES, BANK_CHOICES, CARD_CHOICES } from '@/lib/silk/schema';

// Parse one uploaded invoice / receipt / bank statement into expense line items.
// Mirrors the /expense-report skill's extraction: it reads the document, pulls
// each purchasable line, and maps it onto the Expenses table's fields. The model
// is forced to answer through a tool so we always get structured JSON back.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

const SYSTEM = `You are the bookkeeping engine for Silk City Coffee, a coffee shop + kitchen with two locations (Manchester "763" and Willimantic "869"). Read an uploaded invoice, receipt, or bank/credit-card statement and extract every purchase line into structured rows for the Airtable "Expenses" table, following these rules (which mirror the /expense-report skill).

GENERAL
- One row per distinct line item on an invoice/receipt; one row per transaction on a bank/card statement.
- "item": concise name, max ~4 words (e.g. "Oat Milk", "16 oz Cold Cup"). "orderDescription": the full item title, no commas. "lineItem": SKU / item number / line number if shown.
- Amounts are plain numbers (no $ or commas). "totalAmount" = the line's extended/charged total. If only a total is shown, set unitQty=1 and unitPrice=totalAmount. "perUnit" = pack size / #-per-unit (default 1). "unitOfMeasure" ∈ LB/ea/oz/gal/dozen/in for weight/measured items.
- "date": ISO YYYY-MM-DD (convert M/D/YYYY). If the document shows one date, use it for every row.
- "vendor": merchant/supplier name as printed. "invoice": invoice or order number.
- "category": best-fitting tags from the allowed list — Bar (bar ingredients), Kitchen (kitchen food), Coffee Beans (whole-bean/roasting), Supplies (cups/lids/napkins/cleaning/packaging), Shipping (freight), Fees (processor/bank fees), Utilities. Multiple tags only when clearly warranted.
- "location": "763" or "869" when derivable (see vendor rules); otherwise omit.
- Do NOT invent values. Omit any field you cannot determine (item and totalAmount are required).
- Skip subtotals, running balances, tax-summary lines, and payment/deposit rows that are not purchases.

VENDOR RULES
- Sysco: derive location from the account / Ship-To number — 760629 → 763, 802113 → 869. Skip rows where Current Quantity = 0; keep refunds (negative amounts).
- Amazon: include ALL rows (no filtering); convert dates M/D/YYYY → ISO.
- Royal New York / Adagio Teas / Barista Underground: weight-based items use unitOfMeasure "LB". Adagio: skip qty=0 rows and points-redeemed lines.
- Bank / credit-card statements (Chase / Amex / Webster): each CHARGE/purchase is an expense; skip only payments, credits, refunds-to-card, deposits, and interest. Statements vary in sign convention — work out from the file which sign is a charge, and always output totalAmount as a POSITIVE number. Set "bank" to the issuer and "cardRaw" to the card's last 4 digits as shown; set "card" only when that last-4 is an allowed option.

GENERIC CSV / SPREADSHEET
- If the file is any CSV/spreadsheet export (vendor order history, line-item export, etc.), treat EVERY data row that has an item/description and an amount as a line item and extract them all. Only skip the header row, total/subtotal rows, and clearly non-purchase rows.
- When you are unsure whether a row is an expense, INCLUDE it rather than skip it. Prefer over-extracting (the user reviews afterward) over returning nothing.

If you end up with zero line items, you MUST fill the "note" field with the reason. Return your answer ONLY by calling the record_line_items tool.`;

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
                        taxAmount: { type: 'number' },
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
