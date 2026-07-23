---
name: repo-harness-cross-review
description: Independent cross-model review of the current review scope (branch diff plus staged, unstaged, untracked changes) from the opposite vendor's model. Catches spec drift, missing edge cases, and fake tests self-review cannot see. Use before merging, after a tricky change, or a debug second opinion.
when_to_use: "cross review, second opinion, outside voice, claude review, codex review, 让 claude 审, 让 codex 审, 找外部意见, 二审"
---

# repo-harness-cross-review

Canonical rule owner for opposite-provider review. Scope capture, provider
invocation, timeout, transcript recovery, and error classification live in
code (`src/core/review`, `src/effects/review`,
`src/cli/commands/cross-review.ts`); this package owns only when to invoke,
how to interpret findings, and the boundaries below.

## Mode Selection

- Inside Claude Code -> Codex's outside opinion: `references/codex-mode.md`.
- Inside Codex -> Claude's outside opinion: `references/claude-mode.md`.
- An explicit provider name request always wins over the host default.

## When to use

- Before merging an important diff (last gate).
- After writing a spec/tests -- find ambiguity and weak assertions.
- A hard bug whose root cause is unclear (independent diagnosis).

## Interpreting findings

- Present the transcript verbatim -- never summarize or soften it.
- Any `[P1]` finding -> **FAIL** (do not merge until addressed). Only `[P2]` or none -> **PASS**.
- Agreement raises confidence; divergence is where to dig. A recommendation, not a decision -- you decide.

## Boundaries

- Read-only: the provider never edits code (no Bash/Edit/Write for Claude; read-only sandbox for Codex).
- A provider failure (timeout, empty output, malformed transcript, auth failure, nonzero exit, degraded scope) is explicit. Never a fallback, never a synthesized pass.
- Never produces or verifies a `merge-gate` receipt; that judge is separate.
