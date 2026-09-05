# Implementation Notes: reader-scoped-language

> **Substantive Change SHA256**: `sha256:a04800a2bd20d5f8a062a530690b9574d068a0b585b7b071cbf90a904de202d6`

> **Status**: Active
> **Plan**: plans/plan-20260905-1421-reader-scoped-language.md
> **Contract**: tasks/contracts/20260905-1421-reader-scoped-language.contract.md
> **Review**: tasks/reviews/20260905-1421-reader-scoped-language.review.md
> **Last Updated**: 2026-09-05 14:21
> **Lifecycle**: notes

## Design Decisions

- The init question is one datum with two projections: the host-level reporting sentence in the managed global-rules block, and the repo-level `.ai/harness/policy.json#documentation.language`. The `custom` preset carries a free-text reporting sentence with no enum value, so it maps documents to `en` rather than deriving a language from that text.
- `defaultPolicy` takes the language as a required argument and rejects anything outside `en | zh-CN | follow-user`; `planStandardAdoption` re-validates the merged value so an invalid value already stored in an adopted repo fails closed instead of being silently replaced by the default.
- Root context and `document-generation.md` point at the policy field instead of copying its value, so there is no projection to drift-check.

## Deviations From Plan Or Spec

- Contract `allowed_paths` gained `.ai/harness/policy.json`: this repo is a self-host source checkout, so `init --repo .` is a documented no-op and the new `documentation.language` field has to be hand-added to the repo's own policy the way earlier policy fields landed.
- `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json` were left untouched; their `documentation` block only describes reference-config projection and does not enumerate policy `documentation` fields.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
