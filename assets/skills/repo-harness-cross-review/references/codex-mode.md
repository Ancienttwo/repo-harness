# Codex provider mode

Runs the Codex CLI (`codex exec -s read-only`) as a read-only reviewer.
Codex has its own read-only Bash access, so it re-derives the diff itself
against the exact pinned base revision (a resolved commit SHA, never a
floating branch name) rather than receiving embedded diff text -- this
guarantees the review is bound to one base revision even if the branch
advances while the review runs.

## Reasoning effort and timeout

- `model_reasoning_effort="high"`.
- Default budget: 1800 seconds (override via the CLI's `--timeout-ms`). A
  large diff at high reasoning effort can legitimately run long with no
  stdout in the meantime -- a short budget kills healthy runs.
- stdin receives no data, so it reaches EOF immediately -- avoiding a known
  Codex stdin deadlock.

## Command

```bash
repo-harness cross-review --provider codex
```

## Boundaries

- No merge-gate: this mode never produces or verifies a `merge-gate` receipt.
- No semantic fallback: a nonzero exit or timeout is reported as an
  explicit failure code, never retried against Claude instead.
