# Job Search Copilot

A local-only web app for tracking a job search and generating tailored
application kits (cover letter, four résumé bullets, five likely interview
questions, one-page company brief) with one click.

Stack: **Next.js 16 · TypeScript · Tailwind v4 · Prisma 7 + SQLite ·
dnd-kit · Radix UI · Anthropic Claude (Opus / Haiku) · @react-pdf/renderer**.

Designed against the Linear dark-canvas visual system (see
`design.md`). Light mode is supported as a courtesy; dark is the default.

## Quick start

```bash
# 1. install
npm install

# 2. set up the database (creates ./data/app.db, applies the schema,
#    and seeds the four default pipeline columns)
npx prisma migrate dev --name init   # one-time per checkout
npm run db:seed                       # idempotent — safe to re-run

# 3. run
npm run dev

# open http://localhost:3000
```

To wipe the DB and start over:

```bash
npm run db:reset && npm run db:seed
```

## Configuration

Anthropic API key (required for **Generate Kit** and for AI-assisted
listing parsing on the paste flow):

- **Easiest**: open the app, go to **Settings → Anthropic API key**, paste
  your key. It's stored in the local SQLite DB; nothing is ever logged or
  echoed back.
- **Env var (overrides DB value)**: add to `.env`:
  ```
  ANTHROPIC_API_KEY=sk-ant-…
  ```

Database location: `./data/app.db` (gitignored). The folder is auto-created.

## What's where

```
src/
├── app/                     Next.js App Router
│   ├── page.tsx             /            board
│   ├── profile/page.tsx     /profile     résumé + background
│   ├── settings/page.tsx    /settings    columns, API key, AI usage
│   ├── error.tsx            global error boundary
│   └── api/
│       ├── jobs/            CRUD + reorder + kit + cover-letter.pdf
│       ├── columns/         CRUD + reorder
│       ├── profile/
│       ├── parse-listing/   URL fetch + Haiku paste meta-extract
│       └── settings/anthropic-key/
├── components/
│   ├── board/               BoardGrid, SortableJobCard, JobCardPreview
│   ├── job/                 AddJobModal, JobDetailDrawer, KitPanel
│   ├── settings/            ColumnsEditor, ApiKeyEditor, AiLogTable
│   ├── profile/             ProfileEditor
│   ├── theme/               ThemeProvider, ThemeToggle (dark default)
│   ├── layout/              TopNav, KeyboardShortcuts
│   └── ui/                  Button, BrandMark, Dialog (modal + drawer)
└── lib/
    ├── db.ts                Prisma client singleton (better-sqlite3 adapter)
    ├── columns.ts           Column service (10-step sparse ordering)
    ├── jobs.ts              Job service (per-column ordering, reorderJobs)
    ├── kits.ts              generateKit / generateKitStream / regenerate
    ├── profile.ts           Singleton Profile row
    ├── kit-markdown.ts      Markdown renderers per section
    ├── ai/
    │   ├── client.ts        getAnthropicClient + model constants
    │   ├── kit-tool.ts      emit_application_kit tool schema + types
    │   └── prompts.ts       Persona + profile system block (cached)
    ├── parse/
    │   ├── fetch-url.ts
    │   ├── jsonld.ts        schema.org JobPosting extractor
    │   ├── readability.ts   Mozilla Readability fallback
    │   └── meta-extract.ts  Haiku forced-tool-use for paste flow
    └── pdf/cover-letter.tsx  @react-pdf/renderer document
```

## Notable design choices

- **Local-first.** SQLite at `./data/app.db`. No auth, no cloud sync.
- **Adaptive column grid.** `repeat(N, minmax(220px, 1fr))` so 4–6 columns
  fit in one row without horizontal scroll.
- **Sparse `order` fields.** Columns and per-column jobs use 10-step
  ordering; reorder rewrites in one transaction via two-pass negative→
  positive renumber so the `@unique` constraint never collides mid-move.
- **URL drawer.** Job detail opens via `?job=<id>` rather than an
  intercepting route — back-button friendly, deep-linkable, and avoids
  parallel-slot complexity.
- **Prompt caching.** The system block (persona + your profile) is
  marked `cache_control: ephemeral`. Generating multiple kits in the same
  five-minute window pays the cache only once.
- **Forced tool use.** The kit generator declares one tool
  (`emit_application_kit`) with strict input shape; the model is forced
  to call it. We never parse free-form JSON out of markdown.
- **Streaming.** Generate Kit reads the tool input as it streams in, parses
  the partial JSON with `partial-json`, and renders each section
  progressively. The first sentence of the cover letter appears in ~1s.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `n` | Open the Add-Job modal |
| `Esc` | Close any open dialog (Radix) |

## Scripts

```
npm run dev          start dev server (Turbopack)
npm run build        production build
npm run start        run the production build
npm run lint         eslint
npm run db:migrate   prisma migrate dev (interactive)
npm run db:reset     wipe + reapply migrations
npm run db:seed      run prisma/seed.ts
```
