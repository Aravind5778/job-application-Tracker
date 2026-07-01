@AGENTS.md

# Project — Job Search Copilot

Local-only, single-user job-application tracker + Anthropic-powered "Generate
Kit" (cover letter, 4 résumé bullets, 5 interview questions, 1-page company
brief). See `README.md` for the user-facing overview and `design.md` for the
Linear dark-canvas visual system (strict — read it before adding UI).

Plan / roadmap history lives at
`/Users/aravinda/.claude/plans/plan-a-web-application-mellow-parrot.md`.

## Stack

- **Next.js 16** (Turbopack, App Router) + **React 19** + TypeScript
- **Tailwind CSS v4** — CSS-first `@theme` config in `src/app/globals.css`
  (no `tailwind.config.ts` — v4 removed it)
- **Prisma 7** + SQLite at `./data/app.db`
- **Anthropic SDK** (`@anthropic-ai/sdk`) — Opus for kit generation, Haiku for
  paste-flow meta-extract
- **dnd-kit** for board drag-and-drop
- **Radix Dialog** for modal + drawer primitives (thin wrapper in
  `src/components/ui/dialog.tsx`)
- **@react-pdf/renderer** for cover-letter export
- `pdf-parse` v2 + `mammoth` for résumé file extraction

## Gotchas that have already bitten us — read before repeating

**Prisma 7 setup.** The `url` field was removed from `datasource db` in
schema.prisma. Connection URL lives in `prisma.config.ts`; `PrismaClient` is
instantiated with the `PrismaBetterSqlite3` adapter (mixed-case, NOT
`PrismaBetterSQLite3` as some docs show — verify with
`Object.keys(require('@prisma/adapter-better-sqlite3'))`). See
`src/lib/db.ts`.

**pdf-parse v2 API.** Not the old `pdf(buffer)` default export. New shape:
`const { PDFParse } = await import('pdf-parse'); const p = new
PDFParse({data: buffer}); const {text} = await p.getText(); await
p.destroy();`. Also requires `serverExternalPackages: ["pdf-parse",
"pdfjs-dist"]` in `next.config.ts` — Turbopack otherwise bundles pdfjs and
loses its `pdf.worker.mjs`.

**React 19 hydration is strict.** Two patterns we hit and their fixes:
- **`toLocaleString()` in client components** — server (`en-US`) and browser
  (client locale) produce different strings → mismatch. Add
  `suppressHydrationWarning` on the wrapping element; the client's format is
  what we want anyway. See `ProfileEditor` footer and `KitPanel` header.
- **dnd-kit `useSortable`** emits `aria-describedby="DndDescribedBy-N"` where
  N drifts between SSR and first client render. Fix in `board-grid.tsx`: a
  mount-flag renders a plain `StaticJobCard` on SSR + first render, then
  swaps to `SortableJobCard` after `useEffect`. `JobCardContent` is exported
  from `sortable-job-card.tsx` so both share the same visual.

**`react-hooks/set-state-in-effect`.** New React 19 lint. Flags `setState`
inside `useEffect`. Usually right — but a one-time mount flag
(`useEffect(() => setMounted(true), [])`) is exactly what the rule is meant
to *not* catch and it's an over-trigger. Use
`// eslint-disable-next-line react-hooks/set-state-in-effect` with a comment
explaining. Only remaining site: `board-grid.tsx` mount guard.

**Inline `<script>` warning.** The theme-init inliner in
`src/app/layout.tsx` triggers React 19's "Encountered a script tag while
rendering React component" warning. It's a false positive for our case (SSR
writes the script, browser executes during parse). `next/script` with
`strategy="beforeInteractive"` triggers the same warning. Comment left in
place.

**Tailwind v4 tokens.** All design.md tokens are CSS variables under
`@theme inline` in `src/app/globals.css`, on both `:root` (dark, default) and
`[data-theme="light"]`. Tailwind auto-generates utility classes from those
names — so `--color-canvas` → `bg-canvas`, `--radius-lg` → `rounded-lg`,
`--text-display-md` → `text-display-md` (with the bundled line-height /
letter-spacing / font-weight variants). Don't add `tailwind.config.ts`.

**Route files with JSX** need `.tsx`, not `.ts`. Bit us on
`src/app/api/jobs/[id]/kit/cover-letter.pdf/route.tsx`.

## Data model quirks

- **Sparse ordering.** `Column.order` and per-column `Job.order` step by 10
  so individual inserts don't force a global renumber. Bulk reorders go
  through `reorderColumns()` / `reorderJobs()` which do a **two-pass
  negative→positive renumber inside a transaction** to dodge `@unique(order)`
  collisions mid-update. Compresses back to a clean `10, 20, 30…` sequence.
- **`Profile` is a singleton** at `id = "singleton"`. `getProfile()` upserts
  on read so callers never handle absence.
