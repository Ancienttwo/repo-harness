> **Archived**: 2026-06-12 05:38
> **Related Plan**: plans/archive/plan-20260612-0528-loop-engine-06-heartbeat-v0.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260612-0538

# Implementation Notes: loop-engine-06-heartbeat-v0

> **Status**: Active
> **Plan**: plans/plan-20260612-0528-loop-engine-06-heartbeat-v0.md
> **Contract**: tasks/contracts/20260612-0528-loop-engine-06-heartbeat-v0.contract.md
> **Review**: tasks/reviews/20260612-0528-loop-engine-06-heartbeat-v0.review.md
> **Last Updated**: 2026-06-12 05:35
> **Lifecycle**: notes

## Design Decisions

- Extend `scripts/maintenance-triage.sh` with an explicit `--heartbeat` mode instead of adding a second scheduler script. The default command remains lessons triage.
- Heartbeat probes are advisory snapshots: workflow check, sprint next, and drift request scan are captured into `.ai/harness/triage/inbox.md`; the command exits 0 even when a probe fails so scheduled runs keep producing evidence.
- Add a read-only fallback for sprint next when `sprint-backlog.sh next` lacks a runtime marker in linked worktrees: scan Approved/Executing sprint files and report the first pending row.
- Export the same default `REPO_HARNESS_BRAIN_ROOT` used by brain sync before running child probes, so scheduled subshells and strict checks resolve the brain mirror consistently.
- Treat `.ai/harness/triage/` as runtime state and ignore it in git, matching `.ai/harness/runs/` and `.ai/harness/sprint/`.

## Deviations From Plan Or Spec

- No cron job is installed automatically. Row6 documents cron/loop configuration and provides the command; the owner decides whether to enable a scheduler.
- Claude external validation is skipped for this Goal by owner instruction and recorded as `manual_override`, not as a pass.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| New heartbeat script | Rejected | Existing `maintenance-triage.sh` is already the repo-local triage helper and install surface. |
| Fail heartbeat on failed probe | Rejected | A scheduled heartbeat should write the failure into the inbox instead of disappearing until the next manual run. |
| Track `.ai/harness/triage/inbox.md` | Rejected | Inbox is runtime state; tracked files record the contract, docs, and tests. |
| Auto-install cron | Rejected | Installing host-level automation without explicit owner action would cross the repo boundary. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Heartbeat inbox: `.ai/harness/triage/inbox.md`
- Focused tests: `bun test tests/unit/loop-engine-06-heartbeat-v0.test.ts`
- Brain mirror sync before strict validation: `bash scripts/sync-brain-docs.sh --changed docs/reference-configs/harness-overview.md`
- Real heartbeat smoke: `bash scripts/maintenance-triage.sh --heartbeat --inbox .ai/harness/triage/inbox.md`
- Adoption review date recorded by heartbeat: 2026-06-26

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
