> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260814-1635-hook-effect-failure-contract.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1619

# Implementation Notes: hook-effect-failure-contract

> **Status**: Completed
> **Plan**: plans/plan-20260814-1635-hook-effect-failure-contract.md
> **Contract**: tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md
> **Review**: tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md
> **Last Updated**: 2026-08-14 18:18
> **Lifecycle**: notes

## Design Decisions

- `TypedHookHandler.effectContract` is optional and declared only by
  `mutation-observed` and `stop`; omitted contracts produce no
  `effect_observation` field and are never interpreted as zero effects.
- The runtime records post-commit phases through the existing observer seams.
  A targeted throw with no observed phase is `unknown_partial`; an observed
  prefix is `committed_partial`; all bounded phases are `committed_complete`;
  successful no-op is `none_committed`. Write metrics are marked complete only
  on successful completion through the declared contract.
- Stop retry identity is a timestamp-free `projection_key` derived from every
  non-volatile recovery rendering input inside the repo-scoped event log:
  the full artifact and policy-derived path sets, run/source/sprint/live-change
  and action state, global handoff path, and stable checkpoint metadata. The
  current timestamps and repo-root working directory are intentionally omitted:
  time changes on a fresh retry, while the event file already fixes repo scope.
  Because the operator helper is also a legal writer of the shared
  event log, the append compares only the latest Stop event within a 1 MiB
  reconciliation window under the existing lock. A larger uncertainty fails
  closed instead of guessing. Changed recovery semantics receive a new key and
  append a new event, including an A -> B -> A sequence.
- Fault injection is a callback seam after each existing post-commit observer;
  no environment fault flag or retry scheduler was added. Durable files remain
  the recovery authority and telemetry is diagnostic only.

## Deviations From Plan Or Spec

- The isolated branch was rebased to current `main` (`b2fd1379`) and the
  package-local canonical provider was rerun with only `hook-adapters.md` as
  `changed-path`. It still returned `human-action-required`: the changed shared
  flow proof requires projection updates to the manifest plus eleven capability
  documents. Ten of those documents are outside this contract's Allowed Paths.
  Applying that result here would violate the explicit stop condition. The
  architecture document's human acceptance section is updated; generated
  projection output was deliberately not hand-edited or partially synthesized.
- Gate review disproved the first 64 KiB tail assumption: the operator helper
  is a legal shared-log writer. The implementation now compares only the
  latest Stop within a 1 MiB window under the existing lock and fails closed
  when the latest Stop cannot be proven. Regressions cover more than 64 KiB of
  interleaved writes, a 2 MiB overflow, and A -> B -> A ordering.
- The same review exposed `globalHandoffPath` as a recovery rendering input; it
  is now part of the projection key alongside sprint, trace, supersedes, live
  change, action, goal, and checkpoint state.
- Final gate review exposed artifact review/notes, policy-derived paths, and
  evidence timestamps/details as additional renderer inputs. The key now binds
  the complete timestamp-free context snapshot plus the complete typed evidence
  value; same-run artifact and policy-path mutations have a dedicated regression.
- Overflow after handoff/resume commits raises typed
  `HookEffectReconciliationRequired`: the public hook result remains
  `handler-failed`, while telemetry records `effect-reconcile-required`,
  `committed_partial`, and `reconcile-required`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Generic transaction/effect sink | Rejected | The contract is limited to two existing handlers and post-commit observers; no new transaction authority is justified. |
| Run/event/reason duplicate key | Rejected | It swallowed later legitimate Stop events in the same run. |
| Timestamp-free projection key + latest-Stop bounded reconciliation | Chosen | It proves retry dedupe after interleaved writes without turning equal historical states into permanent dedupe; overflow fails closed. |

## Open Questions

- Resolved at ship: the separate projection work package owned all twelve
  provider outputs, reused the existing repository CodeGraph index, and reached
  canonical `noop` after apply. The combined full suite passed with `2389 pass /
  1 skip / 0 fail` under complete process visibility.

- Canonical architecture projection needs a revised work package that owns the
  provider's complete eleven-capability flow-proof refresh. The current scoped
  contract cannot legally apply a partial manifest refresh; no source behavior
  depends on that generated output.
- The six earlier ArchContext/global-runtime failures reproduce only when the
  desktop-injected `REPO_HARNESS_NODE_BIN` and `REPO_HARNESS_SOURCE_ROOT`
  variables leak into negative fixtures. Unsetting both makes those two test
  files pass (`54 pass / 0 fail / 274 expects`). A full hermetic process and a
  single-concurrency retry remained assertion-green but were terminated by the
  host with exit 137 late in the run; `--parallel=1` was terminated with 143.
  This is recorded as unavailable global completion evidence, not as a green
  full-suite claim and not as a product-code exception.
- Native shards covered the suite after rebasing. Sandbox-only failures in MCP
  HTTP, real-HOME boundary, ship-worktree account lookup, init bootstrap, and
  timing-sensitive tooling/projection tests passed when rerun alone with the
  required permissions. Two unrelated terminal blockers remain: the existing
  `closeout-runner-guardrails.test.ts` shows all eight tests passing and then
  exits 137, while the benchmark isolated-install reuse case times out after
  60 seconds in `bun add -g` with `exitCode=null`.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
