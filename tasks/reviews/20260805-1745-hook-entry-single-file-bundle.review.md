# Task Review: hook-entry-single-file-bundle

> **Status**: Complete
> **Plan**: plans/plan-20260805-1745-hook-entry-single-file-bundle.md
> **Contract**: tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md
> **Notes File**: tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-05 18:40
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

The two `pending` header fields above are rubric metadata only. The
authoritative reviewed-subject hash and target revision for this review are
the ones recorded in the Acceptance Receipt Projection below, which the
receipt tooling writes from the receipt itself; they are deliberately not
hand-copied here, because editing this file after the receipt is recorded
would invalidate the recorded subject hash.

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/cli/hook-entry.ts` dispatch branch; `src/cli/hook/session-context.ts` flag export; `src/effects/evidence/post-bash-importer.ts` build-time version constant; `package.json` prepack/bin/files; `.gitignore` `dist/`; `tests/bootstrap-files.test.ts` bin expectation; new `tests/unit/hook-entry-single-file-bundle.test.ts`
- Actual files changed: the intended set plus `src/core/adoption/source-checkout.ts` (canonical bin-map constant moved with the bin) and `tasks/todos.md` (ledger `Updated` header), plus the plan/contract/review/notes workflow artifacts. 8 tracked files modified (+49 -6) and 5 new files. No change outside the contract `allowed_paths`; `src/cli/installer/managed-entries.ts` untouched; `package.json` `version` unchanged at 0.13.0; the `repo-harness` main bin mapping unchanged.
- Commands passed: `bun run check:type`; `bun test` (2202 pass / 1 skip / 0 fail, 174 files, 504.66s); `bun test tests/unit/hook-entry-single-file-bundle.test.ts` (5 pass); `bash scripts/check-tarball-install-smoke.sh`; `bash scripts/verify-contract.sh --strict --read-only` (total=9 failed=0 status=Fulfilled); `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `run check-task-workflow --strict`; `bun scripts/inspect-project-state.ts --repo . --format text`; `bun src/cli/index.ts init --repo . --dry-run`
- Residual risks: see Residual Risks / Follow-ups
- Reviewer action required: none; findings below are advisory and out of this contract's scope
- Rollback: revert the single branch commit; the bin returns to `src/cli/hook-entry.ts` and the prepack script and dispatch branch disappear. No adapter or settings migration involved.

## Mode Evidence

- Selected route: acceptance gate review of the full working-tree diff against the contract Goal / Scope / Allowed Paths / Exit Criteria.
- P1/P2/P3 evidence: P1 - the shipping surface is `package.json` bin/files/prepack, the hook entry `src/cli/hook-entry.ts`, its statically imported runtime chain into `src/cli/hook/session-context.ts`, and the evidence producer `src/effects/evidence/post-bash-importer.ts`; the managed adapter surface `src/cli/installer/managed-entries.ts` is explicitly out of scope. P2 - traced the detached tooling populate end to end: `triggerDetachedToolingPopulate` (session-context.ts:1203) spawns `fileURLToPath(import.meta.url)` with `DETACHED_TOOLING_POPULATE_FLAG`; unbundled that URL is session-context.ts and its `import.meta.main` bootstrap (session-context.ts:1479) receives it; bundled, `bun build` folds that bootstrap to `false` and the URL resolves to the bundle, so `src/cli/hook-entry.ts:109` receives the same argv shape and calls the same exported `runDetachedToolingPopulate`. Verified in the built artifact: `grep -c runDetachedToolingPopulate dist/hook-entry.js` = 2 (one definition, one hook-entry call site), i.e. the eliminated bootstrap is really gone and no second authority exists. P3 - the bin retarget is safe precisely because the managed adapter command resolves the hook by command name (`command -v repo-harness-hook`, managed-entries.ts:42) rather than by path, so `timeout: 30` and the command strings stay byte-identical while the bin target moves.
- Root cause or plan evidence: contract Task Profile is `code-change`, so the Root Cause Evidence block is not required and was left as-is.

## Verification Evidence

- Waza `/check` run: not run as a separate skill; the contract's own exit-criteria commands plus the repo's required checks were run directly and are listed below.
- Commands run:

