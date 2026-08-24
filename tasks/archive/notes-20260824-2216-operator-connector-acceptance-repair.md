> **Archived**: 2026-08-24 22:16
> **Related Plan**: plans/archive/plan-20260824-1757-operator-connector-acceptance-repair.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260824-2216

# Implementation Notes: operator-connector-acceptance-repair

> **Status**: Active
> **Plan**: plans/plan-20260824-1757-operator-connector-acceptance-repair.md
> **Contract**: tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md
> **Review**: tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md
> **Last Updated**: 2026-08-24 21:31
> **Lifecycle**: notes

## Design Decisions

- Treat `repoHarnessRepoIdFor(canonicalPath)` as the single registry identity authority. Persisted IDs that do not match are rejected; the repair does not migrate or preserve arbitrary historical IDs.
- Treat the Operator transport as a browser security boundary. Snapshot, repository and card DTOs are constructed through explicit field allowlists so future Fleet fields do not cross by default.
- Reuse one bracketed authority for emitted URL, Host/Origin checks and request URL parsing so IPv4 and IPv6 cannot drift.
- A drawer may display only an exact task key from the current successful snapshot. Removed or revised tasks close instead of retaining old facts.
- Runtime payload validation is structural transport validation only; it rejects malformed nested data and does not synthesize domain values.
- Tracked current-status redaction is fixed in the owning generator and packaged twin. Installed-package evidence must boot the real server and traverse health, UI assets and Fleet API.
- The browser decoder returns a newly constructed frozen graph at every DTO level. Unknown fields are dropped by construction; `registry_revision`/source digests and publication Git OIDs use the same closed formats as their server authorities.
- The 1101px layout breakpoint also owns drawer accessibility semantics. Wide layout is a non-modal `complementary` region with no focus capture or Tab trap; narrow layout remains a modal dialog with focus containment and restoration.
- Workflow marker reads preserve literal backslashes and spaces with `IFS= read -r`. POSIX absolute, drive-letter and UNC paths are classified before resolution, then rendered as repo-relative or opaque plan/sprint/owner references.

## Deviations From Plan Or Spec

- The backend worker was blocked from changing persisted registry authorization identity. The parent completed that already-approved boundary directly: strict reads reject non-derived IDs and all writer paths re-derive IDs before persistence.
- The server keeps exact textual Host/Origin comparison. Only URL-base construction changed to the already-authoritative bracketed authority; an absolute-form request URL with another origin is rejected.
- The full repository suite exposed one real-registry Fleet fixture that still persisted an arbitrary repository ID. The contract was widened to that single test file, and the fixture now derives the same canonical ID as production authority; no product scope changed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Sanitize arbitrary registry IDs only at render time | Rejected | It leaves invalid persisted authority active in Fleet and other consumers. |
| Delete a list of sensitive DTO fields | Rejected | A denylist reopens whenever upstream adds a field. |
| Accept legacy IDs during a migration window | Rejected | No approved compatibility contract exists; fail-closed behavior is required. |
| Preserve selected task object across a successful refresh | Rejected | It mixes facts from two snapshot revisions. |
| Reject every unknown browser DTO key | Rejected | Reconstructing allowlisted output closes the transport boundary without coupling the browser to harmless producer additions. |
| Keep modal ARIA semantics for the in-flow desktop column | Rejected | Visual layout and assistive interaction would describe different UI models. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- External acceptance findings: user-supplied GitHub Connector acceptance transcript (the findings are restated in the tracked plan/contract).
- Pre-fix regression: `.ai/harness/failures/operator-connector-acceptance-repair-pre-fix.log` records `tests/unit/operator-fleet-snapshot.test.ts` failing on `9eda600b3163ae44e072391609a39c6dbef2815e` with `PRE_FIX_EXIT=1`.
- Focused integrated suite: 170 passed / 0 failed across registry, DTO, IPv6 server, frontend UI/interactions and helper scripts.
- Fleet regression discovered by the first full-suite run: `tests/effects/fleet-board.test.ts` now passes 8 / 8 with its real registry fixture bound to the derived ID contract.
- Full repository suite after that correction: 3013 passed / 2 platform skips / 0 failed across 237 files, with 22594 assertions.
- Root gates passed: typecheck, Operator web build, deploy SQL order, architecture sync, task sync, strict task workflow, project-state inspection, and source-checkout init dry-run.
- The first committed-authority acceptance preparation passed 31 of 32 contract checks; automatic architecture materialization restamped the tracked projection manifest before `check-task-sync`, so the status projection was refreshed and the gate was rerun with synchronized task evidence.
- The next preparation proved every deterministic check but exposed that the linked worktree's immutable diff base is `origin/main`, so allowed-path validation correctly evaluates the complete PR #218 surface rather than only the repair commit. The contract now enumerates the already-reviewed pre-repair Operator files and archived workflow evidence needed for exact-head PR acceptance; no new implementation path was added.
- Packaged runtime: `bash scripts/check-tarball-install-smoke.sh` booted the clean-installed tarball, read health/HTML/asset/Fleet API, and observed clean SIGTERM exit.
- Browser layout readback: at `1440x1000`, computed boxes were rail `248px`, workspace `832px`, drawer `360px` with `position: sticky` and hidden scrim; at `1000x800`, drawer was `position: fixed`, `360px`, with a visible full-viewport scrim. The real dialog retained focus semantics and current task facts.
- Connector follow-up regressions first failed on retained nested fields, wide-screen modal semantics, and Windows drive path disclosure. After repair, Operator interaction tests pass 9/9, targeted path/sprint tests pass 3/3, typecheck passes, the Operator web production build succeeds, and the loopback Operator server suite passes 5/5 outside the network-restricted sandbox.
- Follow-up acceptance preparation proved 31/32 criteria, including the 3013-test full suite and packaged runtime smoke. The sole failure was the expected automatic architecture projection restamp preceding `check-task-sync`; synchronized task evidence was refreshed before the bounded rerun.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
