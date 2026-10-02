# Implementation Notes: e1-selected-entrypoints

> **Status**: Active
> **Plan**: plans/plan-20261002-1401-e1-selected-entrypoints.md
> **Contract**: tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md
> **Review**: tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md
> **Last Updated**: 2026-10-02 14:01
> **Lifecycle**: notes

## Design Decisions

- Use existing C assertion validation for one closed choice shape. Selected paths carry choice/ref and cannot PICK; owner computes R1/R2 policy. MCP raw max_attempts is explicitly rejected under the new schema rather than ignored/unbound.
- Controller/campaign selected-only flags require explicit selected marker; a present malformed choice rejects before mutation. Existing auto requests remain separate.
- Full local suite is owner-authorized; use existing CI isolated-file runner, no benchmark/test document.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Raw selected fallback | Rejected | Missing/invalid explicit selected input fails before mutation; auto remains separate. |
| Legacy unbound max_attempts | Explicit schema refusal | Preserve one closed C identity; never silently ignore a raw retry knob. |
| Selected controller outside acquisition phase | Explicit refusal | Do not silently select a replacement for an executing/terminal controller. |
| New scaffolding | Not authorized | Existing artifacts remain; branch push/Draft PR require actual verification and coordinator review per 14:33 authorization. |

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

## Current four-entry trace

- CLI engineer acquire: authenticated principal + key/ref/assertion-file → shared choice parser → selected C (plain R1) → unchanged A.
- MCP engineer_acquire: closed required key/ref/fences → server principal → same parser/C, no legacy raw A/max_attempts fallback; HTTP schema and instructions migrate.
- Controller selected: parse a present selected object before mutation → original owner reserve/events with choice/ref evidence → selected port (plain R1), selector zero calls; preserve reconcile/liveness/attempt flow.
- Campaign selected: parse before mutation, R2 membership before reserve → same selected options identity for outer/inner C → original callback/compensation/replay/handoff; CLI flags map this shape.
- No new now_ms consumer or caller timestamp: existing selected C forwards the trusted observation time through existing offer_options to unchanged A.
- Coordinator owns independent review. Remote push/Draft PR only after actual verification and coordinator review; no GitHub CI, fake Receipt/verdict or independent review conclusion. Primary trace/user changes remain read-only.

## Development verification and independent review boundary

- Initial CLI/MCP/controller focused run:31pass0fail231expects. Campaign selected/CLI/replay focused:5pass0fail22expects. CLI selected flag negatives:1pass0fail4expects.
- MCP full focused initially19pass1fail:whole textResult string ordering differed while the replay protocol object was equal. Assertion now compares structuredContent and same Lease identity.
- First selected-MCP replay rerun timed out (120000ms test; synchronous admission continued, fixture teardown caused git-common-dir error). Preserve /tmp/e1-s4-mcp-replay-focused.log as failure evidence; no passing claim from it. Observed machine load18.46/94.73/144.32 in the next load check. No production behavior was changed for that timeout.
- Actual retry at15:58 with same authorized120000 timeout:1pass0fail11expects33.08s, log /tmp/e1-s4-mcp-selected-retry-1556.log. Typecheck log /tmp/e1-s4-type-after-focused.log passed; final exact suite/typecheck is authoritative.
- Coordinator owns independent review; no worker-created externalPASS, Recommendation/verdict or AcceptanceReceipt. After that review, Aimpact permits push and Draft PR only. Skip GitHub CI, no Ready/merge/delete/S5.

## Local subject boundary and runtime correction

- Owner authorized the preserved untracked `.ai/harness/handoff/s4-coordinator-handoff-20261002.md` only in local verification subject/hash. It is outside worker Allowed Paths and excluded from index, commit and PR. Local execution subject therefore includes that extra file and must not be represented as the pure commit subject.
- Original full suite `/tmp/e1-s4-full-local-suite-1635.log` exited 1: four failed files (architecture continuation/provider/queue and candidate-bound global-runtime reconciliation). Default Node was v26.10.0; provider logs explicitly reject Node >=26. Existing `/opt/homebrew/opt/node@24/bin/node` v24.21.0 is used via PATH and REPO_HARNESS_NODE_BIN for final verification; PATH is recorded in contract cache inputs; REPO_HARNESS_NODE_BIN is harness-internal and intentionally cannot be declared as a check input. The canonical runner scrubs internal variables; Node24 is selected by PATH. No runtime/adapter code changes.
- Node24 architecture retry `/tmp/e1-s4-node24-failure-retry.log`: 78 pass, 0 fail, 493 expects; actual exit 0. Original failures remain preserved.
- Current S4 code adds no external CLI launcher, adapter or stdout parser; product CLI assertion JSON input validation is within the four-entrypoint contract. No Pi/OAR integration work was added.

> **Substantive Change SHA256**: `sha256:fb4ebc1b970f63135525500cf45d89b9f0dca9ff78d9a1ba6dcfb6e417821997`

