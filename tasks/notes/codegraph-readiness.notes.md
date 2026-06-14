# Implementation Notes: codegraph-readiness

> **Status**: Complete
> **Plan**: plans/plan-20260528-1652-codegraph-readiness.md
> **Contract**: tasks/contracts/codegraph-readiness.contract.md
> **Review**: tasks/reviews/codegraph-readiness.review.md
> **Last Updated**: 2026-05-28
> **Lifecycle**: planning notes

## Review Corrections Applied

The initial captured plan picked the right product shape, but it missed three execution gates:

1. The plan referenced `tasks/contracts/codegraph-readiness.contract.md`, `tasks/notes/codegraph-readiness.notes.md`, and `tasks/reviews/codegraph-readiness.review.md` before those files existed.
2. Existing generated policy surfaces still say CodeGraph should not be a package dependency.
3. Existing `scripts/check-agent-tooling.sh` already has CodeGraph readiness logic, so the CLI implementation must migrate or wrap that behavior instead of inventing a second detector.

## Decisions

- Keep Option D: unified `agentic-dev` CLI surface, separate `tools` registry.
- Keep `agentic-dev install --target codex|claude|both` host-adapter only.
- Make `agentic-dev doctor` read-only. It may report and print commands, but it must not run `bun install`, `codegraph init`, `codegraph sync`, or MCP install.
- Put mutations under `agentic-dev tools ensure codegraph`.
- Keep MCP writes opt-in and out of this slice.
- Treat `--strict-readiness` as existing; it is already implemented by `scripts/check-agent-tooling.sh`.
- Use local-first resolution: repo `node_modules/.bin/codegraph`, then optional global fallback.

## Existing Surfaces To Reuse

- `scripts/check-agent-tooling.sh` already detects CodeGraph CLI, Codex MCP config, project index state, update state, and strict readiness failures.
- `tests/check-agent-tooling.test.ts` already protects read-only update checks and strict CodeGraph readiness behavior.
- `.ai/harness/policy.json`, `scripts/ensure-task-workflow.sh`, and `scripts/lib/project-init-lib.sh` currently encode CodeGraph as global MCP tooling with `vendoring_policy: do-not-add-package-dependency`.

## Implementation Constraints

- Do not let CodeGraph vendoring silently change downstream generated repo policy unless tests explicitly accept that new default.
- If vendoring is intended only for this self-host repo, make that exception explicit in docs and policy.
- Keep failure output bounded. Tool stdout/stderr captured by the new CLI should cap inline text and point to log files for overflow.
- Do not use `codegraph affected` as the verification selector for this repo; many tests execute scripts through subprocesses.

## Follow-ups Resolved In CLI Registration

- Shared CodeGraph action types stayed local to `src/cli/tools/codegraph.ts`; a generic `src/cli/tools/types.ts` can wait for the second tool.
- Added a regression proving `agentic-dev doctor --json` reports CodeGraph readiness without running `bun install`, `codegraph init`, `codegraph sync`, or `codegraph install`.

## 2026-05-28 Dependency + Detector Slice

- Added `@colbymchenry/codegraph` as a self-host `devDependency`; downstream generated repos keep their default `do-not-add-package-dependency` policy unless local policy opts in.
- Added `scripts/ensure-codegraph.sh` and temporary `src/cli/tools/codegraph-runner.ts`. `--check` delegates to `scripts/check-agent-tooling.sh` and is read-only.
- Added `src/cli/tools/codegraph.ts` as the future CLI facade with `resolveCodegraph`, `checkCodegraph`, and `ensureCodegraph` exports.
- Updated `scripts/check-agent-tooling.sh` to resolve local `node_modules/.bin/codegraph` before global `codegraph`, report source/fallback/drift, and keep `--strict-readiness` behavior.
- Kept MCP writes out of the default path. The self-host policy now points to `bun install` and `scripts/ensure-codegraph.sh`; global MCP install remains an explicit command.
- Tightened `bunfig.toml` to `root = "tests"` after verifying Bun 1.3.10 still discovered `_ref/codegraph/__tests__` even with `pathIgnorePatterns`. `_ref/` is an ignored reference checkout, so broad repo verification must start from the owned `tests/` tree.

## Remaining Gap

- None for the CodeGraph readiness contract. The separate projection-gate / queued-plan state-model hardening remains an independent harness workflow slice and is intentionally out of this implementation.

## 2026-05-28 CLI Registration Slice

- Added `agentic-dev tools ensure codegraph` on the merged Commander surface. `--check` is read-only; default ensure can install missing local deps, and `--init` / `--sync` are explicit mutation flags.
- Moved the mutating ensure logic into `src/cli/tools/codegraph.ts` so `scripts/ensure-codegraph.sh` can call the official CLI path instead of the temporary runner.
- Removed the temporary `src/cli/tools/codegraph-runner.ts` after the official CLI path was wired, so there is no second executable entrypoint for CodeGraph ensure behavior.
- Added `codegraph-readiness` to `agentic-dev doctor`; it calls the existing `check-agent-tooling.sh` detector through `checkCodegraph()` and maps `present` to ok, `warning` / `partial` to warn, and `missing` to fail.
- Kept the host adapter boundary intact: `agentic-dev install --target codex|claude|both` remains host-only, and this slice still does not write MCP config by default.
- Added CLI and integration coverage for the read-only path, shell adapter parity, and doctor non-mutation.

## 2026-05-29 Claude Tool Search Pin

- Claude Code's current MCP Tool Search default can defer CodeGraph schemas even when the server, index, and permissions are configured; `allowedTools` is permission, not eager schema loading.
- `repo-harness tools configure codegraph --target claude --location global` now sets `mcpServers.codegraph.alwaysLoad = true` in `~/.claude.json` after first-time CodeGraph install.
- Because upstream `codegraph install --target claude` rewrites `~/.claude.json` without preserving `alwaysLoad`, repo-harness skips that install when the Claude global MCP entry is already present and only repairs the always-load pin plus allowed-tools entry.
- Chosen tradeoff: pin only the CodeGraph server so structural code-navigation tools stay directly visible while other high-cardinality MCP/plugin tools can remain deferred.
- The detector now reports Claude CodeGraph MCP as `deferred` when the server entry exists without `alwaysLoad=true`; doctor surfaces that as a warning with the same configure command as remediation.

## 2026-06-14 Local Bundle Resolver Slice

- `repo-harness setup check --target codex --check-updates --json` reported `index=unavailable` even though global `codegraph status /Users/ancienttwo/Projects/agentic-dev` and the repo-local platform bundle both read the index as up to date.
- The pressure point was the npm shim at `node_modules/.bin/codegraph`: direct execution could hang before `--version`, while `node_modules/@colbymchenry/codegraph-darwin-arm64/bin/codegraph` returned immediately.
- The detector now resolves the local platform optionalDependency launcher before falling back to `.bin/codegraph`; explicit `AGENTIC_DEV_CODEGRAPH_LOCAL_BIN` still wins for tests and operator override.
- This keeps the self-host repo's local dependency boundary intact without falling back to global CodeGraph when the checked-in package has a working platform bundle.
- Regression coverage lives in `tests/check-agent-tooling.test.ts` and proves an unusable `.bin` shim no longer turns a ready local index into `project_index=unavailable`.
