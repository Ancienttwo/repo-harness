# Plan: solo-operator-acceptance-policy

> **Status**: Archived
> **Created**: 20260721-0540
> **Slug**: solo-operator-acceptance-policy
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: `tests/workflow-state-lib.test.ts` (new fixtures) + `bun test` full suite + `bun run check:hooks` + `bun run check:type`
> **Rollback Surface**: revert the single PR; `workflow_external_acceptance_status()` and `.ai/harness/policy.json`'s `external_acceptance` key restore as one unit; no data migration
> **Task Contract**: `tasks/contracts/20260721-0540-solo-operator-acceptance-policy.contract.md`
> **Task Review**: `tasks/reviews/20260721-0540-solo-operator-acceptance-policy.review.md`
> **Implementation Notes**: `tasks/notes/20260721-0540-solo-operator-acceptance-policy.notes.md`

## Context

`tasks/todos.md` carries a long-standing row ("No supported path for solo operators without both a Claude and a Codex CLI available") that this work-package closes. `workflow_external_acceptance_expected_reviewer()` always demands the opposite vendor from whoever is running the check, so a solo operator holding only one vendor's CLI can never satisfy canonical `external_acceptance` — every HRD row this sprint (HRD-01 through HRD-07) has waived it. This is a real, repeated, user-facing cost: identified concretely during HRD-07's acceptance when Codex's own parallel session hit the same wall and produced friction the user explicitly asked to have root-caused.

## Goal

Add an explicit, non-default, fail-closed `external_acceptance.solo_operator` policy flag that — only when set `true` — lets a same-vendor fresh-context adversarial review satisfy `workflow_external_acceptance_status()`, gated behind a distinct, non-reusable `External Source: solo-operator-adversarial-review` marker plus a fixed acknowledgement literal, while every other existing binding (subject-hash freshness, target revision, P1-blocker gate, rubric v2, benchmark evidence) stays byte-identical and still fail-closed. This is a policy-and-check change only — no automation writes the review file's solo fields; a human/agent must deliberately author them, preserving "not a silent bypass" per the todos row's own requirement.

## Design (frozen from an independent Opus design-review pass this session — see notes for full rationale)

- Change `workflow_external_acceptance_status()` only; do not touch `workflow_external_acceptance_expected_reviewer()` or `_expected_source()` — keeps the cross-vendor path's code path completely untouched when the flag is off/absent/malformed.
- New review-file fields (blank in the template, authored per-subject): `External Source: solo-operator-adversarial-review` (only valid under solo mode; mutually exclusive with `claude-review`/`codex-review`), `Solo Operator Acknowledgement: single-vendor-adversarial-review; cross-vendor unavailable` (fixed literal), `Reviewer Session Identity` / `Implementer Session Identity` (self-attested, non-empty, must differ — explicitly documented as procedural attestation, NOT a cryptographic proof, since the review file lives outside git-hashed evidence and a determined faker can type two different strings).
- `.ai/harness/policy.json` gains a new top-level `external_acceptance: { solo_operator: false, rule: "<full caveat text>" }` object. Default `false`; absent/false/non-boolean-truthy all resolve to the unchanged cross-vendor path.
- Subject-hash freshness, target-revision, P1-blocker, rubric-v2, and benchmark-evidence checks in `workflow_external_acceptance_status()` run unconditionally after the reviewer/source branch, unchanged in both modes.

## Task Breakdown

- [ ] Add `external_acceptance.solo_operator` (default `false`) + `rule` caveat string to `.ai/harness/policy.json`.
- [ ] Implement the solo-mode branch in `assets/hooks/lib/workflow-state.sh`'s `workflow_external_acceptance_status()`; sync to `.ai/hooks/`.
- [ ] Add the three new blank fields to `assets/templates/review.template.md`'s External Acceptance Advice section.
- [ ] Add a boolean-strictness validator for `external_acceptance.solo_operator` in `validateWorkflowPolicy` (`src/effects/state/resolve-effective-state.ts`) so a quoted-string `"true"` in the JSON throws instead of silently activating solo mode.
- [ ] Add the 9-fixture regression/positive test matrix to `tests/workflow-state-lib.test.ts` (see contract Exit Criteria for the exact list).
- [ ] Record the design rationale, the two verified caller-surface facts (single `policy.json`, five real call sites all routing through `_status()`/`_pass()`), and the "not a silent bypass" reasoning in notes.
- [ ] Full verification: targeted tests, `check:type`, `check:hooks`, `check:state-boundaries`, full `bun test`.

## Promotion Gate

- **Merge/PR unit**: this plan is the mergeable execution unit.
- **Rollback surface**: revert the single PR.
- **Verification boundary**: see Verification Boundary above.
- **Review/acceptance boundary**: `tasks/reviews/20260721-0540-solo-operator-acceptance-policy.review.md` must record pass.
- **High-risk surface**: this changes a security/trust-relevant acceptance gate used by every future contract in this repo — treated as risk_boundary, not a checklist row.
- **Why not checklist row**: risk_boundary — this is the acceptance-policy mechanism itself, not a feature built on top of it.
