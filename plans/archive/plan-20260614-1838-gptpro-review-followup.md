# GPT Pro Review Follow-up Plan

> **Status**: Archived
> **Slug**: gptpro-review-followup
> **Created**: 2026-06-14 18:38
> **Source Review**: `/Users/ancienttwo/.codex/attachments/2ef806c5-c17f-4c19-9631-dfe59a2753ca/pasted-text.txt`

## Current Audit

| # | Review item | Status | Evidence | Remaining plan |
|---|-------------|--------|----------|----------------|
| 1 | Remove `eval "$cmd"` from migration execution | Done | `scripts/migrate-project-template.sh` now passes argv to `run_or_echo`; `tests/migration-script.test.ts` covers shell metacharacter repo paths | None |
| 2 | Align package-manager/runtime install chain | Done | `global-runtime.ts`, CodeGraph docs, and doctor remediation now use `bun add -g`; setup check reports Bun/npm/npx/Skills CLI as separate runtime capabilities and docs state the explicit external Skills CLI exception boundary | None |
| 3 | Windows/cross-platform compatibility | Done | `doctor.ts` no longer shells out to `which`; init/security HOME fallback now include `USERPROFILE`; setup check reports Bash/rsync/symlink capability separately; installed-copy sync no longer requires `rsync` for link-mode and emits explicit unsupported-mode messages for missing `rsync` or symlink failure | None |
| 4 | `init.ts` HOME fallback | Done | `homeDir(env)` now checks `HOME`, `USERPROFILE`, process env, then `homedir()`; `tests/cli/init.test.ts` covers HOME-absent USERPROFILE path | Common home helper can be deferred to the platform pass |
| 5 | CodeGraph exceptions should become structured init steps | Done | `runInit()` wraps `ensureCodegraph()` in try/catch; test covers invalid JSON from tooling check | None |
| 6 | `repo-harness-hook` fast path should fallback on failure | Done | managed hook command now runs fast path with `&& exit 0` before falling back to `repo-harness hook`; install test covers command shape | None |
| 7 | CLI version should not be hardcoded | Done | `CLI_VERSION` is loaded from `package.json` in `status.ts` | Optional release-test hardening only |
| 8 | Security JSON should fail on high findings | Done | `reportStatus()` maps `high` to `fail`; security tests cover JSON and strict behavior | None |
| 9 | `verify-contract.sh` fixed `/tmp` files and read-only exec boundary | Done | fixed temp files with `mktemp -d`; help, JSON report, sprint-contract docs, and helper tests now state that `--read-only` only suppresses Status writes while `tests_pass` / `commands_succeed` still execute | None |
| 10 | `init --refresh` visible no-op | Done | CLI help now calls `--refresh` a compatibility no-op | Optional docs cleanup only |

## P1 Map

- System boundary: repo-harness CLI/runtime, migration shell helpers, host hook
  adapter generation, setup/doctor readiness, security scanner, and contract
  verifier.
- Authoritative files: `src/cli/commands/init.ts`,
  `src/cli/commands/global-runtime.ts`, `src/cli/commands/doctor.ts`,
  `src/cli/installer/managed-entries.ts`, `src/cli/commands/security.ts`,
  `src/cli/commands/status.ts`, `scripts/migrate-project-template.sh`,
  `scripts/verify-contract.sh`, and their asset/template copies.
- Strong dependencies: Bun runtime, Skills CLI/Waza install path, CodeGraph
  local dev dependency, Bash helper scripts, user-level Codex/Claude host
  adapters.
- Out of scope for the existing fix set: full Bash-to-TS migration, full
  Windows parity, CI provider setup, and release follow-through.

## P2 Trace

Concrete path checked: `repo-harness init/adopt` -> `runInit()` -> global/repo
setup steps -> CodeGraph ensure -> host adapter/runtime readiness output.

- Input source of truth: command options in `src/cli/index.ts` and repo-local
  policy/runtime files.
