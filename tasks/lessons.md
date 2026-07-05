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

- Date: 2026-07-06
- Triggered by correction: rubric-v2 scope gate + Codex acceptance both flagged `tasks/todos.md` outside hand-filled `allowed_paths`.
- Mistake pattern: stripping tooling-touched default paths (`tasks/todos.md`) from the contract template's `allowed_paths` when hand-filling briefs.
- Prevention rule: keep the template's default `allowed_paths` entries that projection tooling writes to (`tasks/todos.md`); minimal-change applies to scope semantics, not to deleting tooling defaults.
- Where to apply next time: every hand-filled contract brief.

- Date: 2026-07-06
- Triggered by correction: authority-closure T2 — adding one apostrophe ("task's") to `PI_TEMPLATE_CONTRACT` broke `scripts/lib/project-init-lib.sh` at `bash -n` (exit 2, "unexpected EOF while looking for matching") on stock macOS bash 3.2.57.
- Mistake pattern: a `$(cat <<'EOF' ... EOF)`-wrapped heredoc with a QUOTED delimiter still gets its body scanned for quote parity by bash 3.2's `$()` boundary matcher; an odd count of single quotes inside the literal body breaks parsing even though the heredoc content is never interpreted. Minimal 5-line repro confirmed; other `PI_TEMPLATE_*` heredocs had even quote counts by luck.
- Prevention rule: never embed prose with apostrophes inside `$(cat <<'EOF')` on scripts that must run under /bin/bash 3.2; use temp-file indirection (`mktemp` + `cat > file <<'EOF'` + read back) as `project-init-lib.sh` now does. `read -r -d ''` is not a substitute here — it exits 1 at heredoc EOF and every consumer of this lib runs `set -euo pipefail`. Always `bash -n` every template-bearing .sh after editing embedded template text.
- Where to apply next time: any slice that inserts new template/field prose into `scripts/lib/project-init-lib.sh`, `scripts/ensure-task-workflow.sh`, or `scripts/plan-to-todo.sh` heredocs; check quoting mode per heredoc before writing text containing `'`, backticks, or `$`.

- Date: 2026-07-03
- Triggered by correction: a full `bun test` run leaked a real `plans/sprints/20260703-1424-auth-overhaul.sprint.md` + `.ai/harness/sprint/active-sprint` marker into this repo; content matched `tests/sprint-backlog.test.ts:108`'s fixture exactly.
- Mistake pattern: shell-spawning test helpers that pass `env: undefined` (or `env ? {...} : undefined`) to `spawnSync` silently inherit the parent bun-test process's full `process.env`. Since `bunfig.toml` sets `maxConcurrency = 4`, all test files share one process; a leaked/poisoned env var (e.g. `REPO_HARNESS_TARGET_REPO_ROOT`, which `scripts/sprint-backlog.sh`'s WIP cwd-resolution branch trusts blindly) from anywhere in that shared process can silently redirect a "sandboxed" tmp-workspace test into the real repo. Root cause NOT confirmed — isolated single-file and 7-file/172-test concurrent reruns both failed to reproduce; likely needs full 93-file suite load or was a one-off timing fluke. Applied `tests/sprint-backlog.test.ts`'s explicit `SANDBOX_ENV_BLOCKLIST` strip as defense-in-depth regardless.
- Prevention rule: any test helper that spawns a subprocess into a tmp sandbox must construct an explicit `env` object and delete known ambient-leak vars (`REPO_HARNESS_TARGET_REPO_ROOT` and friends) rather than passing `env: undefined`/raw `process.env` through. Product helpers that accept target-root env must also fail closed unless the canonical env root matches the helper's current cwd; do not rely on tests to scrub inherited env. Never trust "isolated run didn't leak" as proof of absence in a shared-process, concurrent test runner.
- Where to apply next time: audit other test files under `tests/` that spawn `scripts/*.sh` copies into `mkdtempSync` workspaces (grep `spawnSync.*cwd` alongside `env: undefined` or omitted `env`) for the same blind-inheritance pattern; revisit once `scripts/sprint-backlog.sh`'s WIP `REPO_HARNESS_TARGET_REPO_ROOT` change lands and re-attempt a full-suite repro with the fix reverted to confirm/deny the exact trigger.
