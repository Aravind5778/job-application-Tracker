# Job Search Copilot

A local-only web app for tracking a job search and generating tailored
application kits (cover letter, four résumé bullets, five likely interview
questions, one-page company brief) with one click.

Stack: **Next.js 16 · TypeScript · Tailwind v4 · Prisma 7 + SQLite ·
dnd-kit · Radix UI · Google Gemini (2.5 Flash / Flash-Lite) via
@google/genai · @react-pdf/renderer**.

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

Google Gemini API key (required for **Generate Kit** and for AI-assisted
listing parsing on the paste flow). Gemini's free tier is generous
(thousands of requests/day on `gemini-2.5-flash`) and requires no credit
card — get a key at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey).

- **Easiest**: open the app, go to **Settings → Google Gemini API key**,
  paste your key. Stored in the local SQLite DB; never logged or echoed
  back.
- **Env var (overrides DB value)**: add to `.env`:
  ```
  GEMINI_API_KEY=AIza…
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
- **Structured output.** Kit generation uses Gemini's
  `responseMimeType: "application/json"` + `responseJsonSchema` — the
  model is required to return valid JSON matching the shape. We never
  parse free-form JSON out of markdown.
- **Free tier by default.** Gemini 2.5 Flash powers kit generation;
  Flash-Lite powers the smaller paste-flow meta-extract. Both sit inside
  Google's free daily quota for typical personal-search volume.
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
