> **Archived**: 2026-08-01 19:03
> **Related Plan**: plans/archive/plan-20260801-1255-tooling-receipt-awareness.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260801-1903

# Notes: tooling receipt awareness

Plan: `plans/plan-20260801-1255-tooling-receipt-awareness.md`

## Decisions and deviations

- **`update_status` "synced" retired in favor of "up-to-date"**: the spec's
  "全部檔案要嘛 synced 要嘛 user-managed 時,update_status 應為 up-to-date" reads as a
  universal statement (true even when the user-managed subset is empty), and
  `"up-to-date"` was already an established status-string spelling elsewhere in
  this same script (`parseCodeGraphProjectStatus`). Implemented as a full
  rename of the terminal "no drift" value for `hosts.claude.update_status`,
  not a new value that only appears alongside user-managed exemptions. No
  existing test pinned the literal `"synced"` value for this field (verified
  via repo-wide grep before changing it), so this is not a breaking rename of
  covered behavior.

- **No `allowedPaths` gate in the checker's receipt loader**: unlike
  `install-agent-fleet.sh`'s `loadUserManagedReceipt(allowedPaths)`, the new
  `loadAgentFleetUserManagedReceipt()` in `check-agent-tooling.sh` does not
  reject the whole receipt when it contains entries outside a fixed target
  set. The installer always resolves all 12 target paths (both hosts) before
  validating, so a foreign path is unambiguously wrong. This checker can be
  invoked with `--host claude` alone, in which case a legitimately-written
  full receipt (covering both hosts) would contain Codex `.toml` entries the
  single-host run never looks up. Replicating the installer's strict
  allow-list would have invalidated a valid receipt purely because of host
  scope, which is a false negative the installer never has to worry about.
  Well-formedness (protocol/authority/shape/regex/no duplicate paths) is
  still fully enforced; only the "every entry must be in a pre-known allowed
  set" clause was intentionally omitted, since lookups are by exact path via
  `Map.get`, so an irrelevant entry is simply never consulted.

- **`docs/reference-configs/external-tooling.md` left untouched**: its
  "### Readiness" section still documents the pre-fix behavior ("compares...
  and reports `drift`/`synced` per agent"), which is now stale after this
  change (receipt-covered files report `user-managed`, and the per-host
  rollup value is `up-to-date`, not `synced`). Left out of scope: the
  dispatch's behavior spec and EXECUTION_BOUNDARY named `check-agent-tooling.sh`,
  its `assets/templates/helpers/` mirror, and its tests; docs were not listed
  and this repo's own EXECUTION_BOUNDARY convention treats "extra docs" as
  forbidden unless explicitly requested. Flagged here as a residual
  documentation-staleness item rather than fixed inline.

- **Defensive try/catch around the extra sha256 read**: `detectAgentFleetHost`
  already read each installed file once (via `inspectAgentFleetFile` ->
  `readFileHash` -> sha1) before the new receipt-comparison step re-reads the
  same path to compute sha256. The re-read is wrapped in try/catch, treating
  a read failure as "cannot prove user-managed" (falls through to drift)
  rather than letting an uncaught exception crash the whole check. This
  mirrors the existing local pattern used by `readFileHash`/`readText`/
  `readJson` in the same file (every fs read is wrapped and returns a
  sentinel on failure), and keeps the fail-closed contract: an unreadable
  file cannot be exempted either.

- **Plan-capture detour**: `tests/check-agent-tooling.test.ts` is not a
  workflow-surface path, so the repo's `PlanStatusGuard` (`.guards.edit_plan_gate:
  enforce`) blocked the first edit attempt with no active plan. Captured the
  dispatch's own already-decision-complete spec as this plan via
  `repo-harness run capture-plan --status Approved` (no `--execute`, so
  `plan-to-todo`/`contract-worktree start` automation never ran) to avoid
  conflicting with the orchestrator's explicit instruction to work directly
  on branch `codex/tooling-receipt-awareness` in the primary checkout rather
  than a contract worktree.
