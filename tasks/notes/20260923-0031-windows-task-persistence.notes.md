# Implementation Notes: windows-task-persistence

> **Status**: Active
> **Plan**: plans/plan-20260923-0031-windows-task-persistence.md
> **Contract**: tasks/contracts/20260923-0031-windows-task-persistence.contract.md
> **Review**: tasks/reviews/20260923-0031-windows-task-persistence.review.md
> **Last Updated**: 2026-09-23 00:31
> **Lifecycle**: notes

> **Substantive Change SHA256**: `sha256:1aa0e7f51ac52f746c6e01df181f4bc8317d093ad6104b7a0a56594920a5ef98`

## Design Decisions

- Repair the four observed authority stores through the existing low-level durable-write module; retain the already compliant Inbox/checkpoint boundaries. Principal retains its original writable descriptor through fsync.
- Source verification is bound to49c5f9dc; independent review remains on the policy-selected origin/main subject.
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

- Native-fixture correction relative to `eb8195e3`: local protected reply suite passed 33/33 with 144 assertions; typecheck passed. The complete package digest above remains bound to `49c5f9dc`.

> **Substantive Change SHA256**: `sha256:5af80f796ff4b62a301c007a1156d427ea4e8228833b58f3f521e045a7f33a2e`

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
