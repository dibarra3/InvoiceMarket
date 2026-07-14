# Groundwork

Groundwork turns messy job notes into clean invoices and estimates for landscaping and
excavation companies. It's a Next.js (App Router) + TypeScript app backed by Postgres via
Prisma, styled with Tailwind CSS v4 in the dark navy/emerald "ledger paper" look from the
original design reference.

Everything you see is real, persisted data — Company profile, Users, Clients,
Invoices/Estimates (`Document`), `LineItem`s, and the `InventoryItem` price list Magic Parse
matches job notes against all live in Postgres. There is no mock/in-memory state.

## Stack

- **Next.js 16** (App Router, Server Components + Server Actions)
- **TypeScript**
- **Prisma 6** + **PostgreSQL**
- **Tailwind CSS v4**
- **Auth.js (next-auth v5)** — email/password auth, one company per account, every query
  scoped to the signed-in user's `companyId` so companies never see each other's data
- **Stripe Checkout** — generates a real hosted payment link for any invoice
- **Claude (Anthropic API)** — Magic Parse calls Claude with tool use to extract client info
  and line items from freeform job notes, matched against your price list
- **@react-pdf/renderer** — renders a PDF of the invoice/estimate that mirrors the ledger-paper
  preview, for download or email attachment
- **Resend** — sends the invoice/estimate PDF straight to the client's inbox

## Getting started

