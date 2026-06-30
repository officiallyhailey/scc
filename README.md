# Silk Finance

A standalone finance webapp for the Silk City Coffee leads team. Upload invoices,
receipts and bank/card statements; Claude reads them and files the line items as
draft expenses in the **Reports 2026** Airtable base; a clean editor lets you fix
each row before it rolls into the weekly report.

Built with the same architecture as `../../webapp` (Next.js + a server-side Airtable
REST proxy → React/SWR), with an added Claude parsing layer. It is its own app — own
base, theme, and pages.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **SWR** data layer that mirrors the Airtable Blocks SDK surface (`useBase`,
  `useRecords`, `record.getCellValue`, `table.createRecordAsync/updateRecordAsync`)
- **Airtable REST API** via a token-holding server proxy (`app/api/airtable/*`)
- **Anthropic SDK** (`@anthropic-ai/sdk`) for document parsing (`app/api/parse`)
- Glassmorphism UI (no CSS framework) — tokens in `app/theme.css`, primitives in
  `lib/components/ui.tsx`

## Pages

- **`/upload`** — drop PDFs / CSVs / image invoices + pick a location (763 / 869 / 330).
  Each file is sent to `/api/parse`, which calls Claude to extract line items, then the
  client auto-creates draft **Expense** records (Status = Submitted), links the location,
  matches-or-creates the vendor, and attaches the original file to the Receipt field.
- **`/expenses`** — bill.com-style list of every expense with a location switcher, week /
  status filters and search. Click any row to open a glass detail drawer and edit every
  field (item, category chips, vendor / inventory / location link pickers, amounts,
  bank / card, status), saved back to Airtable.

## Setup

```bash
cp .env.local.example .env.local      # then fill in the values below
npm install
npm run dev                            # http://localhost:3000  → /login
```

`.env.local`:

| Var | What |
|---|---|
| `APP_PASSWORD` | Password to enter the app (single shared password) |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `AIRTABLE_TOKEN` | Airtable PAT with `data.records:read`, `data.records:write`, `schema.bases:read` **on base `app5k6nhYwCIyJ4yH`** |
| `AIRTABLE_BASE_ID` | `app5k6nhYwCIyJ4yH` (Reports 2026) |
| `ANTHROPIC_API_KEY` | Anthropic key for server-side parsing (`ANTHROPIC_MODEL` optional, defaults to `claude-opus-4-8`) |

## Architecture notes

- `proxy.ts` is the password gate (Next 16 renamed middleware → proxy; the file must be
  named `proxy.ts` and export `proxy()`). `AIRTABLE_TOKEN` and `ANTHROPIC_API_KEY` are
  server-only and never reach the browser.
- Field/table IDs live in `lib/silk/schema.ts`. Per-table fetch projections are in
  `lib/airtable/projection.ts`.
- The Expenses data feeds the base's existing weekly **Report** table, which rolls up
  COG % by department automatically.

## Roadmap (deliberately out of scope for this MVP)

Sales (Square + Shopify), Inventory order summaries, Timesheets, and the labor /
cost-of-service analytics — to be added as further pages on the same framework.
