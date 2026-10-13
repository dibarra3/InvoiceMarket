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
- `src/proxy.ts` sends unauthenticated business requests to `/login` (JSON 401 for `/api/*`)
  and customer-area requests to `/customer/login`. The homepage, `/pay`, guest invoice links,
  `/api/auth/*`, and the Stripe webhook are public.
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

## Entry points

One site, three audiences:

| Who | Entry | Lands on |
| --- | --- | --- |
| Anyone with an invoice | `/` → **Pay an invoice** (`/pay`) | `/invoice/[token]` |
| Customers | `/customer/login`, `/customer/register` | `/customer/invoices` ("My invoices") |
| Owners & field crew | **Business sign in** (`/login`), `/register` | existing business app |

`src/proxy.ts` routes each area to the right account type, but it's only a UX layer: every
page, Server Action, route handler, and PDF download re-checks authorization on the server
(`requireSession`/`requireOwner`/`requireCustomer` in `src/lib/session.ts`).

## Customer accounts

- Customers live in their own `Customer` table and sign in through a separate Auth.js
  provider (`customer-credentials`). Signup never creates a `Company` or business `User`, and
  business guards reject every customer session.
- A customer sees an invoice only when it's **sent or paid** and belongs to a client record
  they're linked to (`customerDocumentWhere` in `src/lib/customer-portal.ts`). Email addresses
  are never used for matching.
- Linking: on **Clients**, an Owner clicks **Create portal code** for a client. The code is
  single-use, expires in 7 days, and is stored only as a SHA-256 hash. The Owner gives it to the
  real client out of band, and the client enters it under **My invoices → Linked accounts**.
  Owners can remove linked customers from the same card. Invoices are assigned to a client via
  the Editor's client name, and become visible once sent.
- "My invoices" shows the customer's invoices across every linked contractor, plus their
  payment history.

## Guest access

- Each document can have an unguessable 256-bit link token (`/invoice/[token]`) and a 12-character
  access code. Both are generated on first use from the Editor's **Client Access** card
  (Owner-only), which has copy buttons and a **Reset link & code** button.
- `/pay` requires the invoice number **and** the access code. The code (globally unique) picks
  the document and the number must match it, so neither works alone, and two companies that
  share an invoice number never collide. Every failure returns the same generic error.
- Guest pages never show drafts or internal job notes, and they send `Referrer-Policy:
  no-referrer` and `noindex`. Invoice emails include the guest link and access code.

## Payments (Stripe Sandbox only)

- `getStripe()` refuses any key that isn't `sk_test_`/`rk_test_`, the webhook ignores
  live-mode events, and every payment surface is labeled **Test mode**.
- `getOrCreateCheckoutSession` (`src/lib/checkout.ts`) is the single path to Checkout for
  owners, customers, and guests:
  - It computes the amount on the server from the stored line items, in USD cents.
  - It enforces Stripe's $0.50 minimum and refuses drafts, estimates, and paid invoices.
  - It reuses the open session when the amount and return page still match. Otherwise it
    expires that session before creating a new one, using a compare-and-set so the invoice
    never has two live sessions.
  - Payers return to `/invoice/[token]/payment/{success,canceled}` or
    `/customer/invoices/[id]/payment/{success,canceled}`, never `/editor`.
- An Owner's **Create Payment Link** marks a draft as sent, which locks its totals.
- Moving an invoice back to draft, marking it paid by hand, resetting its guest link, or
  deleting it first expires the Checkout Session. If Stripe can't confirm the session is
  expired, the action is refused: nothing changes, the session reference is kept, and the
  Owner sees a retry message. A session that has already completed also blocks the change,
  until its webhook records the payment.
- Only Stripe's explicit `resource_missing` answer, or a session status of `expired`, counts as
  proof that a session is gone. A network, API, or auth error never does: Checkout refuses to
  create a replacement and asks the payer to retry.
- The success page only displays status and polls for updates. **Only the signed webhook marks
  an invoice paid.** `src/lib/stripe-webhook.ts` applies a `checkout.session.completed` event
  only if all of these hold:
  - The session is complete and paid, and its metadata matches the invoice and company.
  - It is the invoice's *current* session.
  - The invoice isn't already paid.
  - The currency is USD and the amount equals the invoice total.
- Every completed session is recorded once in `Payment`, keyed by the unique session id, so
  duplicate or concurrent deliveries are no-ops. A payment that collected money but fails a
  check is recorded as `NEEDS_REVIEW`, for example a second payment on a paid invoice, which
  needs a refund.

## Tests

Integration tests (Vitest) cover customer isolation, guest access, Checkout creation and
reuse, success and cancel returns, and the webhook (duplicate, mismatched, and forged events).
They run against a **disposable** Postgres database and delete only the rows they create:

```bash
TEST_DATABASE_URL="postgresql://…/groundwork_test" npm test
```

Use a local Postgres or a Neon *branch*, never the production database (the setup refuses
the same URL as `.env`'s `DATABASE_URL`). Stripe is faked, so no network calls are made. The
fake can simulate Stripe outages to test the failure paths.

## Deployment

The Vercel build command is `npm run db:deploy && npm run build`. `db:deploy`
(`scripts/db-deploy.mjs`) runs `prisma migrate deploy` only when `VERCEL_ENV` is `production`,
or unset when you run it locally. Preview deployments skip migrations, so a branch build can
never migrate a database it inherits. Preview deployments get no database, app URL, or webhook
settings unless you configure Preview-scoped variables.

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
| `npm test`            | Integration tests (needs `TEST_DATABASE_URL`)           |
