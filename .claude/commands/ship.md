---
description: End-of-session ship summary — what was done, how, and what changed
---

Produce a concise ship summary for the current session. The next reader
(future me, a new Claude session, or a teammate) should be able to pick
up cold from your output alone.

## Gather ground truth first

Before writing anything, run these in parallel to establish the concrete
delta since the session began:

- `git status` — uncommitted work
- `git diff --stat HEAD` — scale of unstaged changes
- `git log --oneline -20` — commits made this session (filter by time
  against the session start if you know it; otherwise take the most
  recent commits that match this session's work)
- `git diff --stat <first-session-commit>~..HEAD` if there were commits,
  to see the full session footprint

Don't invent activity that isn't in the diff, the log, or your memory of
the conversation. If you can't corroborate a claim, omit it.

## Output structure

Adapt the emphasis to the shape of the work:

- **Code-heavy session** — lead with **How** (design decisions, trade-offs,
  things tried and abandoned). Git diff shows the *what*; only you know
  the *why*.
- **Doc / config / planning session** — drop **How** entirely. Doc edits
  rarely have decisions worth logging separately from the diff.
- **Mixed** — include **How** but keep it terse.

Emit these sections in order. Skip any section that would be empty
(don't write "N/A" or "Nothing here").

### What I did
Bulleted list of the discrete outcomes this session — one line each.
Frame as accomplishments, not activity ("Added right-click Delete to job
cards" not "Worked on job cards"). Reference files as markdown links.

### How
Only for code sessions. One line per non-obvious decision: what was
picked and why. Include anything that was attempted and rolled back —
that's exactly the context the next session needs and the diff won't show.

### Changes
- **Commits** — `short-sha subject` for each commit made this session.
- **Uncommitted** — files in the working tree not yet committed, with a
  one-line note on each. Group as *added / modified / deleted*.

### Still open
Anything half-done, blocked, or waiting on a decision. If there's
genuinely nothing, write a single line: `Nothing outstanding.`

## Rules

- Keep the whole summary under ~300 words unless the session was
  genuinely large.
- Format file references as markdown links (`[path](path)` or with
  `:line` suffix) so they're clickable.
- No emojis, no filler ("Great session!", "Here's what we did!").
- Don't restate the obvious ("Made changes to files" — say which files
  and what changed).
- If the session had no meaningful activity (a question answered, nothing
  written), just say so in one line and stop.
