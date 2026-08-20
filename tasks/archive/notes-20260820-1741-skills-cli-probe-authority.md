> **Archived**: 2026-08-20 17:41
> **Related Plan**: plans/archive/plan-20260820-1717-skills-cli-probe-authority.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1741

# Implementation Notes: skills-cli-probe-authority

> **Status**: Active
> **Plan**: plans/plan-20260820-1717-skills-cli-probe-authority.md
> **Contract**: tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md
> **Review**: tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md
> **Last Updated**: 2026-08-20 17:18
> **Lifecycle**: notes

## Design Decisions

- The Skills CLI probe is opt-in behind `--probe-skills-cli`, mirroring the `--check-updates` / `stale_status: "not-checked"` precedent already in `scripts/check-agent-tooling.sh`. PATH resolution is unconditional because it is cheap and is what distinguishes an absent install (`missing`) from an unmeasured one (`not-probed`).
- `not-probed` is classified as `warn` in `src/cli/commands/init-hook.ts` `runtimeCapabilityStatus()` through its own branch rather than by joining the failure list, so it can never escalate to `needs_agent` if the capability is ever marked required.

## Deviations From Plan Or Spec

- The plan assumed the ~38s Skills CLI cost came from `bunx` package resolution, and therefore that probing the PATH-resolved binary under a 15000ms budget would make working installations report `available`. Measured during execution: `/Users/ancienttwo/.bun/bin/skills ls -g --json` takes 36.8s by itself (138894 bytes of output over the global skill set). The cost is in the Skills CLI, not the wrapper, so the budget route could not reach the plan's goal — a real-machine smoke under 15000ms still printed `skills_cli: timed-out`.
- Coordinator ruling (2026-08-20, approved revision): take the opt-in route instead of raising the budget to ~45s. Raising it would weld a pathological per-run cost into every default `check-agent-tooling` invocation and would still break on machines with more skills. The 45000ms budget survives only as the flagged probe's ceiling.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Raise the probe budget to >=45000ms and keep probing by default | Rejected | Every default run pays up to 45s wall clock; the number is tuned to one machine's skill count and breaks on a larger one |
| Probe by default, report `timed-out` honestly | Rejected | Restates the ledger row's exact symptom: a working installation reads as failed |
| Opt-in `--probe-skills-cli`, default `not-probed` | Chosen | Default runs cost nothing, the report stops asserting an unmeasured fact, and the shape already exists in this file for update checks |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
