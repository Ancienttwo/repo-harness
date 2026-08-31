# Debug: ArchContext projection dead-letter job-75a70712bbce2a6c79922969

## Observations

- Environment: macOS, Bun 1.4.0, Node 22.22.0, `archctx@0.4.5`, `archctx-contracts@0.4.5`, package-local CodeGraph 1.5.0.
- The exact job is reproducible through `architecture-projection drain`: after three process attempts it enters dead-letter with `Worktree digest changed before apply`.
- The failure is pre-write. Git remains at `777809873be8e3e1b6e6b834485ab2bf9694a5b6`, tracked files remain clean, and `docs/researches/20260824-TDD-audit.md` remains byte-identical at SHA-256 `54463962e91de98bc263ee1ffba051113b1048c5df47e9f8de75e03135bd91b2`.
- repo-harness captures the projection snapshot with `.ai/harness` excluded. ArchContext's projection-specific snapshot also excludes `.ai/harness` and projection-owned outputs.
- ArchContext 0.4.5 nevertheless passes a generic `computeWorktreeDigest(root)` to daemon `applyUpdate`; that generic digest includes `.ai/harness`. The daemon recomputes the same generic digest before apply and throws on any difference.
- `.ai/harness` is demonstrably live during this session: job state, post-bash checks, event logs, hook telemetry, effective state, session budget, handoff, and run evidence have recent writes while tracked and user-authored inputs remain unchanged.
- The package CLI and daemon contain duplicate generic digest implementations with identical default ignore lists; neither list excludes `.ai/harness`.
- The normal package-local provider/orchestrator suite passes 52/52, so the broken boundary is the real daemon apply precondition under live repo-harness runtime state, not result decoding or receipt consumption.
- The package-local 0.4.5 CLI is connected to a live daemon reporting product/surfaces/contracts version 0.4.4, started at `2026-08-26T14:36:36.279Z`. RPC v1 compatibility allowed this mixed-version runtime instead of rejecting it.

## Hypotheses

### H1: Live `.ai/harness` runtime writes invalidate ArchContext's generic apply precondition

- Supports: the error occurs at the first generic digest comparison; `.ai/harness` is included there but intentionally excluded from both projection snapshot implementations; multiple `.ai/harness` files change while tracked/product inputs and the user file remain stable.
- Conflicts: the exact file changing inside the short plan-to-apply interval has not yet been captured.
- Test: instrument the ArchContext daemon's existing mismatch error to report the expected/current generic digests, retry once, and sample `.ai/harness` identities during the run; revert the diagnostic immediately.

### H2: Another actor is modifying a product or user-authored input during projection

- Supports: the repository is a shared workspace and the failure is timing-sensitive.
- Conflicts: Git status, HEAD, the user file digest, and tracked diff are stable across repeated failures; only runtime evidence shows recent mutation.
- Test: compare product/user file hashes and mtimes immediately before and after one controlled reproduction.

### H3: CLI and daemon use semantically different digest implementations or roots

- Supports: the bundled CLI and daemon call two separately bundled `computeWorktreeDigest` functions and run in different processes.
- Conflicts: inspected source shows identical ignore lists and traversal logic; both receive the canonical repository root.
- Test: expose both expected and current values at the daemon comparison, then reproduce with no product-file changes.

### H4: The 0.4.5 client is executing apply against a stale 0.4.4 daemon (ROOT HYPOTHESIS)

- Supports: daemon status proves an exact 0.4.5 client / 0.4.4 server split; this task specifically depends on 0.4.5 durable projection apply/reconcile semantics, while RPC v1 compatibility does not bind the product version.
- Conflicts: the generic digest race remains a plausible independent defect if a 0.4.5 daemon reproduces the same failure.
- Test: stop only this repository/workspace daemon, start it from the exact package-local 0.4.5 binary, verify daemon product version 0.4.5, then retry the same dead-letter once with all product/user bytes unchanged. Success rejects H1 as the active cause; the same failure rejects H4 and returns to H1 instrumentation.

