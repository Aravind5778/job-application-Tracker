@AGENTS.md

# Project — Job Search Copilot

Local-only, single-user job-application tracker with:

- **Generate Kit** — cover letter, 4 résumé bullets, 10 interview questions
  (each with a full first-person practice answer), 1-page company brief.
- **Automatic job search** — Gemini-grounded discovery + Greenhouse/Lever/
  Ashby JSON-feed subscriptions, scored and dropped into a Suggested column
  with auto-kit on the top 3.

See `README.md` for the user-facing overview and `design.md` for the Linear
dark-canvas visual system (strict — read it before adding UI).

Plan / roadmap history lives at
`/Users/aravinda/.claude/plans/plan-a-web-application-mellow-parrot.md`.

## Stack

- **Next.js 16** (Turbopack, App Router) + **React 19** + TypeScript
- **Tailwind CSS v4** — CSS-first `@theme` config in `src/app/globals.css`
  (no `tailwind.config.ts` — v4 removed it)
- **Prisma 7** + SQLite at `./data/app.db`
- **Google GenAI SDK** (`@google/genai`) — Gemini 2.5 Flash for kit
  generation + grounded search, Flash-Lite for paste-flow meta-extract and
  candidate scoring. Free tier is the default target; API key comes from
  `GEMINI_API_KEY` env or the DB `google_api_key` Setting row.
- **dnd-kit** for board drag-and-drop
- **Radix Dialog** for modal + drawer primitives (thin wrapper in
  `src/components/ui/dialog.tsx`); **Radix ContextMenu** for right-click
  Delete on job cards (`src/components/ui/context-menu.tsx`)
- **@react-pdf/renderer** for cover-letter export
- `pdf-parse` v2 + `mammoth` for résumé file extraction

## Project skills

`.claude/skills/scope-a-feature/` — auto-invokes when the user says "I want
to add", "let's add", "can you add", "build me a", etc. Turns the raw idea
into an approved plan via sharp clarifying questions + adjacent-feature
suggestions before any code is written. Do NOT invoke for small tweaks.

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

**Gemini `thinkingBudget: 0` on structured-output calls.** Gemini 2.5
models bill "thinking" tokens against the same output-token budget as the
visible response. A kit call with `maxOutputTokens: 4000` could burn 3k+
tokens on thinking and truncate the JSON mid-string. Every structured-
output call — kit gen (streaming + non-streaming), regenerate section,
meta-extract, scorer — passes `thinkingConfig: { thinkingBudget: 0 }`.
The kit gen ceiling is 16384; nothing else needs more than 6k.

**Gemini `googleSearch` tool + `responseJsonSchema` can't combine.** Live
grounded search (`tools: [{ googleSearch: {} }]`) is incompatible with
`responseJsonSchema`. Grounded search in `src/lib/search/grounded-search.ts`
prompts hard for JSON, extracts markdown-fenced or bare arrays, and drops
malformed rows. Not perfect — a two-call pattern (search → structured
extractor) is the eventual fix.

**URL canonicalization trap.** Stripe's Greenhouse feed encodes the job ID
as a `?gh_jid=…` query param — every posting has the same path. My first
`canonUrl` stripped the entire query string, which collapsed 495 candidates
to 1. `src/lib/search/dedup.ts` now strips only fragments and known
tracking params (`utm_*`, `gh_src`, `ref`, `source`, etc.) and sorts the
rest for a stable key.

**React 19 hydration is strict.** Two patterns we hit and their fixes:
- **`toLocaleString()` in client components** — server (`en-US`) and browser
  (client locale) produce different strings → mismatch. Add
  `suppressHydrationWarning` on the wrapping element; the client's format is
  what we want anyway. See `ProfileEditor` footer and `KitPanel` header.
- **dnd-kit `useSortable`** emits `aria-describedby="DndDescribedBy-N"` where
  N drifts between SSR and first client render. Fix in `board-grid.tsx`: a
  mount-flag renders a plain `StaticJobCard` on SSR + first render, then
  swaps to `SortableJobCard` after `useEffect`. `JobCardContent` +
  `CardContextMenuWrapper` are both exported from `sortable-job-card.tsx`
  so the static card reuses the visual AND the right-click Delete menu.

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
- **`Setting` is a KV store** (`key` PK, `value` string). Notable keys:
  `google_api_key`, `search_config` (JSON blob for the search subsystem —
  location, seniority, recencyDays, savedQueries, atsFeeds).
- **"Suggested" column** is auto-provisioned by the search pipeline on
  first run at `order = min(existing) - 10` so it lands at the leftmost
  position. Not seeded — only exists once a search has run.

## AI subsystem

Powered by Google Gemini via `@google/genai`. Structured output is
enforced via `responseMimeType: "application/json"` + `responseJsonSchema`
(defined per-caller), so the model's response is guaranteed to match the
shape — no free-form JSON parsing.

Kit generation (`src/lib/kits.ts`):

- **`generateKit(jobId)`** — non-streaming, `POST /api/jobs/[id]/kit`.
- **`generateKitStream(jobId)`** — async generator that yields
  `partial` / `done` / `error` events, drives the NDJSON endpoint at
  `POST /api/jobs/[id]/kit/stream`. Accumulates Gemini's response text
  chunks and re-parses on every delta with `partial-json` (`Allow.ALL`),
  so the drawer's sections fill in progressively.
- **`regenerateKitSection(jobId, kind)`** — reuses the same schema; passes
  the other sections as a "voice sample" in the user message; writes only
  the target section back.

Auto job search (`src/lib/search/`):

