# Silk Finance

A self-serve finance dashboard for the **Silk City Coffee** leads team (Manchester `763`,
Willimantic `869`). It turns the weekly bookkeeping that used to run through Claude Code
skills into a password-protected web app: upload invoices/statements and sales exports,
review and correct the data, and watch a weekly **scorecard** roll up COG %, labor and
cost-of-service by location and department.

It is a standalone **Next.js** app backed by an **Airtable** base (Reports 2026,
`app5k6nhYwCIyJ4yH`), with a thin **Claude** integration for parsing messy invoices. All
Airtable/Anthropic credentials live server-side; the browser never sees them.

---

## 1. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | Server Components by default; React Compiler on (`next.config.ts`). Note: middleware is named **`proxy.ts`** in Next 16. |
| UI runtime | **React 19** | Function components only; no class components except one error boundary. |
| Language | **TypeScript 5** (strict) | All data access is by **field ID**, never field name. |
| Data fetching | **SWR** (suspense mode) | Polls records every 6s so AI/formula fields fill in live. |
| Data source | **Airtable REST API v0** | Reached only through a server-side proxy that holds the PAT. |
| AI parsing | **`@anthropic-ai/sdk`** | Server route forces tool-use to extract invoice line items. |
| Icons | **`@phosphor-icons/react`** | Imported as `*Icon` (e.g. `ReceiptIcon`). |
| Fonts | `next/font/google` | **Anton** (display) + **Montserrat** (body), wired in `app/fonts.ts`. |
| Styling | Inline styles + CSS custom properties | No Tailwind/CSS-in-JS lib. Tokens in `app/theme.css`, primitives in `lib/components/ui.tsx`. |
| Hosting | **Vercel** | Static shells + serverless route handlers + the `proxy` gate. |

There is **no database, ORM, or state library** — Airtable is the source of truth and SWR is
the cache. Everything else is plain React.

---

## 2. Architecture at a glance

The core idea: the browser talks to a **token-holding server proxy**, and the client speaks
to that proxy through a small **data layer that mimics the Airtable Blocks SDK** (`useBase`,
`useRecords`, `record.getCellValue`, `table.createRecordAsync`, …). UI code therefore reads
and writes Airtable without ever knowing about REST, tokens, or pagination.

```
┌── Browser (client components) ─────────────────────────────┐
│  pages (app/*/page.tsx)                                     │
│      │  useBase() / useRecords(table)        ← SWR cache    │
│      │  table.createRecordAsync(fields)                     │
│      ▼                                                      │
│  lib/airtable/{hooks,models,normalize}  (SDK-shaped layer)  │
└──────────────│─────────────────────────────────────────────┘
               │  fetch('/api/airtable/...')   (same-origin)
               ▼
┌── Server (route handlers, Node runtime) ───────────────────┐
│  proxy.ts ......... auth gate on every request             │
│  app/api/airtable/* ... REST proxy (adds Bearer PAT)       │
│  app/api/parse ........ Anthropic call (invoice → JSON)    │
│  app/api/login ........ sets/clears the session cookie     │
│  lib/airtable/server.ts ... airtableFetch() + env access   │
└──────────────│──────────────────────────│─────────────────┘
               ▼                          ▼
        api.airtable.com           api.anthropic.com
        content.airtable.com
```

**Request lifecycle for a page load:** `proxy.ts` checks the signed cookie → page renders a
client shell → `useBase()` suspends on `/api/airtable/schema`, `useRecords()` suspends on
`/api/airtable/records/:table` → the proxy attaches the PAT and paginates Airtable → records
come back, get normalized to SDK shapes, and the page renders.

---

## 3. Directory structure

