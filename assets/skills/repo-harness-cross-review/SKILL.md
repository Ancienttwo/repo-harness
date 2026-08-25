---
name: repo-harness-cross-review
description: Independent outside review of the current review scope (branch diff plus staged, unstaged, untracked changes). Claude hosts use direct Codex; Codex hosts use OpenAI's official Claude Code Codex plugin app-server runtime. Use before merging, after a tricky change, or for a debug second opinion.
when_to_use: "cross review, second opinion, outside voice, codex plugin review, codex review, 让 codex 审, 找外部意见, 二审"
---

# repo-harness-cross-review

Canonical rule owner for independent outside review. Scope capture, provider
invocation, timeout, structured-output validation, and error classification live in
code (`src/core/review`, `src/effects/review`,
`src/cli/commands/cross-review.ts`); this package owns only when to invoke,
how to interpret findings, and the boundaries below.

## Mode Selection

- Inside Claude Code -> direct Codex outside opinion: `references/codex-mode.md`.
- Inside Codex -> official `codex@openai-codex` plugin app-server outside opinion: `references/codex-plugin-mode.md`.
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

- Read-only: direct Codex and the official plugin app-server both use a read-only sandbox.
- Bounded: 2 provider attempts, then `SKIPPED` -- advisory, non-blocking (exit 0). Do not re-run it or narrow the diff to retry. `degraded_scope` and `stale_scope` block (exit 1). Never a synthesized pass.
- Never produces or verifies a `merge-gate` receipt; that judge is separate.