## Final verification disposition (blocked before commit/remote delivery)

- Coordinator independent static review reported no blocking code finding over the 14 tracked implementation/test/runbook files and four workflow artifacts. Raw `git diff 9aef6693 -- src tests docs/reference-configs/engineer-acquisition-cutover.md` SHA256: `f3a440400cb8d1612e02036e837da80109735f8e46d39368ecb0a17b1d092d1d`. This is not a harness normalized subject, verification PASS, or AcceptanceReceipt. Worker has not filled Recommendation/verdict/Receipt.
- Canonical command: `PATH=/opt/homebrew/opt/node@24/bin:$PATH bun scripts/verification-plan.ts execute --repo . --contract tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md --report-file .ai/harness/checks/e1-s4-final-verification.json --timeout-ms 7200000`; actual exit 1. Its own report was moved to the existing ignored `*.latest.json` naming convention; no gitignore rule changed. Final report: `.ai/harness/checks/e1-s4-verification.latest.json`; preserved failed copy: `.ai/harness/checks/e1-s4-node24-four-jobs.failed.latest.json`; console: `/tmp/e1-s4-node24-four-jobs-contract.failed.log`.
- Frozen target HEAD: `9aef6693b483f36b67f72c9a910a2854ac0b5b18`; virtual tree: `d3e99fc993fda78a978256f49ef6ef579f844f03`; execution snapshot: `sha256:b29928161c0ea12d0d6e128029b2fb734bd3dda24bc014a50ff81796a45133c2`; snapshot_changed_during_execution=false. This local virtual tree includes the owner-authorized extra untracked coordinator handoff. It is not a pure commit subject. These notes/review failure-disposition lines were added afterwards; source/tests/runbook remain byte-identical to the reviewed/executed implementation. Do not claim the changed workflow metadata has current-exact all-green evidence.

| Check | Actual command from contract | Exit | Result |
|---|---|---|---|
| full-local-suite | `BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=4 BUN_TEST_MAX_CONCURRENCY=1 BUN_TEST_TIMEOUT_MS=180000 bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'` | 1 | FAIL |
| type | `bun run check:type` | 0 | pass |
| hooks | `bun run check:hooks` | 0 | pass |
| helpers | `bun run check:helpers` | 0 | pass |
| reference-configs | `bun run check:reference-configs` | 0 | pass |
| deploy-sql | `bash scripts/check-deploy-sql-order.sh` | 0 | pass |
| architecture | `bash scripts/check-architecture-sync.sh` | 1 | FAIL |
| task-sync | `bash scripts/check-task-sync.sh` | 0 | pass |
| task-workflow | `bash scripts/check-task-workflow.sh --strict` | 0 | pass |
| state | `bun scripts/inspect-project-state.ts --repo . --format text` | 0 | pass |
| adoption-dry-run | `bun src/cli/index.ts init --repo . --dry-run` | 0 | pass |

- Full Node24 suite: 457 files, 5750 pass / 1 fail / 81 skip, exit 1; sole test failure is `tests/effects/brc10-lifecycle.test.ts:247`, two OS recovery callers waiting for planning.lock. Full diagnostics: `.ai/harness/runs/verification-vx-e77d5c8953e644e9909b.log`; extracted original failure `/tmp/e1-s4-node24-brc10-failure.log` preserved. No full-suite all-green claim.
- Low-interference same-file command: `PATH=/opt/homebrew/opt/node@24/bin:$PATH bun test --timeout 180000 --max-concurrency 1 tests/effects/brc10-lifecycle.test.ts`; exit 1, 12 pass / 1 fail / 4 skip, 126 expects, 152.71s; `/tmp/e1-s4-brc10-node24-low-interference.log`. Same planning.lock refusal; load is not asserted as cause.
- Exact unchanged baseline was extracted with `git archive 9aef6693b483f36b67f72c9a910a2854ac0b5b18` into `/tmp/e1-s4-baseline-9aef6693-rl6vbz5q`, using the unchanged dependencies via node_modules symlink. Provenance: `/tmp/e1-s4-baseline-provenance.json`. Same Node24/Bun1.4.2 targeted command adds `--test-name-pattern 'two OS callers settle the historical final under one recovered generation'`: exit 1, 0 pass / 1 fail / 16 filtered out, 4 expects, 18.64s. Log: `/tmp/e1-s4-brc10-baseline-9aef6693-node24.log`. Baseline has the identical failure, proving S4 is not required to reproduce it; root cause remains unproven.
- Static failure trace: recoverCampaignDispatch (`campaign-recovery.ts:157`) → withCampaignPlanningLock (`campaign-planning-store.ts:51`) → withExclusiveDirectoryLock/acquireExclusiveDirectoryLock. Those three files and the brc10 test are unchanged versus 9aef6693; the timeout does not traverse selected C. No lock code/test assertion changed.
- Architecture gate exit 1: provider=ready, pending=0/running=0, dead_letters=1/human_actions=1/blocking=2. Local dead letter `job-7908b04944846c4f34d3dd57` reports `unresolved-major-change`; status shows one unresolved candidate, zero receipts. Gate log `.ai/harness/runs/verification-vx-ea343fa1dc1f4737abf4.log`; read-only status `/tmp/e1-s4-architecture-status-node24.json`. Owner action is required; no retry/apply/accept/waiver was fabricated or executed.
- Result: 9/11 checks pass, check:type exit0; blocked by architecture gate. No commit/push/PR/Ready/merge/delete, no main mutation. Index remains empty; coordinator handoff remains untouched and excluded.

