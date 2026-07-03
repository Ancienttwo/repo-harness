# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:

## Active Lessons

- Date: 2026-07-03
- Triggered by correction: a full `bun test` run leaked a real `plans/sprints/20260703-1424-auth-overhaul.sprint.md` + `.ai/harness/sprint/active-sprint` marker into this repo; content matched `tests/sprint-backlog.test.ts:108`'s fixture exactly.
- Mistake pattern: shell-spawning test helpers that pass `env: undefined` (or `env ? {...} : undefined`) to `spawnSync` silently inherit the parent bun-test process's full `process.env`. Since `bunfig.toml` sets `maxConcurrency = 4`, all test files share one process; a leaked/poisoned env var (e.g. `REPO_HARNESS_TARGET_REPO_ROOT`, which `scripts/sprint-backlog.sh`'s WIP cwd-resolution branch trusts blindly) from anywhere in that shared process can silently redirect a "sandboxed" tmp-workspace test into the real repo. Root cause NOT confirmed — isolated single-file and 7-file/172-test concurrent reruns both failed to reproduce; likely needs full 93-file suite load or was a one-off timing fluke. Applied `tests/sprint-backlog.test.ts`'s explicit `SANDBOX_ENV_BLOCKLIST` strip as defense-in-depth regardless.
- Prevention rule: any test helper that spawns a subprocess into a tmp sandbox must construct an explicit `env` object and delete known ambient-leak vars (`REPO_HARNESS_TARGET_REPO_ROOT` and friends) rather than passing `env: undefined`/raw `process.env` through. Product helpers that accept target-root env must also fail closed unless the canonical env root matches the helper's current cwd; do not rely on tests to scrub inherited env. Never trust "isolated run didn't leak" as proof of absence in a shared-process, concurrent test runner.
- Where to apply next time: audit other test files under `tests/` that spawn `scripts/*.sh` copies into `mkdtempSync` workspaces (grep `spawnSync.*cwd` alongside `env: undefined` or omitted `env`) for the same blind-inheritance pattern; revisit once `scripts/sprint-backlog.sh`'s WIP `REPO_HARNESS_TARGET_REPO_ROOT` change lands and re-attempt a full-suite repro with the fix reverted to confirm/deny the exact trigger.