| Command | Result |
|---|---|
| `bun run check:type` | exit 0 |
| `bun test` | 2202 pass / 1 skip / 0 fail, 174 files, 504.66s, exit 0 |
| `bun test tests/unit/hook-entry-single-file-bundle.test.ts` | 5 pass / 0 fail, 22 expect() calls |
| `bash scripts/check-tarball-install-smoke.sh` | exit 0, `[tarball-smoke] OK: repo-harness-0.13.0.tgz installs and packaged CLI bins start.` |
| `bash scripts/verify-contract.sh --contract tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md --strict --read-only` | `[ContractVerify] total=9 failed=0 status=Fulfilled`, exit 0 |
| `bash scripts/check-deploy-sql-order.sh` | exit 0, `[deploy-sql] OK` |
| `bash scripts/check-architecture-sync.sh` | exit 0, advisory mode; the pending `docs/architecture/requests/root.md` request predates this branch (commit aad37e6a) and is unmodified here |
| `bash scripts/check-task-sync.sh` | exit 0, `[task-sync] Repo changes include synchronized tasks/ updates.` |
| `bun src/cli/index.ts run check-task-workflow --strict` | exit 0, `[workflow] OK` |
| `bun scripts/inspect-project-state.ts --repo . --format text` | exit 0, no drift signals, no required decisions |
| `bun src/cli/index.ts init --repo . --dry-run` | exit 0, warning `self-host-source-noop` (proves the self-host detector still matches after the bin-map constant moved) |

- Manual checks:
  - `head -1 dist/hook-entry.js` = `#!/usr/bin/env bun`.
  - `grep -c runDetachedToolingPopulate dist/hook-entry.js` = 2.
  - `echo '{"session_id":"gate-probe","hook_event_name":"UserPromptSubmit","prompt":"x"}' | HOOK_HOST=claude HOOK_REPO_ROOT=$(pwd) bun dist/hook-entry.js UserPromptSubmit --route default` exits 0.
  - Injected version landed: `dist/hook-entry.js:11337` reads `var BUNDLED_CLI_VERSION = "0.13.0".length > 0 ? "0.13.0" : null;`, and the pre-substitution identifier is absent from the bundle.
  - Contract falsifier exercised: 25 UserPromptSubmit probes against `dist/hook-entry.js` while 40 `rename(2)` swaps replaced the bundle underneath them - 0 failures, 0 probes over 3s. The atomic-swap claim holds.
  - Hot-path latency parity: bundle 0.13 / 0.18 / 0.13 s vs source tree 0.13 / 0.14 / 0.15 s for `state-snapshot --json` (`/usr/bin/time -p`, 3 runs each).
  - Bundle scope: `dist/hook-entry.js` contains exactly one `providerCliVersion`, so the sibling `"0.0.0"` fallbacks in `verify-producer.ts` and `attested-import.ts` are not in the shipped hook graph.
  - Adapter invariants: `src/cli/installer/managed-entries.ts` is absent from the diff; its command string resolves `repo-harness-hook` by name and its `timeout: 30` is unchanged.
- Supporting artifacts: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`.
- Implementation notes reviewed: `tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md` - the recorded deviations match the diff; no undisclosed change was found.
- Run snapshot: `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:b524d2e1ee0c1b2d29c5e1e74667695c852ce142e8294ed3f248a838214e16b8
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 9330fd43a4d22699039f34c0098fecdd3aa86a18
> **Verification Evidence SHA256**: sha256:40659cfffe7fd48f43e88833c7613d238abe1fd1cef5bb40a453f327f17a5593
> **Issued At**: 2026-08-06T18:34:36.357Z

- Summary: Gatekeeper PASS, re-bound after the authorized push moved origin/main to 9330fd43. repo-harness-hook ships as a prepack-built single-file bundle dist/hook-entry.js; the detached tooling populate survives bundling via one explicit hook-entry dispatch branch sharing the exported runDetachedToolingPopulate authority, and the bundled provider version is injected at build time so the bundled path never emits the invented 0.0.0. Managed adapter command strings, timeout 30, and the repo-harness main bin mapping stay byte-identical; managed-entries.ts is absent from the diff and resolves the hook by command name. Verified directly: bundle shebang, grep -c runDetachedToolingPopulate = 2, injected version 0.13.0, UserPromptSubmit probe exit 0, and the contract falsifier - 25 hook probes during 40 atomic rename swaps, 0 failures - plus latency parity 0.13-0.18s bundle vs 0.13-0.15s source. Self-host detector change at source-checkout.ts:40 correct both sides: init dry-run still emits self-host-source-noop and downstream repos short-circuit on name mismatch. Patch-id stable across the whole rebase chain 699bc70c to dbf0a397 to c94a5d41 to 9330fd43 at 595a998c0852f75943b83759240e9143652b72b3, so the original PASS review carries over unchanged. Four earlier rounds were blocked by harness limits unrelated to this diff - verification budget, an outer wrapper below the inner gate, missing failure-log retention, and five load-sensitive tests - each shipped as its own work-package first. This round: total=9 failed=0 Fulfilled with bun test green.
- Findings: none

## Behavior Diff Notes

