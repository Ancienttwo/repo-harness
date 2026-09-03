# Implementation Notes: acceptance-redaction-idempotence

> **Status**: Active
> **Plan**: plans/plan-20260904-0517-acceptance-redaction-idempotence.md
> **Contract**: tasks/contracts/20260904-0517-acceptance-redaction-idempotence.contract.md
> **Review**: tasks/reviews/20260904-0517-acceptance-redaction-idempotence.review.md
> **Last Updated**: 2026-09-04 06:33
> **Lifecycle**: notes

> **Substantive Change SHA256**: `sha256:d1596b120fefc5fc2e79b3770570eb3089ddd2df29ba53d8fceb0ca79bcb41fe`

## Design Decisions

- Keep AcceptanceReceipt's full `commands` fingerprint and the evidence redactor unchanged. The regression is in `verify-sprint` finalization re-emitting a materialized projection.
- Resolve `.run_file` only under `.ai/harness/runs/*.json`, reject traversal/symlinks, and require its subject, contract, Change Assessment, lifecycle pointer, and passing command set to match the receipt-bound projection.
- Overlay acceptance onto the immutable raw snapshot, then reverify the receipt after materialization. A matching already-finalized projection returns without another event.

## Deviations From Plan Or Spec

- The initial candidate fix normalized redaction markers inside AcceptanceReceipt canonicalization. Root-cause proof falsified that direction because it would hide a real command-identity change; scope moved to the finalization producer.
- The first acceptance preflight needed a worktree-local CodeGraph index before ArchContext could prove the current flow graph.
- While publishing, `origin/main` advanced across the reviewed `helper-scripts` and architecture surfaces. The branch was rebased, and the user's task-wide approval was bound as `user.approval-20260904-full-task` to the exact ArchContext signal `sha256:bd58dfc27fa5218745540127764ddf5ef9a77aadfbef538c36b92ce5ae0171d6`. A later upstream merge supplied a newer canonical projection, so every generated architecture-doc delta was dropped from this branch rather than carrying a second authority.
- After that rebase, the globally installed `repo-harness` predated `origin/main`'s new workflow schema and falsely reported the new `cutover-closure.ts` helper and schema-v2 sprint tables as missing. Exact-subject verification now invokes the branch-local CLI (`bun src/cli/index.ts run check-task-workflow --strict`), which is the source-bound authority under review.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Normalize or omit command hashes in AcceptanceReceipt | Reject | Would weaken semantic evidence identity and hide real command changes. |
| Exempt embedded hashes in global redaction | Reject | Broadens the security exemption beyond this producer bug. |
| Replay the immutable prepared run snapshot | Use | Preserves both existing authorities and makes the redaction pass occur exactly once per emitted event. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix failure: `.ai/harness/runs/pre-fix-acceptance-redaction-idempotence.log`
- Focused verification: `bun test tests/evidence-projection-drift.test.ts`; affected finalizer fixture in `tests/helper-scripts.test.ts`.
- Full repository verification: `bun test --timeout 60000` passed with only platform-specific skips and 0 failures on the implementation worktree.
- Required checks passed: deploy SQL order, architecture sync, task sync, strict workflow, project-state inspection, init dry-run, helper-source mirror sync, and `git diff --check`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
