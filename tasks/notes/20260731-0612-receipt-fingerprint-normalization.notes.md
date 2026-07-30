# Implementation Notes: receipt-fingerprint-normalization

> **Status**: Active
> **Plan**: plans/plan-20260731-0612-receipt-fingerprint-normalization.md
> **Contract**: tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md
> **Review**: tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md
> **Last Updated**: 2026-07-31 06:12
> **Lifecycle**: notes

## Design Decisions

- Fixed `scripts/acceptance-receipt.ts:244` by replacing `sha256(JSON.stringify(canonical))` with `sha256(stableJson(canonical))`. `stableJson` (same file, `:105-110`) recursively sorts object keys before serializing and was already the local pattern for `waiverGrantFingerprint` (`:274`), so this is a zero-new-abstraction fix: the fingerprint becomes a key-order invariant without touching the evidence ledger's storage layer.
- Non-determinism proof (inherited from root-cause-prover's dual-sandbox reproduction, re-verified in this worktree): `canonical.benchmark_evidence` / `canonical.commands` in `normalizedVerificationEvidence` are pass-through references into the parsed `checks/latest.json`. That file's key order depends on which path wrote the winning evidence event — `src/effects/evidence/event-writer.ts:82-92` keeps the producer's object order for payloads under the 8192-byte inline cap, but canonicalizes (recursively sorts) keys once a payload is offloaded to the blob path. Two semantically identical re-materializations of the same verification result can therefore legitimately land on disk with different key orders, and the old `JSON.stringify`-based fingerprint treated that as a semantic change. Guard test 1 (`tests/acceptance-receipt-evidence-fingerprint.test.ts`) reproduces this deterministically with a pure `deepSortKeys` re-encoding — no event-writer or cap-crossing machinery needed to prove the bug.
- Rejected alternatives (per plan, recorded here for the record):
  - Changing the materializer or suppressing the second emit: would break the EPC-05 invariant that `checks/latest.json` is a pure, single-writer projection of the ledger, and would drop `acceptance_receipt: pass` as legitimate evidence.
  - Canonicalizing the inline path too (in `event-writer.ts`): treats the symptom at the storage layer, touches idempotency-key computation and every existing event's on-disk shape; the actual defect is that the comparison side (`acceptance-receipt.ts`) didn't fully normalize before hashing.
- Known side effect (accepted, no CHANGELOG entry needed — internal evidence format only): every previously recorded `AcceptanceReceipt.verification_evidence_sha256` becomes unverifiable after this change, since the hashed bytes change even for evidence that was already valid. Confirmed there is exactly one live receipt in the fleet right now (the `reference-configs-projection` package, which was already stuck failing verification with the old key-order-sensitive hash and needs to re-record regardless) — no other package has a receipt that this invalidates.
- Boundary with the embedded-provenance defect (formerly misattributed in `tasks/todos.md`, now corrected): that defect is `scripts/verify-sprint.sh:547`'s post-acceptance jq overlay embedding a prior verify event's `provenance` into the new run_trace, whose ~557-byte overlay is what pushes some payloads over the 8192-byte inline cap and triggers `tests/evidence-projection-drift.test.ts:265`'s live self-consistency assertion. It is a distinct root cause in a distinct file, explicitly out of scope for this package (`scripts/verify-sprint.sh`, `src/effects/evidence/*`, `src/core/evidence/*`, and `tests/evidence-projection-drift.test.ts` are all listed under this package's EXECUTION_BOUNDARY / Scope as untouched). This package only fixes the comparison-side key-order sensitivity in `scripts/acceptance-receipt.ts`.

- Worktree `base_commit` accounting correction (ship time): this branch was replayed onto `origin/main` with `git rebase origin/main` so its single rewritten `tasks/todos.md` row could land on main's current ledger — content alignment alone could not produce a clean merge, because main still holds that row in its old form and its adjacent edits (flake-row deletion plus two added rows) put both sides' hunks in the same region. Only `tasks/todos.md` conflicted during the replay, resolved as: take this package's rewritten provenance-leak row, keep main's `helper-runner.ts:76` and contract-worktree/rebase rows, drop the flake row, take main's header. Git then dropped the earlier pre-alignment commit as "patch contents already upstream", confirming the resolution reproduced the intended state exactly. `.ai/harness/worktrees/receipt-fingerprint-normalization.json` was updated from `bd2155da` to the post-rebase fork point `8b506da4`; the file is gitignored (`.gitignore:56`), so that is a local-only fix recorded here.

## Deviations From Plan Or Spec

- **Full-suite regression outside Allowed Paths (unresolved, blocks GREEN commit).** The plan's EXECUTION_BOUNDARY restricts production code to the single line at `scripts/acceptance-receipt.ts:244`, and the plan's own sandbox verification only ran the guard test (not the full suite). Running the full `bun test` suite in this worktree after the one-line edit surfaces 2 failures, both stemming from the same mechanical cause: `assets/templates/helpers/acceptance-receipt.ts` is a deployed-template projection of `scripts/acceptance-receipt.ts`, kept in sync by an existing, purpose-built script (`bun run sync:helpers` → `bun scripts/sync-helper-sources.ts --write`) and enforced by a content-drift test (`tests/capability-resolver.test.ts` and a "Workflow helper scripts" contract-projection test). Verified the two files were byte-identical at the RED commit (before this edit) and diverged by exactly this one line afterward — this is a direct, deterministic, zero-judgment consequence of the approved fix, not a pre-existing repo issue. Neither `assets/templates/helpers/` nor `scripts/sync-helper-sources.ts` appears in this contract's `allowed_paths`, and the contract's own Stop Conditions name this exact scenario ("Stop and hand back to the parent if the change would require editing a path outside Allowed Paths"). Left the GREEN fix as an uncommitted working-tree diff pending a parent decision on whether to widen `allowed_paths` to include `assets/templates/helpers/acceptance-receipt.ts` and run `sync:helpers`, or resolve it some other way. `bun run check:type` is clean (exit 0); the only failures are these two drift tests.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `stableJson(canonical)` vs. canonicalizing the ledger's inline path | Use `stableJson` at the comparison site | Zero new abstraction, matches existing local pattern (`waiverGrantFingerprint`), no storage-layer or idempotency-key blast radius |
| Fix the materializer/stop the second emit vs. fix the fingerprint | Fix the fingerprint | Materializer change breaks the EPC-05 single-writer-projection invariant and drops legitimate `acceptance_receipt: pass` evidence |
| Run `bun run sync:helpers` to close the full-suite regression vs. stop and report | Stop and report | Target path is outside this contract's `allowed_paths`; contract's Stop Conditions explicitly cover this case even though the sync itself is mechanical and low-risk |

## Open Questions

- **Decided (coordinator, 2026-07-31).** `assets/templates/helpers/acceptance-receipt.ts` is added to this contract's `allowed_paths` and mirrored via `bun run sync:helpers`, folded into this same package rather than split out: it is a mechanical projection of the one-line fix already approved for `scripts/acceptance-receipt.ts`, so a separate package would carry no independent decision. Widened under the contract's own self-amend mechanism (Workflow Inventory: "update this contract before widening scope").

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
