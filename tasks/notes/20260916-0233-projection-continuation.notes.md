# Projection continuation implementation notes

User approved automatic continuation after the completed fortune-algo first-capability slice. Work is isolated in codex/architecture-projection-continuation at d5b4f22b. Existing main WIP and fortune-algo changes are preserved.

No new dependency or retry state machine. One standalone continuation module owns process launch and consumption, used by source Stop and bundled hook dispatch. A dedicated process test is justified by parent-exit and bundle entrypoint lifetime, which existing injected orchestration tests cannot prove.

## Base integration

Concurrent main commit d52f9a9b raised the architecture budget to 110 seconds and fixed owned-only-event retry starvation. This worktree was fast-forwarded to that exact base before final verification; the continuation preserves those changes. Prior 20-second/21-second wall-clock tests are historical evidence only. Current process tests use a host-only virtual clock advanced after provider return; detached children do not inherit that preload and consume the real configured budget. This avoids repeating 110-second sleeps while exercising actual source and bundled process entrypoints.

## Verified result

P1/P2/P3 and durable operating boundaries are in `docs/researches/20260916-projection-continuation.md`. Current base d52f9a9b is preserved; no product change beyond host-budget continuation. The source/bundle fixtures passed in the combined 114-test run. Current-base red/green was rerun narrowly after integration; the pre-fix artifact shows PRE_FIX_EXIT=1. The prior 20-second base run is retained as historical evidence, not reused as current-base acceptance.

Actual archctx 0.5.10 completed the disposable fortune-algo job after injected parent-clock expiry; receipt and log are copied into the run directory. The child used real time and current automatic policy. Direct and continuation outcomes were noop because documents were already current. Original fortune-algo WIP remained untouched.

Typecheck, hook/helper/reference projections, SQL order, architecture-sync, strict workflow, inspection and init dry-run passed. Source checkout init correctly planned zero operations. Task-sync is bound below after final documentation freeze. A focused test failure reported by the read-only explorer on main's legacy cascade fixture was not reproduced in the current worktree's complete focused run; no unrelated fixture repair was made.

No commit, push, publication or global install performed. The branch was only fast-forwarded to the concurrent main baseline. The pre-integration stash is retained as a recovery copy; no unrelated stash was removed.

> **Substantive Change SHA256**: `sha256:8b5b1a9713c9e30c743fcb3d211e56d70d6c7929f25cd97d3cea1c2d21d292d8`

## Closeout

Canonical preparation passed 15/15 current_exact checks on tree31c9d1f5234b772ebe759fd9d2d567db2538e6de with no snapshot changes during execution. Gatekeeper evidence-only follow-up returned PASS after validating immutable records and exact file modes/bytes. The canonical materialized-report validator expects the writer-redacted representation; in-memory canonical redaction resolved an initial raw-report API mismatch without modifying evidence or rerunning tests.

Final changes are restricted to this task's plan, contract, notes and review. Native baseline_with_delta references retain original run files/execution IDs and require a current canonical-tree diff to prove that restriction, plus fresh task-sync/workflow checks. Product/test evidence is reused, not relabeled as a rerun. The formal archive helper requires verify-sprint/AcceptanceReceipt integration closeout; that separate lane is not claimed complete by this local source review.

## Formal closeout authority

The user approved takeover after the original writer stopped and approved formal closeout on 2026-09-16. Only task metadata changes; preserve frozen production/test bytes and baseline verification runs. Use explicit verify-sprint --contract binding so plan-to-todo does not overwrite the existing review. Official codex-plugin acceptance must be recorded truthfully; local gatekeeper PASS is not relabeled as that provider result.

## Formal acceptance blocker

The first canonical `bash scripts/verify-sprint.sh --prepare-acceptance --contract tasks/contracts/20260916-0233-projection-continuation.contract.md` attempt exited 1 before evidence freeze. Log: `.ai/harness/runs/projection-continuation/formal-prepare.log`. archctx returned `human-action-required`, `unresolved-major-change`, with refresh reason `verified-flow-proof-changed`; 27 capability nodes are affected. Its snapshot also reports CodeGraph unavailable and this worktree has no `.codegraph/` directory. These are observed facts; missing indexing alone is not proven to explain the major-change classification. No projected tracked documents changed, no external review ran, and no AcceptanceReceipt was issued. Restoring indexing and resolving the wide architecture candidate requires a separately bounded architecture task; do not disable projection or widen allowed_paths just to pass. Production/test source remains the reviewed candidate.

## Index recovery and candidate reconciliation

User approved this bounded prerequisite recovery. `codegraph init .` built 1,169 files / 23,589 nodes / 107,922 edges; status reports builtWithVersion 1.5.0, extraction 24, state complete, reindexRecommended false. The same source now checks with CodeGraph ready, no humanActions, no refreshSignals and only a manifest update. Provider apply refreshed the manifest; generated module outputs, model and flow-proof digest remain unchanged. Initial reconcile correctly refused `planned`; after apply, the exact original candidate reconciled with an empty noop and receipt `sha256:51d2df13b38739832a3556522caf112b83b927e5a3ddeb5cb5e104beb8d7b2d6`. No major semantic change was accepted. Evidence: `.ai/harness/runs/projection-continuation/index-*.{json,log}`. The missing local index was sufficient to reproduce and remove this proof-only blocker on the frozen source.