```
app/
  layout.tsx              Root layout: metadata, fonts, theme import
  fonts.ts                Anton + Montserrat (next/font)
  globals.css             Reset + keyframes (marquee, shimmer, etc.)
  theme.css               Design tokens: gold/slate glass palette, light + dark
  page.tsx                Landing hub (marquee hero + a card per nav section)
  login/page.tsx          Password gate UI (the only unauthenticated page)

  upload/page.tsx         Ingestion: Expense (Claude) | Sales (CSV) | Payroll (wizard)
  upload/PayrollWizard.tsx  Payroll's multi-step review wizard (roster match, anomalies, pivot approval)
  expenses/page.tsx       Expense list + detail drawer (edit/create)
  sales/page.tsx          Sales list + detail drawer (edit/create, link product)
  inventory/page.tsx      Inventory ("The Pantry") list + create/edit form
  scorecard/page.tsx      4-week Expenses / Sales / COG% / Labor / COS% by dept

  api/
    login/route.ts                       POST sets / DELETE clears session cookie
    parse/route.ts                       Anthropic: invoice/statement → line items (tool-use)
    airtable/schema/route.ts             GET base schema (cached 10 min in-process)
    airtable/records/[table]/route.ts    GET all records (paginated) + POST create
    airtable/records/[table]/[id]/route  PATCH update + DELETE
    airtable/upload/[id]/[field]/route   POST base64 attachment (Airtable content API)

lib/
  airtable/               The SDK-shaped data layer (see §5)
    server.ts             airtableFetch(), airtableEnv(), jsonRoute(), relay()
    hooks.tsx             useBase(), useRecords(), <AirtableBoundary>
    models.ts             Base/Table/Field/RecordModel + create/update/delete/upload
    normalize.ts          REST ⇄ SDK value-shape translation
    projection.ts         Per-table field allowlists (smaller payloads)
    cells.ts, fieldTypes.ts, keys.ts, types.ts   helpers + SWR keys + raw types
  auth.ts                 HMAC-signed session cookie (Web Crypto)
  silk/
    schema.ts             ★ All table + field IDs, select choices, dept mappings, constants
    csv.ts                Deterministic CSV parser + Sunday-week-from-filename
  components/
    Shell.tsx             Page chrome: ScrollProgress + TopNav + main + IdleTimeout
    TopNav.tsx            Glass nav (centered icons desktop / hamburger mobile) + ? help
    WeeklyLoop.tsx        The "how it works" help popover
    IdleTimeout.tsx       12-min warning → 15-min auto-logout
    ui.tsx                Design primitives: glass(), Button, Pill, MoneyInput, inputStyle, PALETTE
    InventoryForm.tsx     Reusable create/edit inventory drawer
    MarqueeLoader / ScrollProgress / modalStyle   loaders + shared modal sizing

proxy.ts                  Auth gate (Next 16 middleware). MUST be named proxy.ts.
public/                   icon.svg + manifest.webmanifest (installable PWA)
```

`lib/silk/` is the only **app-specific** part of the data plumbing — everything in
`lib/airtable/` is base-agnostic and could be reused against another base.

---

## 4. Auth & security

- **`proxy.ts`** runs on every request. It allows `/login`, `/api/login`, and two public
  assets; everything else requires a valid session. Unauthenticated API calls get `401`;
  page loads redirect to `/login`. This gates the data proxies too, so the PAT/Anthropic
  key cannot be invoked anonymously.
- **Session** (`lib/auth.ts`) is a single shared password → an **HMAC-SHA256-signed,
  `httpOnly` cookie** (`secure` + `sameSite=lax` in production), verified with a
  constant-time compare. Set by `POST /api/login`, cleared by `DELETE`.
- **Inactivity timeout** (`IdleTimeout.tsx`, mounted in `Shell`): real interaction
  (pointer/key/scroll/wheel/touch — not idle mouse drift) resets a 15-minute clock. At
  12 min a modal warns with a 3-min countdown; at 15 min it `DELETE`s the cookie and
  redirects to `/login`.
