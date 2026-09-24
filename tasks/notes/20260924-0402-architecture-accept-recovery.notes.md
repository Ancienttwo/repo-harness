# Implementation Notes: architecture-accept-recovery

> **Status**: Active
> **Plan**: plans/plan-20260924-0402-architecture-accept-recovery.md
> **Contract**: tasks/contracts/20260924-0402-architecture-accept-recovery.contract.md
> **Review**: tasks/reviews/20260924-0402-architecture-accept-recovery.review.md
> **Last Updated**: 2026-09-24
> **Lifecycle**: notes

## Design Decisions

- `projection-acceptance.ts:175-208` keeps the provider result only in memory until refresh completes. A refresh exception loses that consumer copy; retry attempts apply again.
- The installed runtime is `archctx@0.5.10`. Its public `projection recover --request-json` takes lookupKey/applyId and returns proof plus first-delivery signals, not the original full result.
- Source audit in `Ancienttwo/arch-context` at `4fb7b7d5748cb59095c7cb0f0e43c5e2d3988bb3` (referenced source files clean; unrelated documentation WIP preserved): `packages/surfaces/cli/src/main.ts:1446-1465` shows normal apply consumes recovery delivery before returning; `:1620-1624` omits signals on repeat. `packages/contracts/src/projection.ts:592-594` forbids repeated signals on already-delivered results.
- `packages/local-runtime/runtime-daemon/src/index.ts:2985-2994` returns stored proof immediately for already-delivered receipts, so it is not fresh verification. The private daemon SDK is not a supported downstream substitute for a missing public CLI interface.

## Deviations From Plan Or Spec

- A repo-harness-only wrapper cannot safely recover the existing 03c state. The approved prerequisite is a versioned, read-only public archctx receipt lookup that returns the original provider result/signals and revalidates current fixed point on every read, without consuming delivery state.
- After that prerequisite, the consumer records intent before provider invocation and the original result before refresh; existing per-action checkpoints support retry. Do not claim strict exactly-once shell action execution.
- Original 03c was inspected read-only: eight generated docs modified, three unresolved candidates, zero consumer acceptance receipts and no invalid artifacts. No original files, candidate data or provider receipts were edited.

## Tradeoffs Considered

| Option | Decision | Reason |
|---|---|---|
| Pending result plus current recover | Incomplete | Misses provider commit before response/pending write, and cannot rescue the existing receipt. |
| Rebuild result/signals from candidate or proof | Reject | These do not carry the original provider semantic evidence. |
| Public repeatable receipt read with fresh proof plus consumer pending | Required | Preserves provider authority and closes both interruption windows. |

## Open Questions

- User approved two-repository source repair on 2026-09-24. Release remains separately authorized.
- The original approval reference is reusable only for its exact candidate and verified committed output. Stale-candidate retirement remains separate.

## Evidence Links

- `.ai/harness/runs/accept-recovery/pre-fix.log`: actual provider regression run, 30 pass / 1 fail, `PRE_FIX_EXIT=1`.
- Regression guard: `tests/architecture-projection-provider.test.ts`. Provider commit then refresh failure, followed by same-approval retry, reproduces the reported precondition failure.
- `bun run check:type` and diff whitespace check passed in the diagnosis run. No production source changed.
- Canonical acceptance, PR, merge and release have not run. No approval or receipt is manufactured.

## Review correction: uncommitted intent

Source gate found that an intent written before provider invocation cannot require a committed receipt forever: a pre-call crash or launch failure may leave no provider receipt. The public protocol therefore includes exact-request `projection-apply-absence/v1`, checked against the current snapshot under provider writer ownership. Only an intent with no recorded result may retry normal apply on this typed evidence. Explicit recovery never applies. Provider apply rechecks committed receipt under the writer lock before side effects; generic failures never authorize replay. This correction stays within the approved crash recovery scope.

Local package integration uses unpublished source tarballs named 0.5.10 in an isolated node_modules. These are test artifacts, not a registry release; package.json and bun.lock remain registry pins. Downstream shipping and canonical acceptance must not treat this install as reproducible published dependencies.

## Source verification boundary

The implementation worker reports the final three focused files at 59 pass / 0 fail and `bun run check:type` pass using the isolated unpublished provider/contracts packages. All nine root integrity commands pass; task-sync binds this final substantive diff below. The same source gate rechecked its finding and returned PASS after reading the focused test and typecheck logs. Real packaged CLI apply/readback composition succeeded in a disposable fixture with fault-injected consumer refresh actions. `integration-artifact-check.log` confirms one final acceptance receipt and one refresh receipt; `isolated-daemon-stop.log` confirms running:false, the former PID absent, and no connection/lock files. The evidence lives in `.ai/harness/runs/accept-recovery/`. No canonical AcceptanceReceipt or release is claimed.

> **Substantive Change SHA256**: `sha256:9f8884e5b88664ddb992aeb1de1060da57336444ec4e48de327d62d827cbe36b`

## Remaining delivery boundary

The two source diffs are staged, not committed or published. The consumer depends on new public exports absent from registry 0.5.10, so a clean frozen install cannot ship this patch yet. Publish the reviewed archctx/archctx-contracts source as a new version, then update the exact consumer pins through Bun and prepare canonical acceptance against that reproducible install. The native source gate does not create the contract-required codex-plugin AcceptanceReceipt. Shared daemon replacement and original 03c recovery remain unexecuted. Original 03c read-only status still reports 3 candidates, 0 receipts, 3 unresolved, 0 invalid.

## Approved publication boundary

The user approved archctx/archctx-contracts 0.5.11 publication and downstream canonical acceptance, then added repo-harness 0.19.3 publication and selected Web Auth. Both consumer version constants, active policy producers and fixtures use 0.5.11; helpers remain projections of scripts. The worktree was fast-forwarded to main `2c00d4da5d0d769223791791c01ae6b501ab2c5f` before the release metadata changes. Product/skill/template version consistency passes at 0.19.3.

A release now requires the existing full gate, so the Verification Plan uses one expensive `check:release` check instead of repeating its constituent focused tests and integrity lanes. Version consistency remains an explicit separate check. Run the full gate only after the registry lock is generated and the subject is frozen. The existing source review is not the final canonical AcceptanceReceipt.

The 0.19.2 public tarball contains both architecture helper paths. The original failed refresh selected an incomplete local source-root override; publishing does not repair persistent user shell configuration. Global install and shared daemon replacement remain separate operations.

## Published dependency integration

On 2026-09-24 both archctx packages were published as 0.5.11 using npm Web Auth. Registry metadata reports latest 0.5.11; downloaded archives match the tested artifacts byte for byte. A fresh registry install exposes the readback capability and contract validators without creating runtime state. Bun installed both exact registry dependencies and generated the lock changes; no unrelated resolution changed. The full 0.19.3 release gate and canonical acceptance remain pending.
