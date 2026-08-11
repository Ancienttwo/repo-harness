# Claude provider mode

Runs the Claude Code CLI (`claude -p`) as a read-only reviewer. Claude is
started with `--safe-mode` so host hooks, plugins, MCP servers, and repository
instructions cannot mutate or block the review process while the normal OAuth
credential remains available. It is given only `Read,Grep,Glob` (no `Bash`/`Edit`/`Write`),
so it cannot edit your code; the review scope's diff text is embedded directly
in the prompt since Claude has no Bash access to inspect the repo itself.

## Model and timeout

- Pinned to the `fable` alias so the external opinion does not silently
  follow the host's default model.
- Exactly two attempts, whatever went wrong: any failed attempt (timeout,
  nonzero exit, auth failure, empty or malformed output) consumes one, and
  attempt 2 always re-runs on `opus` -- never a third attempt, never a
  fallback to a different provider. A nonzero exit is a failed attempt even
  when it wrote stdout.
- Per-attempt default budget: 330 seconds; the bounded two-attempt route
  therefore has a 660-second worst-case budget.
- Both attempts spent without a usable transcript -> `skipped`: advisory and
  non-blocking (exit 0). Proceed on your own review; do not re-run the review
  or narrow the diff to retry it.
- Claude Code must support `--safe-mode`; an older CLI fails closed instead of
  loading host hooks or silently dropping isolation.

## Transcript recovery

Claude Code persists print-mode sessions to
`~/.claude/projects/<project>/<session-id>.jsonl`. If stdout is empty, the
runner recovers the last assistant message from the most recent matching
session file started after the run began. If a session file is found but no
usable assistant text can be extracted from it, that attempt fails with the
explicit `malformed_transcript` code -- recovered text is never treated as a
passing review when the run itself timed out or exited nonzero.

## Command

```bash
repo-harness cross-review --provider claude
```

## Boundaries

- No merge-gate: this mode never produces or verifies a `merge-gate` receipt.
- No semantic fallback: timeout, empty output, malformed transcript, and
  auth failure are reported as distinct, explicit codes -- never
  silently retried against Codex instead, and a `skipped` run is never a pass.
- Only `degraded_scope` (the harness could not observe what to review) is
  blocking, with exit 1. Provider unavailability is advisory.