- **Secrets are server-only.** `AIRTABLE_TOKEN`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`,
  `APP_PASSWORD` are referenced only in route handlers / `lib/airtable/server.ts` /
  `proxy.ts`. There are **no `NEXT_PUBLIC_` secrets** and none appear in any `'use client'`
  file. `.env.local` is gitignored.

---

## 5. The Airtable data layer (`lib/airtable/`)

This layer re-implements the surface of Airtable's Blocks Extensions SDK so the UI can be
written as if it were running inside Airtable.

- **`hooks.tsx`** — `useBase()` (SWR-suspends on the schema) returns a `BaseModel`;
  `useRecords(table)` (SWR-suspends on records, 6s refresh) returns `RecordModel[]`.
  `<AirtableBoundary>` wraps a page in a Suspense + error boundary (the `MarqueeLoader`
  is the fallback).
- **`models.ts`** — `RecordModel.getCellValue(fieldId)` / `getCellValueAsString(fieldId)`;
  `TableModel.createRecordAsync(fields)` / `updateRecordAsync(rec, fields)` /
  `deleteRecordAsync(rec)`. The write path **partitions** attachment fields carrying
  browser `File` objects and uploads them as base64 via the content API, then revalidates
  the SWR cache.
- **`normalize.ts`** — Airtable REST and the SDK disagree on shapes (e.g. `multipleSelects`
  is `["a"]` in REST but `[{name:"a"}]` in the SDK). `normalizeRead`/`normalizeString`/
  `normalizeWrite` translate both directions so callers see consistent values.
- **`projection.ts`** — a per-table allowlist of field IDs so the records proxy fetches
  only what a page uses. Unlisted tables fall back to all fields (slower, never broken).
- **`server.ts`** — `airtableFetch(path, init, {content?})` attaches the Bearer token and
  targets the data or content API; `airtableEnv()` reads/validates env; `jsonRoute()` wraps
  handlers so thrown errors become clean JSON 500s.

**Important conventions**
- Access cells by **field ID** (from `lib/silk/schema.ts`), never by name.
- **Linked-record** cells read back as arrays of record-ID strings — resolve names yourself
  against the linked table's records (the pages build `id → name` maps).
- Several display fields (Department, Sales Category, Week Of/Start) are **read-only
  formulas/lookups**; the app writes the underlying links (e.g. a sale's *Linked Product*
  drives its Department).

---

## 6. Airtable model & business rules (`lib/silk/schema.ts`)

`schema.ts` is the single source of truth for table IDs, field IDs, select choices, and the
department mappings. Key tables: **Expenses** (`tbllfUbqS3jlfqBsa`), **Sales**
(`tbl683TIbiGLbe0AE`), **Inventory** (`tbl7TGKYDVD8b1rsV`), **Time Sheets**
(`tblDnO3dyILyYHKGH`), **Vendors**, **Locations** (763/869/330), **Products**.

Rules encoded in `schema.ts` and the scorecard:
- **Departments tracked:** Bar and Kitchen. `salesTrackedDept()` folds the *Retail Coffee*
  sales department into **Bar**; `expenseTrackedDept()` maps the Bar/Kitchen expense
  categories. Location **869** is a single **Cafe** (Bar + Kitchen combined).
- **Weeks** are Sunday-keyed `MM/DD/YYYY` and align across Expenses (Week Of), Sales (Week
  Start), and Time Sheets (Week Start).
- **Labor:** `LABOR_RATE = 22` ($/hr). Hours = Time Sheet *Total Hours* + *Holiday*
  (Total Hours excludes holiday/OT by formula).

---

## 7. Pages

- **`/upload`** — one page, three report types via a selector:
  - **Expense** → `POST /api/parse` (Claude, forced tool-use) extracts line items from
    PDFs/images/CSVs using the `/expense-report` skill's vendor rules; the client
    auto-creates Expense rows and attaches the file. Location is **detected from the
    document**, not picked.
  - **Sales** → a Square `item-sales-summary` CSV is parsed **deterministically in the
    browser** (`lib/silk/csv.ts`), with the week's Sunday read from the filename; you pick
    the location; one Sales row per line.
  - **Payroll** → `PayrollWizard.tsx`, a structured multi-step wizard (no chat, no Google
    Sheets dependency): parses 2 Homebase timesheet + 2 Square tips CSVs deterministically
    (`lib/silk/payroll.ts`, no Claude call), a roster-match step (unmatched Homebase names
    link-or-create against Staff Payroll, mirroring the Vendor "+Add" pattern), an anomaly
    review (zero-hours-despite-scheduled, possible duplicate shifts), then writes Tips + Time
    Sheets — followed by an in-app **editable pivot** (with a reconciliation panel reading
    back what Airtable's own formulas computed, and a standalone CSV download for the payroll
    provider) gated behind an explicit **"Approve & upload"** before the final Payroll-table
    write. The wizard never computes wages (handled elsewhere via Staff Payroll's Rate
    fields) or overtime (tracked on another platform) — both are passed through/left blank.
  - Expense/Sales **auto-create then surface a flag summary** (new vendors, unknown card,
    uncategorized rows, "needs product link") — the human checkpoint happens on the list
    pages, not in a blocking modal. Payroll's checkpoints are its own wizard steps instead.
- **`/expenses`, `/sales`, `/inventory`** — list + glass **detail drawer** that edits *or*
  creates a record (drawers take an optional `rec`; absent = create). Searchable filters,
  link pickers (vendor/inventory/product/location), `$`-prefixed money inputs.
- **`/scorecard`** — one combined table grouped **Location → Department**, each with
  Expenses / Sales / COG % / Hours / Labor / COS % rows across a 4-week window (◀/▶ pager)
  plus a blended 4-week summary column.

---

## 8. Design system

- **`theme.css`** defines the palette and surfaces as CSS variables for light + dark
  (`prefers-color-scheme`). One accent — **gold `#d8b358`** — over **slate `#32464f`** ink,
  on neutral frosted glass. Dark mode is neutral charcoal.
