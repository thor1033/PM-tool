# Atlas — Project Management Hub

An AI-native project delivery hub for a boutique consultancy. Every client
engagement gets one workspace: kanban board, business case, scope, pre-analysis,
risks, stakeholders, org chart, product catalogue, comms & change plans, KPIs,
taxonomy and glossary — with Claude able to draft the whole thing from a brief.

This is a ground-up rewrite of the original single-file "Atlas" HTML app (kept
for reference in [`legacy/`](./legacy)) into a production, multi-tenant,
Vercel-deployable application.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| UI | Tailwind CSS v4 · shadcn/ui · lucide-react |
| Client data | TanStack Query |
| Database | Neon Postgres · Drizzle ORM · `pgvector` (dormant, for future RAG) |
| Multi-tenancy | `org_id` on every row + Postgres Row-Level Security |
| Auth / SSO | WorkOS AuthKit |
| AI | Anthropic SDK (Claude Sonnet 4.6) with prompt caching |
| Hosting | Vercel (frontend + serverless) · Dockerfile for VPC |

See the architecture map at the bottom.

## Prerequisites

- Node.js ≥ 20.9
- A [Neon](https://neon.tech) Postgres project
- A [WorkOS](https://workos.com) account (AuthKit)
- An [Anthropic](https://console.anthropic.com) API key

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Environment** — copy `.env.example` to `.env.local` and fill in:

   | Variable | Where to get it |
   | --- | --- |
   | `DATABASE_URL` | Neon → pooled connection string |
   | `DATABASE_URL_UNPOOLED` | Neon → direct connection string (for migrations) |
   | `WORKOS_API_KEY` / `WORKOS_CLIENT_ID` | WorkOS dashboard → API keys |
   | `WORKOS_COOKIE_PASSWORD` | 32+ char secret — `openssl rand -base64 32` |
   | `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | e.g. `http://localhost:3000/callback` (must be registered in WorkOS → Redirects) |
   | `ANTHROPIC_API_KEY` | Anthropic console |

3. **Database** — apply migrations (creates tables, enables `pgvector`, installs
   RLS policies) and load the sample projects:

   ```bash
   npm run db:migrate   # schema + RLS + pgvector
   npm run db:seed      # 3 sample projects (Helios + sub-project + Intranet)
   # or both:
   npm run db:setup
   ```

4. **Run**

   ```bash
   npm run dev
   ```

   Visit http://localhost:3000, sign in via WorkOS, and you land on your
   projects.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a new migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed sample projects |
| `npm run db:studio` | Drizzle Studio |

## Deploy

### Vercel (MVP)

1. Import the repo in Vercel.
2. Add all `.env.example` variables in **Settings → Environment Variables**
   (set `NEXT_PUBLIC_WORKOS_REDIRECT_URI` to `https://<domain>/callback` and add
   the same URL in WorkOS → Redirects).
3. Connect Neon (Vercel integration gives branch-per-preview databases).
4. Run `npm run db:migrate` once against the production database.

### Docker (VPC / self-host)

The app builds to a standalone server (`output: "standalone"`):

```bash
docker build -t atlas-hub .
docker run -p 3000:3000 --env-file .env.local atlas-hub
```

## Importing legacy Atlas data

Existing workspaces from the original app export to JSON
(`{ atlas: true, version: 2, projects: [...] }`). On the **Projects** page use
**Import** to upload/paste an export — projects are added to your tenant with no
overwrite. (The `POST /api/import` route backs this.)

## Architecture map

```
app/
  page.tsx                     public landing (sign in / up)
  callback/route.ts            WorkOS AuthKit callback
  (app)/                       authed chrome (top bar + user menu)
    projects/                  list + create (blank / AI) + import
    projects/[id]/[tab]/       project workspace → module dispatcher
  api/
    projects/…                 REST: project + generic entity CRUD (RLS-scoped)
    ai/setup/                  Claude-drafted project generation
    import/                    Atlas export importer
proxy.ts                       AuthKit session + route protection (Next 16 proxy)
lib/
  db/       schema · client (Neon pool) · tenant (RLS) · queries
  auth/     WorkOS context + org/user provisioning
  ai/       Anthropic client + setup orchestration
  import/   Atlas JSON → normalized rows
  entities.ts · nav.ts · colors.ts · templates.ts
components/
  modules/  the 13 project modules (board, risks, business-case, …)
  project/  workspace shell + module dispatcher
  projects/ list, create, AI setup, import dialogs
drizzle/    generated migrations (incl. RLS + pgvector)
```

### Multi-tenant isolation

Every request resolves a WorkOS session → org, then runs DB work inside
`withTenant(orgId, …)`, which sets `app.current_org` on a transaction and
filters every query by `org_id`. This app-layer scoping is the **enforced
isolation guarantee**.

Postgres RLS policies (`org_id = current_setting('app.current_org')`, FORCE) are
also installed on every tenant table as a second layer. **On Neon they are
dormant**, because the default `neondb_owner` role carries `BYPASSRLS` and Neon
does not let it remove that attribute from itself. To make RLS active, connect
the app as a dedicated non-owner role:

```sql
-- run as neondb_owner
CREATE ROLE app_user LOGIN PASSWORD '<pw>' NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

…then point the app's `DATABASE_URL` at `app_user` (keep migrations/seed on the
owner). This is tracked as **Phase 2 hardening**.

### Phase 2+ (not yet built)

Activate RLS via a dedicated DB role (above) · OpenFGA fine-grained authZ ·
Inngest durable jobs · Langfuse tracing/ROI · MCP servers · Claude Agent SDK
runtime · LiteLLM gateway · file/blob uploads.
