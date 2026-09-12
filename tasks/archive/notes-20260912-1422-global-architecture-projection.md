> **Archived**: 2026-09-12 14:22
> **Related Plan**: plans/archive/plan-20260911-0144-global-architecture-projection.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260912-1422
> **Archive Projection V1**: `plans/plan-20260911-0144-global-architecture-projection.md` => `plans/archive/plan-20260911-0144-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/notes/20260911-0144-global-architecture-projection.notes.md` => `tasks/archive/notes-20260912-1422-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/contracts/20260911-0144-global-architecture-projection.contract.md` => `tasks/archive/contract-20260912-1422-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/reviews/20260911-0144-global-architecture-projection.review.md` => `tasks/archive/review-20260912-1422-global-architecture-projection.md`

# Implementation Notes: global architecture projection

## P1: Map
Global install/update owns ~/.repo-harness/config.json; repository init owns adoption only. CLI status, Stop, projection orchestration and three shell gates now consume one global loader. Repository models, architecture documents, freshness policy and acceptance remain local.

## P2: Trace and root cause
Before this change, global install/update did not initialize projection. The provider read repo policy, whose missing settings became disabled; shell seeders wrote disabled repo switches. The red two-repository CLI regression expected archctx but received disabled (captured under .ai/harness/checks/global-architecture-pre-fix.log).
After: install/update seeds archctx/automatic once -> repository init reports readiness -> global loader -> existing exact-version provider handshake -> durable job/receipt pipeline. Missing models remain not-ready and do not authorize semantic adoption.

## P3: Decision
Cut over execution settings to one host authority, with no repo override or migration merge. Operator-invoked adoption removes retired repo execution keys. Preserve explicit global disabled, unrelated global fields, package-owned provider version, human-owned regions and approval boundaries. At ten times the repositories, repeated setup is removed; provider work remains bounded by existing timeout/queue contracts.

## Verification and review
The focused development baseline passed 141 tests. Subsequent config/Stop delta passed 45 tests, global setup entrypoint passed, seeders passed, and three affected helper regressions passed. Architecture and security specialists inspected the full diff. Null enum coercion and a new jq dependency were found and fixed; Node-only shell parsing retains the existing runtime support using the same authority. Final required checks are recorded by verify-sprint.

## Known limit
The provider process-tree timeout regression fails both here and on unmodified main because descendant.pid is absent. Logs: /tmp/global-provider-timeout-recheck.log and /tmp/global-provider-base.log. It is outside this configuration change and remains unfixed. Native specialist review is not the contract's external Codex-plugin AcceptanceReceipt; do not infer merge acceptance from it. This task opens a draft PR if that receipt remains unavailable.

The user additionally requested a v0.19 proactive refactoring discovery check after this PR; keep that evaluation separate from this implementation.


Final review delta: malformed Node readiness now exits nonzero instead of emitting a synthetic provider/apply pair. Both Node-only valid-policy and corrupt-readiness checks pass. Remote main advanced from 8fc92c08 to 09e4a4d0 with only a projection manifest rebind (#400); the branch incorporates that manifest-only update before final prepared evidence. External current-target merge acceptance remains pending.

> **Substantive Change SHA256**: `sha256:bee75aaab8faa2213b92fd281c0193a9112052c8671193105f515d3a6cf38f43`

PR merge-base evidence (09e4a4d0; source unchanged from final passing preparation):
> **Substantive Change SHA256**: `sha256:b5bc1f792456ca2603e9413400a749aa6b6d3b342d0498af285f13abde339c4d`

Final preparation: 25/25 checks passed, run `run-20260911T021315-69480-20260911-0144-global-architecture-projection.json`, evidence event `evt-01M268DR3704SJRDCK8X8WPH5X`. PR #401 is open as draft pending external acceptance.

External review on b2fc5332 (official codex-plugin 1.0.5) returned needs-attention: downstream src/cli/index.ts could be executed without harness identity. Fixed by preferring an explicit CLI and requiring repo-harness package name/bin identity before selecting repository source. Downstream unrelated-CLI regression passes. One semantic review is consumed; no external_pass is claimed for the corrected subject.

> **Substantive Change SHA256**: `sha256:b4805ba021e01c81d389b8bab10d788d2f3a553e831f5cbcae77463638e24cdc`

> **Substantive Change SHA256**: `sha256:bd1db64699a6fc2530da1414eeccec48a0afe2e556a3167bab7f5824e0a46741`

> **Substantive Change SHA256**: `sha256:184044c09055fa355d6800e611adf2f80c0178d59f25703af2cc4c283bb62e59`

## CI fixture delta after external-review correction

CI run 34516726468 passed Governance and all three MCP platform checks but failed four helper fixture cases. The readiness call now needs a real CLI; bundled helper fixtures omitted it, and copied source fixtures omitted runtime.gitignore and node_modules. The fixture setup now supplies the template and checkout dependencies, and the bundled helper explicitly selects the checkout CLI. No product code or check threshold changed.

All four failing cases pass with the installed repo-harness removed from PATH (4 pass, 136 assertions; /tmp/global-ci-path-fixture-final.log). The prior 25/25 prepare result at 0186ded0 remains baseline evidence; this test-only delta has its own focused evidence. No external acceptance or final CI pass is claimed for the new commit.

> **Substantive Change SHA256**: `sha256:b9da34c4d0f78bd6a548e7cc1a87e2bbae9eb81669a67fc899871f784293aee0`

## Final acceptance follow-up

P1: The protected helper runner owns executable identity and sanitizes PATH. P2: trusted runHelper -> verify-sprint -> global architecture readiness now needs the main CLI; only Hook CLI was previously bound, so a clean runtime could not resolve the command before emitting a snapshot. P3: bind src/cli/index.ts from the same trusted package through resolveFromDir, alongside Hook CLI. No caller override or repo-local executable is admitted.

The existing fleet-acquire regression reproduced the missing-CLI error before this correction (/tmp/global-fleet-pre-fix.log). Its diagnostic assertion no longer reads a nonexistent snapshot before showing the actual error. The status fixture now expects the explicit missing-global-configuration reason instead of a retired repo policy reason. Both failures occurred on the CI heads of #401 and #408 and are within this authority cutover.

> **Substantive Change SHA256**: `sha256:021b35f557a319a9ee097b501f5c24bb7fe45a6a04184c0ce4461aff742da400`

Acceptance base refreshed to main e238a73a after concurrent PRs landed. Their changes are target content, not this task scope.

> **Substantive Change SHA256**: `sha256:ed46a46061112fc50f4a31e4e9c92615f22aa0da8e204ab66a91314274cd0911`

Main advanced to 75410260 during CI. Merge retained upstream retention changes and the existing Stop runtime alias; only the import and todo timestamp conflicted.

> **Substantive Change SHA256**: `sha256:890686feb12a80371cb0c63c656ac82cd4327f0b8ca5b438e54996e771b1fefd`

## Workflow closeout

Delivered via PR #401, merged at 9563083c. No typed AcceptanceReceipt was sealed
for that exact subject (the review card records the external AcceptanceReceipt as
pending), so `completed_archive_gate` cannot admit a `Completed` archive without a
user-issued waiver. Archived `Superseded` instead: the merged main tree is the
surviving authority for this scope and the plan family no longer represents active
work.
