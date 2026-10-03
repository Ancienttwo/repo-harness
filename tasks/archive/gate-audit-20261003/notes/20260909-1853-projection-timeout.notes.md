# Implementation Notes: projection-timeout

> **Status**: Active
> **Plan**: plans/plan-20260909-1853-projection-timeout.md
> **Contract**: tasks/contracts/20260909-1853-projection-timeout.contract.md
> **Review**: tasks/reviews/20260909-1853-projection-timeout.review.md
> **Last Updated**: 2026-09-09 18:53
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:e5749bd3f8997277ce8acd6b77df358878d6627eca57df54e14fb0f2a5756781`

## Design Decisions

- The running-job reclaim window is a derivation, not a constant: `recoverAbandonedArchitectureProjectionJobs`
  now takes the resolved `policy.timeoutMs` from `drainArchitectureProjectionJobs` and computes
  `architectureProjectionRunningStaleMs(timeoutMs) = timeoutMs + 30_000`. The prior
  `RUNNING_STALE_MS = 150_000` constant would have reclaimed live jobs once the provider bound
  passed 120s, and keeping it as a second tunable would have created a second timeout authority.
- Only the validator upper bound moves to 600000; the default stays 120000 so downstream policy
  seeds in `scripts/` and `assets/templates/` stay a valid untouched default.
- Deriving the window from the timeout read at recovery time was still one authority too late:
  worker A claims under a 300000 policy, the policy is edited to 120000, and worker B's recovery
  at claim+180s recomputes a 150000 window and reclaims a live attempt. The budget is therefore
  frozen at claim time onto the job record (`attemptTimeoutMs`, `attemptDeadlineAt =
  claimedAt + policy.timeoutMs`) and recovery compares against that persisted deadline plus the
  same 30s margin. The policy stays the only place a timeout is authored; the record only
  carries the value that was resolved for that attempt.
- A running record without `attemptDeadlineAt` is legacy shape only: it falls back to
  `architectureProjectionRunningStaleMs(currentPolicyTimeout)` for that record alone, and the
  reclaim writes `LEGACY_ATTEMPT_BUDGET_NOTE` into the job's `lastFailure.message`, so the
  fallback is visible in the durable artifact instead of silently permanent. Every write that
  releases a claim (recovery, failure transition, dead-letter retry) clears the attempt budget,
  so a pending record never carries a previous attempt's deadline.
- `claimNextArchitectureProjectionJob` takes `attemptTimeoutMs: number | null`. `null` is the
  preflight path where the policy itself failed to load: there is no authoritative budget to
  persist, so none is written and the record stays on the legacy fallback. That claim is failed
  inside the same call, so it never reaches recovery in the running state.
- PID liveness (`process.kill(pid, 0)`) was rejected as an extra early-reclaim signal. It is
  unreliable across PID namespaces and after PID reuse, and a false "dead" reading would reclaim
  a live attempt — exactly the failure this change exists to remove. Waiting for the persisted
  deadline costs at most `timeout + 30s` of drain latency after a crash.
- Publish ownership was already checked (`assertClaimOwner` in
  `completeArchitectureProjectionJob` and `failArchitectureProjectionJob`), but it threw a plain
  `Error`, and the failure transition then threw again, so a reclaimed attempt crashed the whole
  drain with a compound error. The check now throws `ArchitectureProjectionOwnershipError` (also
  for the missing-running-record case, which is what reclaim actually leaves behind), and the
  orchestrator turns it into a `lost-ownership` classified drain result: no receipt, no failure
  transition onto a record another owner holds, source events unacknowledged.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Raise `RUNNING_STALE_MS` to a new constant | Rejected | Two timeout authorities that can drift apart |
| Derive the stale window from the resolved policy timeout | Chosen | One source of truth; the reclaim window follows whatever bound the provider actually runs under |
| Raise the shipped default timeout to 300000 | Rejected | The long bound is a property of this repo's projection size, not of every generated repo |
| Recompute the reclaim window from the current policy at recovery time | Rejected | A policy edit mid-attempt retroactively shortens a live lease and reclaims a running job |
| Persist the attempt budget on the job record at claim time | Chosen | The lease is a property of the attempt, resolved once from the single policy authority |
| Treat a dead `ownerPid` as an early-reclaim signal | Rejected | PID reuse and namespace mismatch can report a live owner as dead, reintroducing live-attempt reclaim |
| Guard the provider apply as well as the receipt | Deferred | Apply is a provider-owned, snapshot-checked, idempotent write; making it conditional needs a provider-side lease, not a local check |

## Open Questions

- The provider apply is still unguarded against mid-run reclaim: a reclaimed attempt may have
  already written architecture docs and agent context before the receipt is refused. The
  reclaiming owner re-runs the same snapshot-checked apply, so the durable outcome converges,
  but two owners can write the same files in sequence.
- The installed `repo-harness` 0.18.0 CLI still rejects this repo's 300000 policy with the old
  `1000..120000` bound, so the Stop-hook and global-CLI drain paths stay broken until this
  branch ships as a release.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
