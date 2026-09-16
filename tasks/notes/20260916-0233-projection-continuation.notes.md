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

## Formal review rejection after prerequisite recovery

The committed candidate 882484073279c75a0c08f54a300d5bbb7d2a745e passed canonical preparation (32 artifact/check conditions, zero failures). The official Codex plugin reviewed subject `sha256:7ff07497c672adec86cfe72c9b8662826ab9c46b23d7727a4e2fb991667ab7a0` and returned `needs-attention`: a subsequent strict Stop sees the child-owned running claim as drain status idle and does not block. The wrapper's advisory P2/PASS recommendation does not override that confirmed invariant violation. Recorded a typed AcceptanceReceipt with disposition reject.

Confirmed with a temporary targeted case in the existing Stop test file: injected idle / running=1 / receipts=0 returns empty stdout, so the expected strict block fails; PRE_FIX_EXIT=1. Evidence `.ai/harness/runs/projection-continuation/strict-running-repro.log`. Restored the test byte-for-byte after the diagnostic; production/test source stays frozen. Full provider transcript is `formal-plugin-review.json`, and receipt is `formal-rejection-receipt.json` in the same run directory. Next source slice: strict Stop must consult unfinished queue state, with a regression spanning the second Stop while the detached child is running and receipt completion. No merge/archive/publication/install occurred.

## Approved strict queue gate repair

User approved the review finding fix. P1: projection-jobs keeps ownership; Stop consumes the drain's canonical queue snapshot. P2: a running claim returns idle without a receipt, so status-only gating lost the cross-process completion condition. P3: reuse pending/running/dead-letter counts for strict gating and the unreadable-policy ownership decision; emit counts in the blocking reason. No new authority, dependency or product file.

Extended the existing source/bundle tests with an explicit release marker to hold the detached child; both cases failed before the fix (`strict-gate-pre-fix.log`, PRE_FIX_EXIT=1), then passed after the fix, including empty stdout after receipt completion. Added a strict/advisory matrix for each unfinished queue state to the existing Stop test file. Direct `bun test` exploratory runs hit Bun's 5-second default in pre-existing subprocess cases; the repository's canonical `scripts.test` is already `bun test --timeout 60000`. Final evidence uses the package_test executor and that existing timeout, without changing tests or product timeouts to accommodate this.

Formal acceptance remains unresolved: source cross-review admission permits one semantic review per work-package and explicitly routes finding fixes to owner acceptance, while this contract currently forbids user waiver. Preserve the prior rejected receipt; do not relabel it as a pass on this new subject or reset the circuit.

## Owner signoff

The user explicitly approved the policy correction and owner acceptance after reviewing the concrete implementation and 31 passing canonical conditions. Freeze this corrected authority, reuse the verified source with metadata/provenance delta checks, then issue and verify the typed UserWaiverGrant and user_waiver AcceptanceReceipt. Preserve the original plugin rejection and the subsequent red-green evidence as history. No second external review or circuit reset.

Local closeout requires the canonical template section order: workflow_contract_allows_path reads the first YAML block only. Restored Allowed Paths before Exit Criteria; no allowed path, acceptance decision or product semantics changed. Rebind the explicitly approved owner grant to the corrected contract bytes.

## Approved archive integrity repair

P1: archive-workflow.sh projects lifecycle navigation; Verification Plan owns executable acceptance criteria. P2: the real archive changed the metadata-delta command by replacing historical task paths, which invalidated the accepted plan hash; reverting that archive restored the valid receipt. P3: skip the Verification Plan section during the existing path rewrite, preserving its bytes and hash while continuing navigation projection outside it. Prediction and actual archive share the same function. No receipt validator change, new dependency, file or abstraction.

The existing collision-safe archive integration case now includes historical paths in its executable command and checks exact section retention, plan hash and navigation rewrites. It failed on the original helper (archive-plan-pre-fix.log, exit 1) and passed after the three-line guard (archive-plan-green.log). The helper mirror is regenerated through sync:helpers. Final acceptance reruns the existing archive and receipt files, required integrity checks and types; unchanged continuation source evidence remains baseline_with_delta under a narrow path guard. Actual receipt verification before and after archive is the final integration criterion.

Final evidence freeze: tree `0007ee85ee0fa5eb6110cfac9186444697aa2261`; archive suite and receipt suite passed with unchanged snapshots, alongside types and required integrity checks except task-sync. Preparation was Partial solely because the new substantive diff digest was absent, causing its five dependent baseline checks to reject reuse. Add the exact digest below and rerun current metadata/architecture checks; reuse the successful executions behind a full-tree metadata-only guard rather than repeat the suites.

> **Substantive Change SHA256**: `sha256:3e0dcb3fa7b7848419bdcb4287a14c942ed2dac23bbb82eee7d35a6bd9d14a06`