- `repo-harness-hook` now resolves to `dist/hook-entry.js`, a prepack-built single file, instead of the live multi-file TS graph. Registry reinstalls therefore replace one file rather than a partially-resolvable import tree.
- The detached tooling populate keeps working from the bundle through the new `src/cli/hook-entry.ts:109` branch. Argv mapping matches the session-context bootstrap exactly, and both surfaces call the same exported `runDetachedToolingPopulate`, so the populate has one authority and two dispatch surfaces.
- Bundled evidence records now carry the real package version (`repo-harness/0.13.0/...`) instead of the invented `0.0.0` that the bundled `import.meta.url` path-walk would have produced. A bundle built without the `--define` fails at build time; there is no runtime fallback.
- Unbundled runs are unchanged: `REPO_HARNESS_BUNDLED_CLI_VERSION` is undeclared, the `typeof` guard yields `null`, and `providerCliVersion()` keeps reading `package.json` through `PACKAGE_ROOT`.

## Residual Risks / Follow-ups

- MEDIUM (advisory, out of scope here) `package.json:60`: the `build:hook-bundle` gate only catches "the `--define` did not land"; it does not catch "the define landed as an empty string". Measured: `bun build ... --define REPO_HARNESS_BUNDLED_CLI_VERSION='""'` exits 0 and emits `var BUNDLED_CLI_VERSION = "".length > 0 ? "" : null;`, which the identifier-absence assertion still passes, and which would fall back to the bundled `PACKAGE_ROOT` walk and emit `0.0.0`. No currently reachable path produces this: both `npm pack` (verified in the tarball smoke run) and `bun run` set `$npm_package_version`. Suggested hardening: `test -n "$npm_package_version"` at the head of the script, or assert the bundle contains the literal `"$npm_package_version"`.
- MEDIUM (advisory, accepted residual per the plan): local symlink installs are not merely bypassing the bundle - the bin target is dangling, because `dist/` is gitignored and absent from a fresh checkout. The managed adapter probes `command -v repo-harness-hook`, which still succeeds for a dangling symlink, so such a setup fails to exec instead of falling back to `repo-harness hook`. The current global install on this machine is a directory install pointing into `node_modules/repo-harness/`, so it is unaffected; a registry upgrade picks up the packed bundle. Suggested follow-up: document `bun run build:hook-bundle` before any dev-mode link.
- LOW (advisory, explicitly out of scope): `src/effects/evidence/verify-producer.ts:177` and `src/effects/evidence/attested-import.ts:143` still hold the same `import.meta.url` -> `PACKAGE_ROOT` -> `"0.0.0"` shape. Neither is in the hook bundle today (verified), so this is not a regression from this change; it would resurface if either module is ever pulled into the hook import graph.
- Informational: one probe record with provider version `repo-harness/0.0.0/...` remains in `.ai/harness/evidence/events/log.jsonl` from the worker's negative control. That path is gitignored (`.gitignore:60`), so the residue never reaches a tracked surface; the `repo-harness/0.0.0/ws-test` strings in `tests/` are pre-existing fixture constants unrelated to this change.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Goal met and independently probed, including the contract's own falsifier; the one gap is the build gate's blind spot for an empty injected version |
| Product depth | 9/10 | Fixes the reinstall failure class at the artifact level instead of wrapping the install ritual; the accepted symlink-install residual is bounded and documented |
| Design quality | 9/10 | One authority with two dispatch surfaces, build-time constant instead of a runtime fallback chain, no compatibility shim |
| Code quality | 9/10 | Comments explain the non-obvious bundling constraints at the point of the constraint; the regression test pins both the dispatch branch and the define behavior in bundled and unbundled form |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun run check:type`; `bun test`; `bash scripts/check-tarball-install-smoke.sh`
- Re-check: `bun run build:hook-bundle` then `head -1 dist/hook-entry.js`, `grep -c runDetachedToolingPopulate dist/hook-entry.js`, and a `bun dist/hook-entry.js UserPromptSubmit --route default` probe; confirm `src/cli/installer/managed-entries.ts` is still absent from the diff and `package.json` `version` is unchanged.

## Summary

The diff delivers exactly the contract Goal and nothing else: the `repo-harness-hook` bin ships as a prepack-built single-file bundle, the detached tooling populate survives bundling through one explicit dispatch branch sharing the existing function authority, and the bundled provider version is injected at build time so the bundled path can never emit the invented `0.0.0`. Managed adapter command strings, `timeout: 30`, and the `repo-harness` main bin mapping are byte-identical. All exit-criteria commands and the repo's required checks pass, and the contract's own falsifier probe (hook runs during atomic bundle replacement) shows no blocking. The one change outside the enumerated task list, `src/core/adoption/source-checkout.ts:40`, is consequential rather than opportunistic: the self-host detector asserts the canonical bin map, that constant had to move with the bin, and both halves of its signal remain (the detector still requires the authored `src/cli/hook-entry.ts` to exist). Downstream generated repos are unaffected because the detector short-circuits on `name !== "repo-harness"` before reaching the bin check. Recommendation: pass.
