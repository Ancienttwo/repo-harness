# Implementation Notes: refactor-provider-contract

> **Status**: Active
> **Plan**: plans/plan-20260904-0525-refactor-provider-contract.md
> **Contract**: tasks/contracts/20260904-0525-refactor-provider-contract.contract.md
> **Review**: tasks/reviews/20260904-0525-refactor-provider-contract.review.md
> **Last Updated**: 2026-09-04 05:26
> **Lifecycle**: notes

## Design Decisions

- `archctx-contracts@0.5.2` remains the sole semantic authority: repo-harness calls its request, scan, recommendation, and resolution-evidence invariants and only adds transport-envelope and identity binding checks.
- Scan and verify keep separate required-feature sets, but both require exact 0.5.2 because public 0.5.1 omitted `koffi` and is not an installable authority.
- The architecture provider exports one package-local JSON process primitive so refactor calls inherit exact package resolution, compatible Node selection, timeout, and JSON parsing without a second runtime path.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Copy architecture provider execution code | Rejected | Would create two authorities for package and Node resolution. |
| Flatten four refactor features into one gate | Rejected | Scan and verify are distinct protocol capabilities even though 0.5.2 currently supplies both. |
| Infer malformed or absent provider fields locally | Rejected | Violates the upstream authority boundary; invalid states fail closed. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Packaged readback: `docs/verification/axr5-archctx-clean-room-readback.json`

> **Substantive Change SHA256**: `sha256:4beb947927ece5163f6f8202c38958c20af83150c7e749a98320304c359faec6`
> **Substantive Change SHA256**: `sha256:0a1b37f4580148e634d2d76d85630bf6373273622adb890cba15cf49d2d37c57`
> **Substantive Change SHA256**: `sha256:ab91602eb00ab8b781855691ba906926892e030e18d705b266cc1845605e4009`
> **Substantive Change SHA256**: `sha256:e7ecd70eee843c43a2bfdff9ef826faee3eb701fe8f9aa9c20261c3ba913d2e4`
> **Substantive Change SHA256**: `sha256:69bf3da355aca39398623fb0a59b0738ff59e69e813d364cca223eb4031845da`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
