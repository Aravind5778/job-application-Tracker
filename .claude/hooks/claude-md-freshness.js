#!/usr/bin/env node
/*
 * PostToolUse hook — nudges Claude to refresh CLAUDE.md after a feature-
 * shaped git commit that didn't already touch CLAUDE.md.
 *
 * Registered in .claude/settings.json against the Bash matcher.
 *
 * Failure mode is silent exit 0 — a broken hook must never block the tool.
 */

"use strict";

const { execFileSync } = require("child_process");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    run(JSON.parse(input));
  } catch {
    // never block
  }
});

// Commit subjects starting with one of these are treated as non-feature and
// skipped. Case-insensitive, whole-word (trailing space or `:` / `(` counts).
const SKIP_PREFIXES = [
  "fix",
  "docs",
  "doc",
  "chore",
  "refactor",
  "test",
  "tests",
  "style",
  "build",
  "ci",
  "perf",
  "revert",
  "merge",
  "drop",
  "remove",
  "update",
  "rename",
  "move",
  "bump",
  "tweak",
  "polish",
  "cleanup",
  "clean",
  "wip",
];

function run(payload) {
  if (payload.tool_name !== "Bash") return;

  const cmd = (payload.tool_input && payload.tool_input.command) || "";
  if (!/(^|[^A-Za-z0-9_])git[\s]+commit([^A-Za-z0-9_-]|$)/.test(cmd)) return;

  if (payload.tool_response && payload.tool_response.interrupted === true) return;

  const cwd = payload.cwd || process.cwd();
  const git = (args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };

  const sha = git(["rev-parse", "HEAD"]);
  if (!sha) return;

  // Confirm HEAD actually moved for THIS command by checking recency. If the
  // commit failed (e.g. pre-commit hook rejected it), HEAD is stale.
  const commitTime = parseInt(git(["log", "-1", "--format=%ct", "HEAD"]), 10);
  if (!commitTime || Date.now() / 1000 - commitTime > 60) return;

  const files = git([
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "HEAD",
  ])
    .split("\n")
    .filter(Boolean);
  if (files.includes("CLAUDE.md")) return;

  const subject = git(["log", "-1", "--format=%s", "HEAD"]);
  if (!subject) return;

  const firstWord = subject.split(/[\s(:]/, 1)[0].toLowerCase();
  if (SKIP_PREFIXES.includes(firstWord)) return;

  const shortSha = sha.slice(0, 7);
  const ctx =
    `Commit \`${shortSha}\` — "${subject}" — landed without touching CLAUDE.md. ` +
    `If this shipped a new capability (data-model change, new subsystem, new gotcha, ` +
    `new file map entry, new external dependency, changed convention), review CLAUDE.md ` +
    `and update it before the next task. If it's a routine change, ignore this reminder.`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: ctx,
      },
    }),
  );
}
