# Workstream: Refactor activation

> **Status**: in_progress
> **Capability ID**: `runtime-harness-refactor-program`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/refactor-program.md`
> **Substantive Change SHA256**: `sha256:74caed12b5bd536856882e0484288a9257d4aa11f35b07af951fa0e25a43668f`

## Verified state

- The consumer pins published npm `archctx@0.5.7` and `archctx-contracts@0.5.7` in both provider contracts, installed policy, dependency lock and initialization templates. The capability handshake rejects `0.5.3`.
- Canaries 5 and 6 passed in a fresh disposable repository through the consumer adapter and registry-installed dependencies: unchanged work cannot resolve; completed cutover resolves on the final main HEAD and the resolved recommendation reads back successfully.
- Recommendation readback freshness describes live Git identity; provenance retains the historical ledger scope. Verification evidence remains bound to its measured HEAD and worktree digest.
- Evidence: `/tmp/refactor-canary-054/canary5.json`, `/tmp/refactor-canary-054/canary6.json`; reproducer: `/tmp/refactor-canary-054/lifecycle.ts`.
- Historical Canary 7 stopped at `refactor record`: the provider accepts a live assessment but returns the historical ledger HEAD/digest in its envelope. The consumer rejects it as `refactor_assessment_stale`. Evidence: `/tmp/refactor-canary-054/canary7-failure.json`; reproducer: `/tmp/refactor-canary-054/canary7-readback.ts`.
- Historical consumer validation: full suite 4,135 passed, 4 skipped, one worktree-notice timeout; the complete affected test file then passed 48/48. Typecheck, task/architecture/workflow gates, helper sync and init dry-run passed.
- Activation remains `off`. No promotion or scheduled job was created.

## Remaining acceptance

The historical Canary 7 live-identity defect was fixed upstream in `ab5ccb8` and is included in 0.5.7 (published source `517cc5efe4f09e48e5dfb9ab6b2fad44fa547022`). The consumer audit repairs are recorded in `docs/researches/20260905-refactor-057-audit-repairs.md`. Published-package lifecycle smoke and consumer AXR5 0.5.7 verification now pass. The one-recommendation-to-many-Work-Packages mapping is closed by the consumer composition regression documented in `docs/researches/20260905-refactor-multi-work-package.md`. Before activation, refresh the complete ten-canary set for the final installed consumer revision and observe each activation rung in disposable repositories. Only successful acceptance permits this repository to enter `shadow`.