- **`ui.tsx`** exports the primitives every page composes from: `glass()` (the frosted
  surface style), `Button`, `Pill`, `MoneyInput` (the `$` field), `inputStyle`, `PALETTE`,
  and font tokens. Reach for these instead of re-styling.

---

## 9. Local development

```bash
cp .env.local.example .env.local   # then fill in the values below
npm install
npm run dev                        # http://localhost:3000 → /login
```

`.env.local`:

| Var | What |
|---|---|
| `APP_PASSWORD` | The login password (single shared password). |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `AIRTABLE_TOKEN` | PAT with `data.records:read`/`:write` + `schema.bases:read` on base `app5k6nhYwCIyJ4yH`. |
| `AIRTABLE_BASE_ID` | `app5k6nhYwCIyJ4yH` |
| `ANTHROPIC_API_KEY` | For `/api/parse` (`ANTHROPIC_MODEL` optional; defaults to `claude-opus-4-8`). |

Scripts: `npm run dev`, `npm run build`, `npm start`.

---

## 10. Deployment (Vercel)

1. Push this repo to GitHub.
2. Import into Vercel — framework auto-detected, **root = repo root**, build `next build`.
3. Add the five env vars above (scope: Production). Vercel sets `NODE_ENV=production`, so
   the session cookie becomes `secure` automatically.
4. Deploy, then verify any URL redirects to `/login` and the right password lets you in.

---

## 11. Gotchas & conventions for new contributors

- **`proxy.ts` must keep that name** and export `proxy()` — Next 16 renamed `middleware`.
- **`backdrop-filter` traps `position: fixed` children.** The glass nav/cards have
  `backdrop-filter`, so any modal/menu rendered inside them is `createPortal`'d to
  `document.body` (see `TopNav`, `WeeklyLoop`, `IdleTimeout`). Do the same for new overlays.
- **SWR suspense can't prerender.** Data pages gate the `<AirtableBoundary>` behind a
  `mounted` flag (`useEffect(()=>setMounted(true))`) so the server renders only the loader.
- **Field IDs, not names** — always go through `lib/silk/schema.ts`.
- **Writes:** select fields take the option name (or `null` to clear); link fields take an
  array of record-ID strings; attachments take `[{ file }]` (a browser `File`). `typecast:true`
  is set server-side so names/new options are accepted.
- **Adding a page that reads Airtable:** add a `FIELD_PROJECTION` entry, the table/field IDs
  to `schema.ts`, then `useBase()/useRecords()` inside an `<AirtableBoundary>` behind the
  `mounted` gate — copy an existing page (e.g. `app/sales/page.tsx`) as the template.

---

## 12. What's intentionally not here yet

- **A `/payroll` list page** — the Payroll wizard writes real records, but there's no page yet
  to browse/edit them afterward (Expenses/Sales/Inventory all have one). A natural next build.
- **Server-side sliding sessions** — the idle timeout is enforced client-side (standard for
  a single-password internal tool); the cookie's own max-age is 30 days.
