# Hook Repo Isolation Notes

## Context

`UserPromptSubmit.default` can create repo-local Draft plans through `prompt-guard.sh`.
The host adapter is user-level, so repo isolation must be explicit before any
workflow file is written.

## Decision

- Managed host commands now export `HOOK_REPO_ROOT` from `git rev-parse --show-toplevel`
  before calling `repo-harness-hook` or the fallback `repo-harness hook`.
- The TypeScript hook runtime trusts an explicit `HOOK_REPO_ROOT` only when it is
  valid and not in conflict with the current git cwd. A conflict exits as a silent
  no-op before scripts run.
- `prompt-guard.sh` detects absolute paths that resolve to another git repo and
  skips automatic Draft plan creation or embedded plan capture in the current
  repo. This preserves advisory routing while preventing cross-repo workflow
  writes.

## Verification

- `bun test tests/cli/hook.test.ts tests/cli/install.test.ts tests/hook-runtime.test.ts`
- `bun test tests/hook-contracts.test.ts tests/installed-copy-sync.test.ts tests/hook-input-parse.test.ts`
