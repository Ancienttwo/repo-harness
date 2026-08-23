# Implementation Notes: local-human-control-board-v1

> **Status**: Active
> **Plan**: plans/plan-20260824-0103-local-human-control-board-v1.md
> **Contract**: tasks/contracts/20260824-0103-local-human-control-board-v1.contract.md
> **Review**: tasks/reviews/20260824-0103-local-human-control-board-v1.review.md
> **Last Updated**: 2026-08-24 01:03
> **Lifecycle**: notes

## Design Decisions

- Treat `FleetBoardSnapshotV1` as the only domain authority. The operator DTO is
  a deterministic redaction projection that removes `repo_root` and raw causes;
  its digest field is named `source_snapshot_sha256` because it identifies the
  canonical source snapshot, not the redacted browser document.
- Keep the HTTP surface in `src/effects/operator/` and bind only to explicit
  loopback hosts. It imports `collectFleetBoard()` in-process instead of spawning
  the CLI, so typed errors, concurrency limits, and deadline ownership stay with
  the existing Fleet effect. Static lookup validates both lexical and real paths,
  so an intermediate symlink cannot escape the packaged asset root.
- Keep refresh single-flight in both server and browser. The real browser pass
  found that using `loading` as the request lock deadlocked the initial fetch;
  `App.tsx` now owns the lock with a ref while `loading` remains presentation
  state.
- Package only Latin subsets of the three reference fonts. The dashboard copy
  is English/ASCII, and the narrower imports preserve the confirmed typography
  while avoiding unrelated Greek, Cyrillic, Vietnamese, and Latin Extended
  assets in every npm tarball.
- Use one test-only `happy-dom` dependency for reproducible modal focus,
  keyboard, column-selection, and Clipboard checks. Production still adds no DOM
  abstraction or UI toolkit; the unused `lucide-react` dependency was removed.

## Deviations From Plan Or Spec

- Focused server tests require a real ephemeral loopback socket. The managed
  sandbox reports `EADDRINUSE` even for port 0; the same tests pass outside that
  network sandbox. This is an environment constraint, not a product fallback.
- The first final contract run exposed one stale package-script assertion in
  `tests/unit/hook-entry-single-file-bundle.test.ts`: it still required the old
  hook-only `prepack` command. The assertion now protects stdout redirection for
  both required builds and exactly matches the shipped hook-plus-operator command.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Return raw Fleet JSON | Rejected | Absolute repository roots are not safe at the browser boundary. |
| Spawn `fleet board --json` | Rejected | It duplicates process/error lifecycle and weakens type ownership. |
| Add SSE, cache, or daemon state | Deferred | Manual refresh is sufficient for v1; provider observation is already bounded. |
| Reuse the private reference at runtime | Rejected | The cited commit is design evidence, not a package dependency or authority. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Visual authority: `Ancienttwo/repo-harness-page@ffe3ff1b14284e5712b0b0f82534e33c4fabfe6b`
- Browser acceptance: real localhost runtime at 1440x1000 and 390x844;
  zero horizontal overflow, 40px minimum interactive targets, authoritative
  five-column desktop board, one-column mobile selector, and responsive drawer.
  Final interaction readback confirmed a labelled modal dialog, Close initial
  focus, Tab loop, Escape close with task-card focus restoration, a 64-character
  identifier, Clipboard success/live status, one mobile `aria-pressed` column,
  and zero mobile overflow.
- Independent gatekeeper: PASS after two review rounds; the first round found
  and the second confirmed closure of unused dependency, modal focus, selector
  semantics, full identifier copy, and static symlink containment findings.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