## Experiments

### E1: Replace only the stale daemon version

- Planned change: runtime restart from package-local 0.4.5; no repository file or product logic change.
- Confirmation: daemon status reports 0.4.5 and the exact job reaches a durable receipt with the strict gate passing.
- Rejection: daemon reports 0.4.5 but the job again fails `Worktree digest changed before apply`.

- Result: rejected. The daemon was cleanly replaced and status proved product, CLI, daemon, and contracts were all 0.4.5, but the recovered exact job failed with the same pre-write digest error and returned to dead-letter. No tracked or user-authored bytes changed.

### E2: Capture caller and daemon generic digest payloads

- Planned change: add one temporary payload dump line to each bundled generic digest function, restart the same 0.4.5 daemon, and retry the exact job once.
- Confirmation for H1: caller/daemon inventories differ only in live runtime files while product/user files remain identical.
- Rejection for H1: inventories differ in a product/user input, or the two implementations produce different digests over identical inventories.

- Result: the controlled retry succeeded and produced the durable receipt. The caller and daemon payloads were byte-identical on the successful attempt (`9fe52683167b296c2c4e33e281bc755962869e642a8324b6b551e46fddde7ca5`), proving the duplicate implementations agree when the worktree is quiescent. The payload contains 6,639 `.ai/harness` files, including live job, hook, event, check, run, handoff, security, and session state. The temporary two-line instrumentation changed no digest input or apply semantics and was removed immediately afterward.

## Root Cause

ArchContext's daemon-level generic ChangeSet precondition includes the live `.ai/harness` runtime tree even though the projection identity contract excludes it; runtime evidence can therefore change between the client-side expected digest and the daemon-side comparison while every product/user input remains stable, causing the observed pre-write `Worktree digest changed before apply` failures. A stale 0.4.4 daemon was a secondary exact-runtime violation, but reproducing once on 0.4.5 rejected it as the sole cause.

## Fix

- Operational recovery: replace the stale daemon with the exact package-local 0.4.5 runtime, wait for the abandoned provider lease, retry the exact dead-letter after runtime activity quiesces, and preserve fail-closed pre-write behavior. The job completed as `applied`, created receipt `sha256:c298bfb4809eb4aae1c305cbef8c08ee447ab8df0e03e892182e0f7dc809ad12`, and left pending/running/dead-letter all at zero.
- Verification: the official 0.4.5 daemon was restarted after removing diagnostic instrumentation; package binary SHA-256 is `acf0f2d901d5b830ebb5246411e99d281813f896c8903dc3885a69c50839acc4`; strict architecture sync passes.
- Required upstream correction: projection apply must bind its ChangeSet precondition to the projection-specific worktree digest (or otherwise exclude `.ai/harness` symmetrically) and the package-local readiness handshake must reject a daemon whose product version differs from the exact client package version. This belongs in ArchContext; repo-harness must not add a semantic fallback around an authority-owned digest.

---

# Debug: sealed terminal rejects Codex plugin acceptance

## Observations

- Reproduction: `bun scripts/classify-historical-plans.ts --verify-sealed-contract tasks/contracts/20260901-0205-external-source-binding-wp2.contract.md --verify-sealed-review tasks/reviews/20260901-0205-external-source-binding-wp2.review.md` exits 1.
- Exact result: `contract status is Active, not Fulfilled`, with `review_recommendation=pass` and `receipt_recorded=false`.
- The accepted review records `Disposition=external_pass`, `Reviewer=Codex`, and `Source=codex-plugin`.
- The contract acceptance policy also names `Reviewer=Codex` and `Source=codex-plugin`.
- `hasRecordedAcceptanceReceipt` accepts Codex only when the source is `codex-review`.
- Environment: macOS, Bun 1.4.0, repo-harness 0.18.0, commit `e2c04899`.
- Working boundary: recommendation parsing succeeds; the failure is confined to sealed terminal evidence classification and the still-active contract lifecycle status.

## Hypotheses