1. **Point at a Postgres database.** Edit `.env` and set `DATABASE_URL`, e.g. for a local
   Postgres install:

   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/groundwork?schema=public"
   ```

   Don't have Postgres locally? The quickest options are:
   - `npx prisma dev` — spins up a local Postgres for development, no Docker required.
   - `docker run --name groundwork-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=groundwork -p 5432:5432 -d postgres:16`

2. **Set the rest of `.env`:**

   | Variable | Purpose |
   | --- | --- |
   | `AUTH_SECRET` | Session encryption for Auth.js. Generate with `npx auth secret`. |
   | `STRIPE_SECRET_KEY` | From the [Stripe dashboard](https://dashboard.stripe.com/apikeys). Needed for payment links. |
   | `STRIPE_WEBHOOK_SECRET` | From a [Stripe webhook](https://dashboard.stripe.com/webhooks) pointed at `/api/stripe/webhook`, listening for `checkout.session.completed`. In development, run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the secret it prints. |
   | `ANTHROPIC_API_KEY` | From the [Anthropic console](https://console.anthropic.com/settings/keys). Powers Magic Parse. |
   | `NEXT_PUBLIC_APP_URL` | Base URL used for Stripe redirect URLs (defaults to request headers if unset). |
   | `RESEND_API_KEY` | From [resend.com/api-keys](https://resend.com/api-keys). Needed to email invoices. |
   | `RESEND_FROM_EMAIL` | A sender address on a domain verified in Resend, e.g. `Groundwork <invoices@yourdomain.com>`. |

   The app still runs without Stripe/Anthropic/Resend keys configured — those features return
   a clear error in the UI instead of crashing the rest of the app. PDF download has no
   external dependency and always works.

3. **Install dependencies** (this also runs `prisma generate` via `postinstall`):

   ```bash
   npm install
   ```

4. **Apply the database schema:**

   ```bash
   npm run db:migrate
   ```

5. **Seed sample data** (a demo company/login, price list, a few clients and invoices):

   ```bash
   npm run db:seed
   ```

   This prints a demo Owner login (`demo@groundwork.test` / `groundwork-demo`) and a demo
   Field Crew login (`crew@groundwork.test` / `groundwork-crew`) the first time it creates
   the company — sign in as each to see the difference in access.

6. **Run the dev server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.
   Sign in with the seeded demo account, or visit `/register` to create a brand-new company.

## Multi-tenancy & auth

- `/register` creates a new `Company` + its first `User` (email/password, hashed with
  bcrypt) and seeds a starter price list for that company.
- `/login` authenticates via Auth.js's Credentials provider; sessions are JWT-based.
- `src/proxy.ts` redirects unauthenticated requests to `/login` (JSON 401 for `/api/*`
  routes) for everything except `/login`, `/register`, `/api/auth/*`, and the Stripe webhook.
- Every Server Action in `src/lib/actions.ts` calls `requireCompanyId()`
  (`src/lib/session.ts`) and scopes all Prisma queries to that `companyId` — Clients,
  Documents, and the price list all live under `Company` in the schema.

## Roles: Owner vs. Field Crew

- Every `User` has a `Role` (`OWNER` or `FIELD_CREW`). The first user created via
  `/register` is always an Owner; Owners invite teammates under either role from Settings
  (`src/lib/team-actions.ts`, `src/components/TeamSettings.tsx`).
- **Field Crew** can create and edit draft jobs — notes, line items, client info — but can't
  reach Settings (redirected to `/editor`), can't create Stripe payment links, can't email or
  delete documents, and can't change a document's status away from `DRAFT`.
- Enforcement lives in the Server Actions, not just the UI: `requireOwner()`
  (`src/lib/session.ts`) guards `updateCompany`, `deleteDocument`, `createPaymentLink`,
  `sendDocumentEmail`, and the team-management actions, so a Field Crew account can't reach
  these even by calling the action directly. `EditorView` and the nav additionally hide/
  disable that UI for a cleaner experience.

## Document locking

- Once a `Document` leaves `DRAFT` (sent or paid), `updateDocument`/`addLineItem`/
  `updateLineItem`/`removeLineItem`/`applyParseResult` in `src/lib/actions.ts` all reject
  further edits to its line items, discount, tax, doc number, or type — see
  `assertOwnsDraftDocument` and `LOCKED_ON_SENT_FIELDS`. Other fields (client info, notes,
  due date, footer, status) stay editable.
- The Editor shows a locked banner with a **Duplicate as New Draft** button
  (`duplicateDocument`), which copies the document and its line items into a fresh `DRAFT`
  with a new doc number — the intended way to revise a sent/paid document's content.
- `deleteDocument` permanently removes a document (Owner-only); available from the Invoices
  list and the Editor.

## Payments

- The Editor's "Get Paid Online" card (invoices only, Owner-only) calls the
  `createPaymentLink` Server Action (`src/lib/payment-actions.ts`), which creates a Stripe
  Checkout Session for the invoice's current total and saves the session id/URL on the
  `Document`.
- `src/app/api/stripe/webhook/route.ts` verifies the Stripe signature and, on
  `checkout.session.completed`, marks the matching document `PAID`.
- Stripe session creation is wrapped so a failure (bad API key, network error, Stripe outage)
  surfaces as a specific message in the Editor rather than an unhandled exception.

## Magic Parse

- `src/app/api/parse/route.ts` sends the raw job notes plus your price list to Claude
  (`claude-sonnet-4-5`) using forced tool use, and returns extracted client info, line items,
  and any discount as JSON.
- `EditorView` calls this route instead of doing any client-side pattern matching — there's
  no local regex parser left; Claude does the extraction.
- Claude's output is treated as untrusted input: `sanitizeLineItems`/`sanitizeString`/
  `sanitizeDiscountPercent` coerce and drop malformed entries (missing labels, non-finite
  qty/rate, etc.) before anything reaches the database, and the route returns a
  `foundNothing` flag rather than an empty-but-"successful" result, so `EditorView` skips
  calling `applyParseResult` instead of wiping existing line items. Network failures, a
  missing tool-use block, or an unparseable response all return a friendly `error` message
  (502/500/400) instead of throwing past the route — the Editor surfaces these as an amber
  status line and never crashes the form.

## PDF export & email delivery

- `src/lib/invoice-pdf.tsx` renders a `@react-pdf/renderer` document that mirrors the ledger-
  paper preview (header, bill-to/dates, line items, totals, watermark, footer note).
- `src/app/api/documents/[id]/pdf/route.ts` streams that PDF back as a download, scoped to
  the signed-in company via the existing `getDocument`/`getCompany` Server Actions.
- The Editor's "Send to Client" card lets anyone download the PDF; only Owners see the email
  form, which calls `sendDocumentEmail` (`src/lib/email-actions.ts`) to attach the same PDF
  through Resend and flip a still-`DRAFT` document to `SENT`. A failed Resend request (bad
  API key, network error, rejected address) is caught and surfaced as a specific message
  instead of crashing the form.

## Project structure

- `prisma/schema.prisma` — data model: `Company`, `User` (with `Role`), `Client`, `Document`
  (invoices & estimates share one table, distinguished by `type`), `LineItem`,
  `InventoryItem` — all scoped under `Company` for multi-tenancy.
- `prisma/seed.ts` — seeds a demo company with an Owner and Field Crew login, price list,
  sample clients, and sample documents.
- `src/auth.ts`, `src/proxy.ts`, `src/lib/session.ts`, `src/lib/auth-actions.ts` — auth.
- `src/lib/team-actions.ts`, `src/components/TeamSettings.tsx` — Owner-only teammate
  management (invite/remove, assign Owner or Field Crew).
- `src/lib/actions.ts` — Server Actions used directly from client components for all reads
  and writes (no separate REST/API layer), all scoped to the signed-in company, with
  document locking and Owner-only guards where noted above.
- `src/components/DeleteDocumentButton.tsx` — Owner-only delete control used on the
  Invoices list and in the Editor.
- `src/lib/payment-actions.ts`, `src/app/api/stripe/webhook/route.ts` — Stripe integration.
- `src/app/api/parse/route.ts` — Claude-powered Magic Parse endpoint.
- `src/lib/invoice-pdf.tsx`, `src/app/api/documents/[id]/pdf/route.ts` — PDF export.
- `src/lib/email-actions.ts` — Resend email delivery with the PDF attached.
- `src/components/EditorView.tsx` — the Editor screen (Job Notes, Magic Parse, Job Details,
  Payment Link, Line Items, Branding) with the live ledger-paper preview.
- `src/app/editor/page.tsx` — visiting `/editor` always starts a brand-new invoice, matching
  the reference app's default landing state.
- `src/app/editor/[id]/page.tsx` — edit an existing invoice/estimate by id.
- `src/app/invoices`, `src/app/clients`, `src/app/settings` — the other three nav views.

## Useful scripts

| Script               | Purpose                                             |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`         | Start the Next.js dev server                          |
| `npm run build`       | Production build                                      |
| `npm run db:migrate`  | Create/apply a migration in development               |
| `npm run db:deploy`   | Apply existing migrations (e.g. in CI/production)      |
| `npm run db:seed`     | Re-run the seed script                                 |
| `npm run db:studio`   | Open Prisma Studio to browse/edit data                 |