- **`Kit` has one row per job** (`@unique(jobId)`); `KitSection` rows keyed
  by `(kitId, kind)`. `content` is raw text for `cover_letter`, JSON-encoded
  for the rest. `editedContent` is nullable — user edits live there,
  regenerate clears it. See `src/lib/kits.ts` `encodeSection` /
  `decodeSection`.

## AI subsystem

Two entry points, both in `src/lib/`:

- **`kits.ts`** — `generateKit(jobId)` (non-streaming, `POST
  /api/jobs/[id]/kit`) and `generateKitStream(jobId)` (async generator that
  yields `partial` / `done` / `error` events, drives the streaming NDJSON
  endpoint at `/api/jobs/[id]/kit/stream`). Both use **forced tool-use** on
  the `emit_application_kit` tool (`src/lib/ai/kit-tool.ts`) — never parse
  free-form JSON. `regenerateKitSection(jobId, kind)` reuses the same tool,
  passes the other sections in the user message as a "voice sample," writes
  only the target section back.

- **`parse/meta-extract.ts`** — Haiku forced tool-use for extracting
  `{company, role, location}` from pasted listing text. Returns null when no
  API key is configured so the UI degrades to a hand-fill flow.

**Prompt caching.** The system block (persona + profile) is wrapped by
`buildSystemBlocks` (`src/lib/ai/prompts.ts`) with `cache_control:
ephemeral`. Multiple kits in the same 5-minute window pay for the profile
+ persona once. Cache hits show up in `AiLog.cacheReadTokens`.

**API key resolution** (`src/lib/ai/client.ts`): env `ANTHROPIC_API_KEY`
wins; falls back to the `Setting` row `key = anthropic_api_key` (populated
via `/settings`). Returns null (not throws) when neither is set so callers
can degrade.

## Verification workflow

- **Before claiming a change works**: `npx tsc --noEmit` + `npm run lint` +
  `npm run build`. All three must be clean.
- **UI-observable changes**: use `preview_*` tools (server already tracked
  in `.claude/launch.json`; `autoPort: true`). Check `preview_console_logs
  level=error` after any change that touches SSR / hydration.
- **AI paths**: end-to-end verification needs a real Anthropic key. Absent
  one, exercise the graceful degradation path (kit gen refuses with a
  useful error; meta-extract returns null).
- **Never assume the DB state.** `curl` against the API to inspect real
  data before making UX assumptions — but be aware that `PATCH /api/profile`
  overwrites the singleton (learned the hard way — never test PATCH with
  placeholder text against a populated DB).

## File map (short)

```
src/app/
  api/                 route handlers (jobs, columns, profile, kit, parse-listing, settings)
  page.tsx             /            board + JobDetailDrawer
  profile/page.tsx     /profile     résumé + background editors
  settings/page.tsx    /settings    columns, API key, AI usage log
  error.tsx            global error boundary
  layout.tsx           theme init + fonts + KeyboardShortcuts

src/components/
  board/               BoardGrid (DnD island), SortableJobCard, StaticJobCard
  job/                 AddJobModal, JobDetailDrawer, KitPanel
  profile/             ProfileEditor
  settings/            ColumnsEditor, ApiKeyEditor, AiLogTable
  theme/               ThemeProvider + ThemeToggle (dark default)
  layout/              TopNav, KeyboardShortcuts
  ui/                  Button, BrandMark, Dialog (modal + drawer)

src/lib/
  db.ts                Prisma singleton (better-sqlite3 adapter)
  columns.ts / jobs.ts service layer + reorder
  kits.ts              generateKit / generateKitStream / regenerateKitSection
  profile.ts           singleton row helpers
  kit-markdown.ts      markdown renderers per section
  ai/
    client.ts          getAnthropicClient + model constants
    kit-tool.ts        emit_application_kit tool schema + validate
    prompts.ts         system block builder (cached)
  parse/
    fetch-url.ts       10s timeout + desktop UA
    jsonld.ts          schema.org JobPosting from HTML
    readability.ts     Mozilla Readability fallback
    meta-extract.ts    Haiku company/role/location
    resume-file.ts     PDF (pdf-parse v2) + DOCX (mammoth)
  pdf/cover-letter.tsx @react-pdf/renderer document
```

## Style notes

- **No emojis in code / commits / docs** unless the user explicitly asks.
- **No new comments unless the *why* is non-obvious** (hidden constraint,
  workaround for a specific issue, surprising behavior). Don't restate
  what code obviously does.
- **Lavender (`--color-primary`) is scarce** per design.md — reserved for
  primary CTA, brand mark, focus ring, link emphasis. The one exception
  we ship is the `*` marker on required form fields.
- **Terminal columns** render their eyebrow in `--color-success` — the
  only chromatic semantic accent in the board chrome.
