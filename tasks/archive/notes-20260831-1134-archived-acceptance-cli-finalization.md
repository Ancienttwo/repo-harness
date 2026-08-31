> **Archived**: 2026-08-31 11:34
> **Related Plan**: plans/archive/plan-20260831-0937-archived-acceptance-cli-finalization.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260831-1134

# Implementation Notes: archived-acceptance-cli-finalization

> **Status**: Active
> **Plan**: plans/plan-20260831-0937-archived-acceptance-cli-finalization.md
> **Contract**: tasks/contracts/20260831-0937-archived-acceptance-cli-finalization.contract.md
> **Review**: tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md
> **Last Updated**: 2026-08-31 09:37
> **Lifecycle**: notes

## Design Decisions

- Preserve `AcceptanceReceipt.contract_file` as the canonical live authority identity. The CLI passes its already-validated `--contract` value separately as `authorityContractFile` to the evidence importer, so archive provenance is explicit and no path discovery or semantic fallback is introduced.
- Apply the optional review projection before ledger import, then write a terminal ArchiveProjectionReceipt when the selected contract carries an archive projection. This prevents a successful attested event from preceding a failed projection/reseal and leaves the projected family verifiable at command return.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rewrite the persisted receipt to the archive path | Rejected | It would change canonical acceptance identity and break the archive projection contract. |
| Rediscover an archive path inside the importer | Rejected | It creates a second authority resolver and can select bytes the recording command did not validate. |
| Pass selected authority provenance explicitly | Selected | It preserves both identities at their owning boundaries and fails closed on the exact requested artifact. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix reproduction: `tasks/notes/20260831-0937-archived-acceptance-cli-finalization.pre-fix.log`
- Focused regression: `bun test tests/evidence-attested-import.test.ts`
- Full suite: `bun test --timeout 60000` passed on the rebased R1 baseline.
- Required Checks: all commands listed in root `AGENTS.md` passed on 2026-08-31.
- Acceptance preparation: `repo-harness run verify-sprint --prepare-acceptance` passed with 22/22 contract criteria; run snapshot `run-20260831T111325-18617-20260831-0937-archived-acceptance-cli-finalization.json`.
- Typed acceptance: user-waiver receipt subject `sha256:833ba55950bad8540671d1f3fa787d8edc4e79b693d7d11f6d4f72bd559d77b5`, verification evidence `sha256:8ddf9c6edf71fd8d1aa313d834aecb898bab1b02b147333764147813666d332b`; final `repo-harness run verify-sprint` passed without rerunning frozen verification.
- R1 architecture acceptance: signal `sha256:ca549c9a52f96e25a3713404b33f7f026deeb0e8407471bd08c6f307c7ba6641` accepted against user event `01a055cc-399d-7583-b328-7200cc3ff114`; receipt digest `sha256:b922252dd19c4d8684e22f5c5229bcd91e540adbb6b08eca8bc599bb28bbb585`; deterministic restamp converged to `noop`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
