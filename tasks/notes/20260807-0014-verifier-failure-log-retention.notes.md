# Implementation Notes: verifier-failure-log-retention

> **Status**: Active
> **Plan**: plans/plan-20260807-0014-verifier-failure-log-retention.md
> **Contract**: tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md
> **Review**: tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md
> **Last Updated**: 2026-08-07 00:14
> **Lifecycle**: notes

## Design Decisions

- Remediates two in-round `bun test exit=1` failures on the hook-entry-single-file-bundle shipment (2026-08-06/07). Each consumed roughly 25 minutes and produced zero attribution: the bounded runner writes each criterion's output to `--log` under the round's `mktemp -d`, `trap 'rm -rf "$tmp_dir"' EXIT` (`scripts/verify-contract.sh:632-633`) destroys it, and the run report keeps only `exit_code`. The failing test could not be named, so every flake cost a full re-round and taught nothing.
- Retention naming: `.ai/harness/runs/${run_id}-$(criterion_slug "$criterion").log`. The stem is `$run_id` (`scripts/verify-contract.sh:586`, `resolve_run_id`), the same id the round's run snapshot is named for (`.ai/harness/runs/run-<UTC>-<pid>.json`), so a retained log sorts next to its snapshot and is trivially correlated. The slug is `tr -C 'A-Za-z0-9._-' '-'` over the raw criterion, dash-squeezed, trimmed, and capped at 80 chars — deterministic, filesystem-safe, and readable, so a whole failing shell command still yields a nameable file. Observed output from the fixture round: `.ai/harness/runs/run-retention-fixture-echo-VERIFIER_RETENTION_MARKER_XYZ-exit-3.log`.
- Failure path only. Retention hangs off the existing `else` branch of the shared `bounded_exit` result handling in both loops, so a passing criterion writes nothing and green rounds do not fill `runs/` with multi-MB logs nobody reads. Timeouts are covered for free — a timed-out run is a nonzero `bounded_exit`, and that was previously the single most evidence-starved failure mode.
- Retention is diagnostic and never changes a verdict. A failed `mkdir`/`cp` warns on stderr and returns success; losing a log must not turn a passing round red, and gating logic is explicitly out of scope. This is the one place a non-fail-closed branch is correct here, because the branch produces evidence rather than consuming it.
- `.ai/harness/runs` is cwd-relative, matching the script's existing convention (`WORKFLOW_STATE_LIB` defaults to the relative `.ai/hooks/lib/workflow-state.sh`). The verifier already runs from the target repo root.

## Deviations From Plan Or Spec

- The regression test asserts on the criterion's own recorded result in the report JSON (`results[].passed` / `exit_code`) rather than the round's process exit status. The fixture runs in an isolated temp cwd with no `.ai/hooks/lib/workflow-state.sh`, so the unrelated `evidence_requirements` check fails closed there and the round exits 1 regardless of the criterion under test. Asserting the criterion isolates the behavior actually being tested; asserting the round exit would have tested the fixture's environment instead. Worth noting that this same cwd-sensitivity means the evidence-requirements gate is effectively unrunnable outside a provisioned repo root.

## Deviations From Plan Or Spec

- None recorded.

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
