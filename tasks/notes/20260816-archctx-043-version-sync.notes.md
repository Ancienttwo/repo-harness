# archctx 0.4.3 Version Sync

## Decision

repo-harness now pins archctx + archctx-contracts 0.4.3 and
`archcontext.docs-renderer/v3`. The v2→v3 migration ran as a one-shot full
re-render; the generated projections commit is separate from the version-sync
commit so each state stays revertable.

## Rationale

Upstream 0.4.3 (arch-context PR #106, merged 21b35d3) replaces the globally
coupled entitySourceDigest with a per-node sticky key, so an unrelated commit
no longer restamps `verifiedAgainst` on every capability document. The
capabilities feature IDs are unchanged (`architecture-docs-renderer-v2` stays a
feature string), so only `ARCHCTX_REQUIRED_VERSION` and
`ARCHITECTURE_DOCS_RENDERER_VERSION` moved.

## Verification

- `bun scripts/axr5-archctx-clean-room.ts` → `status: verified`, tarballs
  rebuilt from f745a6d, readback committed.
- `bun test` → 2430 pass; 7 failures are pre-existing on this machine
  (global-runtime bootstrap suite + provider PATH guard), reproduced on a
  stashed baseline before the bump. The e2e manifest assertion passes after
  the migration drain.
- Post-migration unrelated-commit drain (this note's commit) is the standing
  acceptance face: docs/architecture module docs must show zero restamp.

## Tradeoff

Every anchor that pins the archctx version had to move together: policy.json,
init templates (`project-init-lib.sh`, `ensure-task-workflow.sh` x2), axr5/axr6/
axr7 check scripts, and six test fixtures. Fixture handshakes declare renderer
v3 even though the feature ID still says v2; that asymmetry is upstream
contract, not drift.
