---
name: scope-a-feature
description: Use when the user asks to add or build a feature — phrasings like "I want to add", "let's add", "can you add", "build me a", "I need a feature that…", or any description of new functionality they want. Turns the raw idea into an approved plan via sharp clarifying questions, explicit edge-case probing, and adjacent-feature suggestions BEFORE any code is written. Do NOT invoke for small tweaks to an existing feature (e.g. "make the button bigger", "rename this label").
---

# Scope a Feature

Idea → questions → approved plan → build. **Never skip approval.**

## Flow

1. **Ask 3–5 sharp questions.** Cover who uses it and when, the happy path, hard edge cases (empty state, error path, feature interactions, race conditions), and how it fits with what already exists in this project. Use `AskUserQuestion` when the choices are bounded — free-text only when they're truly open-ended.
2. **Recommend 2–3 adjacent features** that would compound with the idea. One line each, with the tradeoff. ("Also add X — bigger scope but unlocks Y.")
3. **Offer 1–2 variations** the user may not have considered — a "have you thought about…" angle that reframes the problem.
4. **Stop and wait** for the user's answers. Do not write code, spec docs, or ask another round of questions.
5. **Restate the plan in one paragraph** once they answer: what the feature does, what's in and out of scope, and a one-sentence approach. Ask for approval explicitly.
6. **Build only after approval** ("go", "yes", "approved", or equivalent). If the user redirects, loop back to step 4 with the updated understanding.

## Guardrails

- Max 5 questions per round — pick the most load-bearing.
- No code, spec files, subagents, or file edits before the paragraph is approved.
- Skip this skill for tweaks to existing features; it's for genuinely new functionality.
- If the idea is huge (multiple subsystems), say so and offer to slice it into the smallest end-to-end version first.