- Contracts crossed: `InitCommandResult.steps`, `GlobalRuntimeStep[]`,
  CodeGraph check/ensure result, hook command strings, and security scan JSON.
- Final side effects: user-level runtime setup, repo-level migration,
  CodeGraph index sync, generated hook adapter commands, and verification
  reports.
- Remaining pressure points: package-manager authority still crosses Bun and
  `npx skills`; Windows readiness still depends on Unix shell helpers for some
  paths; `verify-contract.sh --read-only` still executes contract commands.

## P3 Decision

The current shape is Bun-first, not Bun-only. That preserves npm package
distribution and npx-based Skills CLI compatibility while moving
repo-harness-owned runtime actions to Bun. The invariant to preserve is
command-boundary clarity: user-level runtime refresh, repo-local adoption, and
verification must not silently mutate each other's authority.

At 10x downstream repos, the first failure will be platform/tooling ambiguity,
not the already-fixed `eval` or CodeGraph exception path. The next coherent
slice should close capability detection and execution-boundary documentation
before attempting a larger Bash migration.

## Follow-up Backlog

| # | Status | Task | Acceptance |
|---|--------|------|------------|
| 1 | Done | package-manager-exception-boundary | `repo-harness setup check --target codex --check-updates --json` reports Bun, npm/npx/Skills CLI, CodeGraph, bash, rsync, and symlink capability separately; docs state which actions are Bun-owned and which remain external Skills CLI dependencies |
| 2 | Done | windows-degradation-surface | Doctor/setup check reports missing Bash/rsync/symlink support as scoped capability degradation, not generic failure; tests cover PATH lookup without Unix `which` and copy-mode or explicit unsupported-mode messaging for installed-copy sync |
| 3 | Done | verify-contract-exec-boundary | `verify-contract.sh --help` and docs state that `commands_succeed` executes even when state writes are read-only; report JSON exposes `read_only` and `executes_contract_commands`; helper tests cover the chosen behavior |
| 4 | Done | ci-script-surface | `package.json` exposes `check:ci` as the single reviewable CI-equivalent gate; `check:release` keeps only npm unpublished-version preflight before delegating to the same gate; README documents the boundary without adding unowned lint/typecheck commands |

## Verification Snapshot

- `bun test tests/migration-script.test.ts tests/cli/global-runtime-init.test.ts tests/cli/init.test.ts tests/cli/install.test.ts tests/cli/security.test.ts tests/cli/doctor.test.ts` -> 81 pass, 0 fail.
- `bun test tests/check-agent-tooling.test.ts tests/cli/init-hook.test.ts` -> 18 pass, 0 fail.
- `bun test tests/installed-copy-sync.test.ts tests/cli/doctor.test.ts tests/check-agent-tooling.test.ts tests/cli/init-hook.test.ts` -> 39 pass, 0 fail.
- `bash -n scripts/verify-contract.sh && bash -n assets/templates/helpers/verify-contract.sh` -> pass.
- `bun test tests/helper-scripts.test.ts -t verify-contract` -> 8 pass, 0 fail.
- `bash -n scripts/check-ci.sh scripts/check-npm-release.sh` -> pass.
- `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts` -> 20 pass, 0 fail.
- `bun run check:ci` -> 743 pass, 0 fail; deploy SQL, architecture sync, task sync, workflow strict, repository inspection, migration dry-run, and package dry-run passed.
- `bun src/cli/index.ts setup check --target codex --check-updates --json` -> reports `runtime.bun`, `runtime.npm`, `runtime.npx`, `runtime.skills_cli`, `runtime.bash`, `runtime.rsync`, and `runtime.symlink` as separate setup checks.
- `bash scripts/migrate-project-template.sh --repo . --dry-run` -> pass.
- `bash scripts/check-task-workflow.sh --strict` -> pass after refreshing `.ai/harness/handoff/resume.md`.
- `repo-harness setup check --target codex --check-updates --json` -> status `attention`; CodeGraph ok and up-to-date, only gbrain warning remains.
