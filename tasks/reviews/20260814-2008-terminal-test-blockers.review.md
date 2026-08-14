# Review: terminal-test-blockers

> **Status**: Pass — implementation and repository-wide gates are green.
> **Plan**: plans/plan-20260814-2008-terminal-test-blockers.md
> **Contract**: tasks/contracts/20260814-2008-terminal-test-blockers.contract.md

## Root-cause fixes

- `tests/unit/closeout-runner-guardrails.test.ts` rejects empty/non-positive/unsafe PID text before cleanup and signals a validated process group with `process.kill(-pid, signal)`. The fixture no longer permits `process.kill(0, SIGKILL)`.
- `scripts/run-harness-profile-benchmark.ts` stages a single final tarball with a source-relative, installed production dependency closure. Dependency identity is a real package path, preserving nested versions; staged install metadata is removed only from the copied manifest so the source authority remains unchanged.
- `tests/harness-benchmark-matrix.test.ts` installs twice with fresh per-home caches and npm/Bun registry set to `http://127.0.0.1:9`, and inspects the final tarball for every direct dependency before asserting immutable reuse.

## Verification

| Command | Result |
|---|---|
| `env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test tests/unit/closeout-runner-guardrails.test.ts` (complete process observation) | PASS — 24 tests, 127 assertions, exit 0 |
| `env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test tests/harness-benchmark-matrix.test.ts` (complete process observation) | PASS — 31 tests, 211 assertions, exit 0 |
| same benchmark command in restricted sandbox | Environmental EPERM from `ps` only; no implementation failure |
| `bun run check:type` | PASS |
| `bash scripts/check-task-sync.sh` | PASS |
| `repo-harness run check-task-workflow --strict` | PASS |
| `env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test` | PASS — 2375 tests, 1 skip, 18388 assertions, exit 0 |
| `git diff --check` | PASS |
| Internal read-only gatekeeper | PASS — no code findings; exact 7-file Allowed Paths scope confirmed |

Pre-fix non-zero evidence remains under `.ai/harness/runs/terminal-test-blockers/` as required by the contract. The internal gatekeeper passed after the benchmark repro was tightened to pin fresh cache and offline npm/Bun registries. The repository owner supplied the contract-authorized human acceptance by directing this verified slice to ship and merge; no private diff was disclosed to an external reviewer.