- **`run.ts`** — orchestrator. Fans out ATS-feed fetches + grounded
  searches in parallel, dedups against the board + within-batch,
  keyword-pre-filters big ATS boards (Stripe alone returns ~500 postings)
  down to plausibly-relevant titles, caps at `MAX_SCORE_BATCH = 50`,
  batch-scores with Flash-Lite, inserts every candidate ≥ threshold 40
  into "Suggested", and fires kit gen for the top 3 in the background
  (`void generateKitsInBackground(topIds)` — the dev process keeps the
  promises alive after the API response is sent).
- **`ats-feeds.ts`** — Greenhouse, Lever, Ashby JSON-feed adapters,
  normalized to a common `Candidate` shape.
- **`grounded-search.ts`** — Gemini 2.5 Flash + `googleSearch` tool for
  open-web discovery.
- **`score.ts`** — one Flash-Lite call scoring every candidate 0–100 with
  a one-line reason, driven by a strict JSON schema.
- **`dedup.ts`** — URL canonicalization + `(company, role)` pair keys.

Paste-flow meta-extract (`src/lib/parse/meta-extract.ts`):

- Small Flash-Lite call with a `{ company, role, location }` schema.
  Returns null when no API key is configured so the UI degrades to
  hand-fill.

**Prompt caching.** Gemini's free tier gets fresh token allocation per
request, so we don't wire explicit context caching. If you ever swap to
the paid tier, `client.caches.create({...})` + a `cachedContent` field on
the config is where that would go.

**API key resolution** (`src/lib/ai/client.ts::getGoogleClient`): env
`GEMINI_API_KEY` wins; falls back to the `Setting` row
`key = google_api_key` (populated via `/settings`). Returns null (not
throws) when neither is set so callers can degrade.

## Verification workflow

- **Before claiming a change works**: `npx tsc --noEmit` + `npm run lint` +
  `npm run build`. All three must be clean.
- **UI-observable changes**: use `preview_*` tools (server already tracked
  in `.claude/launch.json`; `autoPort: true`). Check `preview_console_logs
  level=error` after any change that touches SSR / hydration.
- **AI paths**: end-to-end verification needs the Gemini key. Absent one,
  exercise the graceful degradation path (kit gen refuses with a useful
  error; meta-extract returns null; scorer defaults to neutral 50s).
- **Search paths**: for ATS-feed adapters, run `curl` against the public
  feed URL first (`boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true`,
  `api.lever.co/v0/postings/<slug>?mode=json`,
  `api.ashbyhq.com/posting-api/job-board/<slug>`) to confirm the shape
  before wiring an adapter.
- **Never assume the DB state.** `curl` against the API to inspect real
  data before making UX assumptions — but be aware that `PATCH /api/profile`
  overwrites the singleton (learned the hard way — never test PATCH with
  placeholder text against a populated DB).

## File map (short)

```
.claude/
  skills/scope-a-feature/SKILL.md   auto-invoked feature-scoping skill

src/app/
  api/
    jobs/                CRUD + reorder + kit endpoints + cover-letter.pdf
    columns/             CRUD + reorder
    profile/             GET/PATCH + extract-resume (multipart PDF/DOCX)
    parse-listing/       URL fetch + Haiku paste meta-extract
    search/              POST /api/search + GET/PATCH /api/search/settings
    settings/google-key/ GET status + PATCH rotate
  page.tsx               /            board (full-screen JobDetailDrawer)
  profile/page.tsx       /profile     résumé + background editors
  settings/page.tsx      /settings    columns, API key, AI usage, job search
  error.tsx              global error boundary
  layout.tsx             theme init + fonts + KeyboardShortcuts

src/components/
  board/               BoardGrid (DnD island), SortableJobCard,
                       StaticJobCard, CardContextMenuWrapper
  job/                 AddJobModal, JobDetailDrawer, KitPanel,
                       FindJobsModal
  profile/             ProfileEditor
  settings/            ColumnsEditor, ApiKeyEditor, AiLogTable,
                       SearchSettings
  theme/               ThemeProvider + ThemeToggle (dark default)
  layout/              TopNav, KeyboardShortcuts
  ui/                  Button, BrandMark, Dialog (modal + drawer),
                       ContextMenu

src/lib/
  db.ts                Prisma singleton (better-sqlite3 adapter)
  columns.ts / jobs.ts service layer + reorder
  kits.ts              generateKit / generateKitStream / regenerateKitSection
  profile.ts           singleton row helpers
  kit-markdown.ts      markdown renderers per section
  ai-log.ts            AiLog read helpers for the Settings usage table
  ai/
    client.ts          getGoogleClient + model constants
    kit-tool.ts        Kit JSON Schema (drives Gemini responseJsonSchema)
    prompts.ts         system-instruction builder
  parse/
    fetch-url.ts       10s timeout + desktop UA
    jsonld.ts          schema.org JobPosting from HTML
    readability.ts     Mozilla Readability fallback
    meta-extract.ts    Gemini Flash-Lite company/role/location
    resume-file.ts     PDF (pdf-parse v2) + DOCX (mammoth)
  search/
    config.ts          get/set SearchConfig (Setting.search_config JSON)
    candidate.ts       shared Candidate / ScoredCandidate types
    ats-feeds.ts       Greenhouse/Lever/Ashby JSON-feed adapters
    grounded-search.ts Gemini + googleSearch tool
    score.ts           Flash-Lite batch scoring
    dedup.ts           URL canonicalization + pair keys
    run.ts             orchestrator (ATS + grounded → dedup → score →
                       insert → background auto-kit top 3)
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
- **Delete is one-click, no confirm dialog.** Explicit user preference —
  applies to the right-click card menu, the Kit-panel Delete button, and
  the Settings column Delete. Prisma cascades handle downstream cleanup
  (deleting a job drops its kit + sections; deleting a column drops its
  jobs). The only remaining `confirm()` is the résumé-overwrite prompt in
  ProfileEditor, which guards against losing typed content, not a delete.
