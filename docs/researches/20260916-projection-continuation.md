# Architecture projection continuation after a host-budget yield

## P1: Ownership

The Stop handler owns host time allocation. The current base (`d52f9a9b`) reserves 110 seconds for architecture work inside 140 seconds of work and a 150-second managed hook limit. Global projection policy independently bounds a provider attempt (normally 120 seconds). `projection-jobs.ts` remains the sole pending/running/receipt authority; archctx remains the semantic and rendered-output authority.

## P2: Failure and repair trace

Previously, a host deadline returned `host-budget`, refunded the business attempt and retained the job. No independent consumer ran, so repeated Stop events could keep repeating the shorter budget. The new drain result exposes `yieldReason: host-budget`. After all handler recovery writes and gates finish, Stop launches a detached one-shot consumer. Source execution re-enters `projection-continuation.ts`; the built hook dispatches the same flag/function from `hook-entry.ts`.

The child rereads current policy, calls the existing drain without a host deadline and writes its outcome to the advertised continuation log. It does not discover new events, author models, accept semantic changes, publish commits or install anything. The original request identity, claim lock, attempt ownership checks, retry accounting, prior-committed-apply reconciliation and receipt writer remain in force. Starting a process is not completion; inspect its canonical receipt.

## P3: Invariants and limitations

- Strict Stop behavior is unchanged: pending work remains a blocking result under strict projection policy, even when a continuation has started.
- There is no second scheduler or retry state. Concurrent wake-ups contend on the existing single running claim; a duplicate consumer exits idle.
- Manual/disabled policy observed by the child prevents a claim. Real provider failures remain pending/dead-lettered according to existing policy; the child does not recursively spawn itself.
- The child completes the queued job only. Drift cursor advancement remains owned by a subsequent Stop/explicit drain with its original range and cursor CAS; a child never invents a cursor acknowledgement.
- A machine shutdown or failed child launch still requires another Stop or explicit drain. This is bounded host-budget continuation, not a permanent daemon or an always-on delivery guarantee.
- At higher event volume, the existing serialized provider claim is the throughput boundary. This slice does not increase budgets or add parallel provider execution.

## Verification boundary

Current-base regression fails before the patch and passes with it. The focused set passed 114 tests across five files, including source and actual bundled hooks, parent-exit survival, duplicate wake-up exclusion, disabled/manual policy, failure persistence, late-write receipts and strict Stop behavior. A parent-only clock preload expires the host budget in process fixtures; detached children do not inherit it. This avoids sleeping through every 110-second budget while preserving the actual process/queue boundary.

A disposable copy of fortune-algo, with a consistent SQLite backup of its CodeGraph index and the accepted Bazi Core model, also ran the candidate hook against actual archctx 0.5.10. Direct execution completed; a second run with parent-only clock expiry yielded and automatically produced job `job-6006dde9db55e8b9c010ab83` with result `noop`, CodeGraph ready, pending/running/dead-letter all zero. `noop` is correct for already-current documents and is not evidence of new semantic document generation. No original fortune-algo file was modified by this smoke.

Source-bound evidence: `.ai/harness/runs/projection-continuation/verification-summary.json`, `focused-final.txt`, `pre-fix.txt`, `real-provider-continuation-receipt.json` and `real-provider-continuation.log`. Local source acceptance does not prove a published or installed hook update. The normal release/build/install lane is still required for other sessions to use this code.
