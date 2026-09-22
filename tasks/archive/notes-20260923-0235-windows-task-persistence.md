> **Archived**: 2026-09-23 02:35
> **Related Plan**: plans/archive/plan-20260923-0031-windows-task-persistence.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260923-0235
> **Archive Projection V1**: `plans/plan-20260923-0031-windows-task-persistence.md` => `plans/archive/plan-20260923-0031-windows-task-persistence.md`
> **Archive Projection V1**: `tasks/notes/20260923-0031-windows-task-persistence.notes.md` => `tasks/archive/notes-20260923-0235-windows-task-persistence.md`
> **Archive Projection V1**: `tasks/contracts/20260923-0031-windows-task-persistence.contract.md` => `tasks/archive/contract-20260923-0235-windows-task-persistence.md`
> **Archive Projection V1**: `tasks/reviews/20260923-0031-windows-task-persistence.review.md` => `tasks/archive/review-20260923-0235-windows-task-persistence.md`

# Implementation Notes: windows-task-persistence

> **Status**: Active
> **Plan**: plans/archive/plan-20260923-0031-windows-task-persistence.md
> **Contract**: tasks/archive/contract-20260923-0235-windows-task-persistence.md
> **Review**: tasks/archive/review-20260923-0235-windows-task-persistence.md
> **Last Updated**: 2026-09-23 00:31
> **Lifecycle**: notes

> **Substantive Change SHA256**: `sha256:f8e7202eaf99f9fb1b7c18c4c5e7a3c0d422bae824d0fb6dc5533ab4e6348792`

## Design Decisions

- Repair the four observed authority stores through the existing low-level durable-write module; retain the already compliant Inbox/checkpoint boundaries. Principal retains its original writable descriptor through fsync.
- Source verification is bound to271f4d31; independent review remains on the policy-selected origin/main subject.
- Upstream PR443 includes exact bigint identities (`6167e895`) and owned prepared-receipt rollback cleanup (`271f4d31`). It was integrated into this candidate before final native verification; the persistence package's comparison and rollback base now retain that upstream correction. Original pre-fix logs remain evidence of their recorded older source, not current acceptance.
- Real native Windows evidence is mandatory; simulated syscall restrictions only establish the deterministic local regression.

- ...

## Deviations From Plan Or Spec

- Native run 35755604887 reached the real reply lifecycle after the persistence fix, exposing four existing fixture failures: the staging spy appended a POSIX separator on Windows, and scan exhaustion raced the independent deadline. The approved test-file boundary covers both corrections. Native filesystem writes, authorization refusal and exact-parent recovery assertions remain intact; only the synchronous scan/byte-budget assertion fixes its clock, restored before MCP recovery.
- Run 35756978653 confirmed those corrected cases pass on Windows. It exposed another scan/byte-budget assertion with the same host-speed race and three process-recovery tests cut off by their explicit 20-second outer limit. The sibling assertion now fixes the clock only around the query; process tests retain every exit/storage/recovery assertion with a 60-second outer limit, within the matrix's existing 180-second default. Ten migration inventory refusals belong to the still-active upstream PR443 contract and are returned there for diagnosis before another native run.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

- Native CI runs on the Draft candidate before consuming semantic review; platform corrections must land before that single review. The first canonical preparation refused missing CodeGraph proof before executing contract checks, so its failure is retained rather than counted as verification.

## Open Questions

- None.

## Evidence Links

- Remaining fixture correction relative to `ec1b2e74`: local reply suite passed 33/33 with 144 assertions in 64.73 seconds. Retained native failure log: `.ai/harness/runs/windows-task-persistence/native-fixture-correction.log`.

> **Substantive Change SHA256**: `sha256:a801bfabc3019c8666477d4e854e82da7f676033ba3570e9798ebb849ad8e53e`

- Native-fixture correction relative to `eb8195e3`: local protected reply suite passed 33/33 with 144 assertions; typecheck passed. The complete package digest above remains bound to `271f4d31`.

> **Substantive Change SHA256**: `sha256:5af80f796ff4b62a301c007a1156d427ea4e8228833b58f3f521e045a7f33a2e`

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

- The one codex-plugin review of subject `c34055e0e40205783e955c94f78760c72a39d510ad30bf8eb1b7ef8e0309d7ff` returned one P2 in upstream migration rollback. Its real-filesystem regression reproduced the failure, and PR443 correction `271f4d31` was integrated before acceptance. No second review is permitted; final owner acceptance must use the corrected frozen subject. The earlier 16/16 canonical run and native source `e3d86d48` are historical evidence, not acceptance of this correction.