## Aimpact 18:18 closeout and exact reconciliation outcome

- Aimpact authorizes S4 local commit, branch push and Draft PR against main despite the disclosed brc10/architecture failures; no gate or Verification Plan is weakened and no AcceptanceReceipt is created. This supersedes the earlier delivery blocker, not the failing verification result. Main, unrelated handoff and the separate 1756 investigation note remain excluded.
- Rebuilt only this worktree's configured ignored `.codegraph` with the installed CodeGraph 1.6.1: `PATH=/opt/homebrew/opt/node@24/bin:$PATH CODEGRAPH_NO_DOWNLOAD=1 node_modules/.bin/codegraph init -i . --yes`, exit 0. Status exit 0: initialized, index state complete, 1212 files, 36076 nodes, 126968 edges, pendingRefs=0, pendingChanges all zero, worktreeMismatch=null. Log `/tmp/e1-s4-codegraph-rebuild-1818.log`.
- Executed `PATH=/opt/homebrew/opt/node@24/bin:$PATH bun src/cli/index.ts architecture-projection reconcile --signal-id sha256:cfc19e87da19df2f54d0a1e7d1aca1d74f7d4f0ed5a664d7af5defdd6d16f5fe --json`; actual exit 1: `architecture reconciliation requires an empty noop with no unresolved evidence`. `/tmp/e1-s4-reconcile-1818.stderr` preserves the refusal. Reconciliation receipt count remains 0; original candidate/dead letter retained.
- The CLI omits delta fields on refusal. A subsequent diagnostic reused the existing `captureArchitectureProjectionSnapshot` and `runArchitectureProjection` functions in check-only mode, with no acceptedChange/apply or harness candidate recorder. This read-only result has CodeGraph input/output ready, status human-action-required, reason verified-flow-proof-changed, exactly one affected node `capability.runtime-harness.mcp-sidecar`, and two proposed updates: `docs/architecture/.projection-manifest.json` and `docs/architecture/modules/runtime-harness/mcp-sidecar.md`. applyReceipt=null, priorCommittedApplies empty. Full diagnostic `/tmp/e1-s4-reconcile-check-diagnostic-1818.json`; summary `/tmp/e1-s4-reconcile-check-summary-1818.json`. Diagnostic-only signal `sha256:2728221e6e112ec17394dfe234dfd9d709a0a964c73461e4ffede0ceae24f7db` was not persisted as a new harness candidate.
- Stopped architecture changes on that delta: no accept/apply/retry, no model/doc writes, no policy relaxation. The original missing-index issue is repaired, but real MCP proof drift remains; do not report the architecture gate as passed.
- Independent coordinator static review found no blocking S4 source defect across all 14 tracked changes and existing workflow artifacts. All four selected paths reach shared C, malformed inputs refuse without PICK, controller keys/events and campaign R2 owner/budget/callback/replay remain intact. No external CLI adapter/output parser was added. Three CLI help commands and git diff --check passed. This is source review, not an AcceptanceReceipt or an overall green verification claim.
- Reviewed/executed S4 source+tests+runbook raw diff hash is unchanged: `f3a440400cb8d1612e02036e837da80109735f8e46d39368ecb0a17b1d092d1d`. Metadata updates, new investigation note and ignored index are not silently represented as the earlier complete execution subject.
- Draft PR must disclose full suite 5750 pass / 1 fail / 81 skip (exit1), baseline brc10 reproduction, independent fix/brc10-planning-lock-timeout repair, typecheck pass, original 9/11 gate result and this nonempty reconcile refusal. GitHub CI is skipped by owner instruction; no S5/live deployment or semantic task acceptance is claimed.
- Closeout rechecks after the authorized metadata update: `bun run check:type` exit0; `bash scripts/check-task-sync.sh` exit0 with the existing bound substantive digest; `bash scripts/check-task-workflow.sh --strict` reports OK; `git diff --check 9aef6693` exit0. `bash scripts/check-architecture-sync.sh` still exits1 with pending=0/running=0/dead_letters=1/human_actions=1/blocking=2. Code/tests/runbook remain unchanged; full suite is not rerun or reclassified as passed.