### H1: `hasRecordedAcceptanceReceipt` hard-codes a host-specific source instead of consulting policy (ROOT HYPOTHESIS)

- Supports: the review and contract use the current Codex-host `codex-plugin` source, while the classifier hard-codes the Claude-host `codex-review` source.
- Conflicts: contract status is independently Active, so the end-to-end command cannot isolate this limb by itself.
- Test: evaluate `hasRecordedAcceptanceReceipt` once with current review bytes and once with only `codex-plugin` replaced by `codex-review`; false then true confirms the identity predicate mismatch.

### H2: Markdown section or header parsing fails on the projected review shape

- Supports: `receipt_recorded=false` can result from any missing projection field.
- Conflicts: the projection visibly contains every required field and valid hashes/timestamp.
- Test: evaluate the function with the source unchanged but independently inspect parsed headers through the existing tests.

### H3: Active contract status forces `receipt_recorded=false`

- Supports: the top-level result reports the contract lifecycle failure first.
- Conflicts: `evaluateSealedTerminalEvidence` computes `receiptRecorded` before testing contract status, and returns that independent value.
- Test: call `hasRecordedAcceptanceReceipt` directly without the contract.

### H4: Acceptance projection and policy legitimately require different source vocabularies

- Supports: historical Claude and Codex review runners used different source names.
- Conflicts: projection and policy must use the same source for a given contract; the failure is between host routes, not between those two authorities.
- Test: compare the classifier predicate with `parseAcceptancePolicy` and AcceptanceReceipt validation constants.

## Experiments

### E1: One-variable in-memory source substitution

- Change: no repository files; replace only the review projection source string in memory.
- Confirms H1 if current bytes return false and substituted bytes return true.
- Rejects H1 if both results are equal.
- Result: `{"current":false,"substituted":true}`.
- Conclusion: H1 confirmed. H2 and H3 do not explain the direct function result; H4 conflicts with the canonical protocol-2 policy documented in `docs/reference-configs/sprint-contracts.md`.

### E2: External review falsifies a global literal replacement

- Change under review: replace `codex-review` with `codex-plugin` in the identity predicate.
- Result: the official Codex plugin review identified that protocol 2 intentionally uses `codex-review` on Claude hosts and `codex-plugin` on Codex hosts.
- Confirmation: `scripts/plan-to-todo.sh` emits both policies according to host, `parseAcceptancePolicy` accepts both, and `acceptancePolicySource` returns the contract-frozen source.
- Conclusion: the original root-cause boundary was correct but the first fix was too narrow. The missing invariant is exact receipt-to-policy binding, not global retirement of `codex-review`.

## Root Cause

`scripts/classify-historical-plans.ts:hasRecordedAcceptanceReceipt` hard-coded the Claude-host `codex-review` source without reading the contract's frozen acceptance policy. Codex-host contracts therefore rejected valid `codex-plugin` receipts; globally replacing the literal would produce the symmetric failure for Claude-host contracts.

## Fix

- Reuse the authoritative acceptance-policy parser and require external reviewer/source identity to match that exact policy.
- Permit a user-waiver projection only when the same policy explicitly allows waiver.
- Add regression coverage for both protocol-2 host sources, cross-policy mismatches, invalid policy, and forbidden waiver.
- Promote the already accepted WP2 contract lifecycle to `Fulfilled`, rerun sealed-terminal classification, and archive the workflow after the classifier fix lands.

## Verification

- The regression guard failed on the unfixed classifier with `PRE_FIX_EXIT=1` and is preserved at `tasks/notes/20260901-0432-archive-codex-plugin-source.pre-fix.log`.
- After policy binding in runtime and template helpers, both focused classifier and archive evidence suites passed: 14 tests, 177 expectations.
- The exact WP2 sealed-terminal command returned `ok=true`, `contract_status=Fulfilled`, `review_recommendation=pass`, and `receipt_recorded=true`.
- The working-tree archive helper moved the WP2 plan, contract, review, notes, and todo projection into their canonical archive surfaces.
