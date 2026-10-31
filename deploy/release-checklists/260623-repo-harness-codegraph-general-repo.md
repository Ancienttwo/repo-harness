# Release Filing: General Repo MCP CodeGraph Rollout

Date: 2026-06-23
Status: Prepared for stacked Sprint 4 module PR review; package publish is out of scope

## Scope

- Feature line: GPT CodeGraph general repo access through repo-harness MCP.
- Source PRD: `docs/prds/20260622-1700-gpt-codegraph.prd.md`
- Source sprint: `plans/sprints/20260622-repo-harness-codegraph-sprint-plan.md`
- Module PR:
  - S4 security, observability, rollout, and release gates: PR #35

## Included In This Filing

- policy-driven rollout flags for general repo read/write, fallback, canary,
  shadow compare, and rollback;
- compatibility wrapper behavior for legacy workflow reads;
- local rollout gate for shadow parity, canary readiness, rollback surface, and
  CodeGraph ignore audit;
- user/admin/developer reference docs;
- operational runbook for stale index, CodeGraph down, incomplete manifests,
  mutation conflicts, reindex dead letters, and rollback;
- release notes and known limits.

## Verification Evidence To Refresh Before Merge

- `bun test`.
- `bun run check:type`.
- Focused tests: `bun test tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-tools.test.ts tests/mcp-rollout-gate.test.ts tests/mcp-observability-report.test.ts`.
- Rollout gate: `bun scripts/mcp-rollout-gate.ts --repo . --out .ai/harness/runs/mcp-rollout-gate.json`;
  the report must show `provenance.status: "bound"`, clean tree state, exact
  head SHA, PR number, CI workflow/run metadata, artifact digest, and a canary
  observation window with request volume, error rate, latency, shadow mismatch,
  and rollback trigger records. Local non-CI reports are diagnostic only and
  must stay `partial`.
- Workflow gates: `bash scripts/check-task-sync.sh` and `bash scripts/check-task-workflow.sh --strict`.
- Self-host migration gate: `bash scripts/migrate-project-template.sh --repo . --dry-run`.
- CodeGraph readiness: `bash scripts/ensure-codegraph.sh --sync`.
- Setup readback: `repo-harness setup check --target codex --check-updates --json`.
- Hosted PR #35 checks after the review-fix branch push.

## Latest Local Evidence

Review-fix run on 2026-06-23:

- `bun test`: 981 pass / 1 skip / 0 fail / 10337 expect calls.
- `bun run check:type`: passed.
- `bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict && bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh`: passed after `bash scripts/prepare-codex-handoff.sh` refreshed the local handoff/resume packet.
- `bash scripts/migrate-project-template.sh --repo . --dry-run`: passed.
- `bun scripts/mcp-rollout-gate.ts --repo /Users/ancienttwo/Projects/repo-harness-codegraph-verify --out /tmp/repo-harness-mcp-rollout-gate.json`:
  passed with `shadow=pass`, `canary=ready`, and `rollback=pass`; exact-head
  provenance and canary observation-window fields must be refreshed after the
  gate hardening lands on the final head.
- `bun scripts/mcp-observability-report.ts --repo /Users/ancienttwo/Projects/repo-harness-codegraph-verify --out /tmp/repo-harness-mcp-observability-report.json`: passed with 52 events and 0 alerts.
- The rollout gate was run from a detached verification worktree under `/Users` because the active review-fix clone lived under `/private/tmp`, which is correctly denied by MCP sensitive-root policy.
- Hosted PR #35 checks and external review must be refreshed after the review-fix branch push.

## Exit Checklist

- [ ] External reviewer has re-run PR #35 after the review-fix commits and found
      no open P0/P1.
- [x] Canary gate passes for the current registered self-host read-only canary.
- [x] The rollout gate supports `--require-three-canaries` for a later external
      small/medium/large release window.
- [x] CodeGraph stale/down, fallback, incomplete manifest, mutation conflict,
      reindex dead-letter, and rollback behavior is documented in the runbook.
- [x] Performance evidence is recorded in
      `docs/researches/20260623-general-repo-reader-performance-baseline.md`.
- [x] Legacy artifact-only behavior is preserved only as compatibility wrapper
      and rollback surface.
- [x] Dashboard, alerts, trace, metrics, and rollback commands are documented.
- [x] Docs cover tool reference, repo administration, CodeGraph health,
      privacy/audit, developer migration, known limits, and release notes.
- [ ] Human release/test/security signoff is recorded on PR #35.

## Publish Hold

This filing does not authorize npm publish, Git tag creation, or GitHub release
publication. Those require the normal package release checklist after the
stacked PR chain is merged to `main`.
