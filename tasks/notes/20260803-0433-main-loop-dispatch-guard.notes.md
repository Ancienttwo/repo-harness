# Implementation Notes: main-loop-dispatch-guard

> **Status**: Active
> **Plan**: plans/plan-20260803-0433-main-loop-dispatch-guard.md
> **Contract**: tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md
> **Review**: tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md
> **Last Updated**: 2026-08-03 04:33
> **Lifecycle**: notes

## Design Decisions

- Main-loop vs subagent discrimination uses the official hook payload contract (top-level `agent_id` present only inside subagent tool calls; `agent_type` also passes for `--agent` sessions) — no transcript-path or timing heuristics.
- Guard is opt-in via env `REPO_HARNESS_MAIN_LOOP_EDIT_GUARD` + `HOOK_HOST=claude`; product default stays off so the operator's personal orchestration policy is not imposed on downstream repo-harness users. Machine-wide arming lives in the operator's `~/.claude/settings.json` `env` block.
- Fixture hermeticity is part of the feature: the two characterization fixtures that pin `HOOK_HOST: 'claude'` and spread `process.env` strip/neutralize the new key, so an armed operator shell cannot flip frozen goldens (hazard class already documented in LSC's `isolatedEnv()` comment).

## Deviations From Plan Or Spec

- Exit criterion "full `bun test`" was narrowed to the three affected test files + `init --dry-run`: the full suite is red at base on this machine (25 fail / 12 errors; failing-name set verified byte-identical with and without this change — all `install*`/`mcp-*` env-coupled, tied to global `~/.repo-harness` state and the CodeGraph local-binary pin). The gate uses the change-introduces-zero-new-failures standard instead of holding this slice hostage to out-of-scope environment red.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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
