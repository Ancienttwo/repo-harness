# Implementation Notes: archive-acceptance-authority

> **Status**: Active
> **Plan**: plans/plan-20260831-0345-archive-acceptance-authority.md
> **Contract**: tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md
> **Review**: tasks/reviews/20260831-0345-archive-acceptance-authority.review.md
> **Last Updated**: 2026-08-31 03:45
> **Lifecycle**: notes

## Design Decisions

- Archive output carries a versioned exact live-to-archive path projection, and
  AcceptanceReceipt reverses only that validated projection before authority
  hashing. The archive writer is the only boundary that knows every
  collision-safe destination; repeating the small map in every artifact keeps
  each file independently verifiable and avoids a second archive-index authority.
- The projection rewrites exact path substrings throughout artifact bodies,
  including `allowed_paths` and `artifacts_exist`. Historical
  `verify-sprint --contract <archive>` can then consume the archived contract
  normally, without heuristic fallback.
- Completed archival writes a host-owned `ArchiveProjectionReceipt` only after
  all repository artifacts have moved successfully. The archive transaction
  snapshots that host file too, so a sealing failure restores both repository
  and host authority. Re-accepting an archived subject preserves the canonical
  live contract/goal identities and atomically rebinds the archive receipt.

## Deviations From Plan Or Spec

- Independent Codex review rejected the first implementation with two P1s:
  an unbound same-family projection could redirect accepted pointers, and
  filename-based archived-contract matching broke on `-v2` collisions. The
  final design adds a host-owned `ArchiveProjectionReceipt` chained to the
  semantic AcceptanceReceipt, binds the complete shared manifest plus exact
  archive file bytes, makes merge seals cover both authorities, and uses the
  projected live contract path instead of filename inference.
- The first full-suite run exposed one deterministic conformance-fixture drift:
  the host closeout call trace did not yet include the two new archive sealing
  calls. The fixture expectation now covers those calls; no runtime behavior
  outside the approved archive path changed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Leave body pointers unchanged and teach every reader to search archives | Reject | Creates multiple path-resolution authorities and leaves human-visible links broken. |
| Strip pointer-bearing lines from the authority fingerprint | Reject | Weakens semantic binding beyond the lifecycle transformation. |
| Exact versioned path projection plus inverse normalization | Use | Preserves all non-path bytes and makes the authorized rewrite explicit. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Passing prepared run: `run-20260831T051510-52449-20260831-0345-archive-acceptance-authority.json`
- Final acceptance: owner `ancienttwo` via typed `user_waiver`; the one
  external Codex review budget had already produced the two blocking findings
  recorded above and correctly refused a second semantic review.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
