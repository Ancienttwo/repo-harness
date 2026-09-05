> **Archived**: 2026-09-05 18:16
> **Related Plan**: plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-1816
> **Archive Projection V1**: `plans/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` => `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.notes.md` => `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.contract.md` => `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.review.md` => `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`

# Implementation Notes: brc5-heartbeat-observation-slot-reconciliation

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md
> **Contract**: tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md
> **Review**: tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md
> **Last Updated**: 2026-09-05 11:56
> **Lifecycle**: notes

## Design Decisions

- Approved blocking diagnostic change: CodeGraph readiness now returns each version/status probe's actual status, signal, error code/message and timeout flag, including the existing timeout retry. It changes observability only; it does not prove the original transient cause or loosen readiness. The generated helper remains byte-identical to the script source.
- Red/green evidence: four injected-failure tests failed on missing probe output before the change; the full focused resolver file passed after it (5 tests, 91 assertions).

- A provider comment and Issue close are distinct external mutations, so orphan handling requires two reserved steps.
- Integration base is `49c56b25f0c0871b85e6b2a53a4abb2e05913610` (`review-boundary-repairs`). Its required caller-supplied browser ports are retained through heartbeat dispatch. Provider Issue ID remains identity; the separately validated URL is only its observation-bound locator.
- The pre-integration full suite exited successfully, but its prepared acceptance was invalidated by target-ref movement. Final acceptance must bind the integrated candidate; the previous command result is diagnostic evidence only.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse historical characterization metadata fixtures | Reject as runtime specification | They contain no strict JSON metadata and label malformed markers as slot_invalid; the PRD requires malformed markers to remain unadopted. |

## Open Questions

- CodeGraph probe output is implemented and its focused and full-suite checks now pass. Historical EAGAIN versus timeout cannot be distinguished retroactively; the research document records that limit, not a current failing test.
- Formal acceptance remains blocked by target drift: origin/main changed from ca0ede71 to 0178db81 during the approved stability window. All 13 contract criteria passed on frozen source3958ce3f, but that does not bind the new target. Do not repeat expensive retries or fabricate a receipt. A settled integration target is required before refreshing canonical evidence.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Integrated source checkpoint: `748b3018401bb8c34c639b99c3ef2439a60a20a2`, based on main `49c56b25f0c0871b85e6b2a53a4abb2e05913610`.
- Integrated focused verification: five contract suites, 47 pass; typecheck and state-boundaries (283 files) pass. Deployment SQL, architecture sync, task workflow, project inspection, and init dry-run passed.
- Prepared verification run `run-20260905T153420-94773-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.json`: full `bun test --timeout 60000` completed in 1549648 ms with 4255 pass, 1 fail, 4 skip across 353 files. Retained failure log: `.ai/harness/runs/run-20260905T153434-99468-bun-test-timeout-60000.log`. Formal status remains fail; no external semantic acceptance or finish was invoked.
- Earlier integrated run `run-20260905T150744-72192-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.json` ended with SIGTERM, timed_out=false, after 1210243 ms. The signal sender is unknown. Do not treat either failed run as passing acceptance evidence.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

- Probe-output integration verification: resolver tests 5 pass (91 assertions), tooling tests 27 pass (265 assertions), and typecheck passed. Integrated main `78bb171628ea8ecc3b33d1f0df763b2acbf14ca0` before final verification; ArchContext 0.5.7 projection applied with no human actions.

- Final prepare v5 (`run-20260905T163331-4841-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.json`) was deliberately stopped by the parent after origin/main advanced from 78bb1716 to 8ddb6d0d. Its SIGTERM is operator cancellation of already-stale evidence, unlike the unidentified earlier signal. No new test assertion failure had been observed. Published 8ddb6d0d was merged as 45bb2f19, but origin/main advanced again to ca0ede71 during preparation. Do not chase moving bases with repeated expensive verification; obtain a stable acceptance window, integrate the settled base once, then prepare evidence. Probe output is implemented and focused tests are green; whole-task acceptance remains pending.

- Latest complete source verification: frozen source `3958ce3f`, review target `ca0ede71ab4888cd0ecb2dd8c20da2dabbeef154`; `bun test --timeout 60000` completed in 1552849 ms with **4363 pass, 0 fail, 4 skip**, 4367 tests across 354 files. All 13 contract criteria passed. Formal prepare v6 failed after the target advanced to `0178db813e9e01e355449a24729267437a11a333`. Snapshot: `.ai/harness/runs/run-20260905T170222-80330-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.json`. Full log copy: `/tmp/repo-harness-brc5-integrated-full-suite-v6.log`; gate log: `/tmp/repo-harness-brc5-final-verification-v6.log`. External semantic review and finish remain unperformed.


## Main integration acceptance boundary

- User delegated BRC5 delivery to this parent; original owner paused writes on `b6de40ef` and confirmed no unrecorded blockers or prior formal independent review.
- Main `0d6bc102` integrated as `5fcffc15`. BRC5 core/effects/campaign CLI source is unchanged from full-suite source `3958ce3f`; the inherited full-suite requirement is replaced by the explicit focused delta criteria and coverage rationale in Acceptance Notes, following current main verification policy.
- The architecture conflict retained this branch's already recorded development-campaign semantic baseline, then canonical `architecture-projection apply` regenerated merged-source provenance with zero human actions and refresh signals. No semantic baseline was fabricated.
- Previous target-drift failed runs remain retained as history. The new preparation must bind current source/contract/goal/target; no waiver or acceptance receipt is inferred from the user's merge request.

## Independent review repair decisions

- Formal codex-plugin review of `d425a23d` against `0d6bc102` found P1 journal snapshot drift and P2 campaign-kind validity mismatch. Original transcript remains in the review artifact; it is not a passing external review.
- P2 root cause: source-drift validation accepted any parsed kind while slot classification also enforced allowed kinds. Reproduction: forbidden `test_gap` repaired to allowed `bugfix` with durable repair authorization threw `issue_source_drift`. Guard: unit regression checks authorized success, unauthorized rejection, and unsuccessful repair exhaustion. Evidence: `.ai/harness/runs/brc5-metadata-kind-red.log`; focused green 12 pass, 0 fail.
- P1 root cause: decision records and later journal hash came from different reads, permitting a concurrent completed edit to appear only in the CAS hash. Reproduction: deterministic store-read interleaving of a completed failed edit allowed a second external followup. Guard: campaign-step regression asserts rejection, one followup and one durable reservation/result. Evidence: `.ai/harness/runs/brc5-concurrency-red.log`; focused green 19 pass, 0 fail.
- Snapshot records and their hash now originate under the same campaign lock. Reservation checks the current snapshot and rejects an already completed edit for the provider issue. External provider calls remain outside the lock. No record schema or public test hook was added.
- One formal review is consumed. After fresh verification, remaining acceptance follows the owner-acceptance route; the original review failure is retained.
