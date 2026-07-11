# Implementation Notes: bdd2-eval-foundation

> **Status**: Active
> **Plan**: plans/plan-20260712-0450-bdd2-eval-foundation.md
> **Contract**: tasks/contracts/20260712-0450-bdd2-eval-foundation.contract.md
> **Review**: tasks/reviews/20260712-0450-bdd2-eval-foundation.review.md
> **Last Updated**: 2026-07-12 04:52
> **Lifecycle**: notes

## Design Decisions

- The existing `run-skill-evals.ts` remains unchanged. It measures skill installation
  and workspace mutation, while BDD² S/A measure text proposals and audits. Sharing
  them would create a false abstraction without a common semantic contract.
- `evaluation-manifest.json` is the only committed machine authority. Prompt, task,
  truth, and rubric bytes are pinned by SHA-256; unknown keys, path escapes,
  symlinks, duplicate IDs, hash drift, and truth fields in agent task sets fail closed.
- `foundation` is intentionally non-executable. A later experiment row must expand
  each held-out arm to the preregistered 12 tasks, freeze agent model/sampling/command
  profiles, set `sealed_at`, commit the authority, and run from a clean Git HEAD.
- The runner records the clean source commit and manifest hash at execution time.
  This avoids an impossible self-referential commit hash inside the commit being
  pinned while still producing an immutable run coordinate.
- Model and sampling authority lives only in the sealed agent profile; `freeze` does
  not duplicate it. Blind packets exclude condition, repetition, prompt, agent,
  model, sampling, truth, and private coordinate fields.
- Browser and ImageGen remain first-class later experiments in Sprint row BDD2-E-04.
  They were not deleted or bundled into the S/A foundation.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Refit `run-skill-evals.ts` into a generic core | Rejected | Its workspace/skill semantics do not match proposal/audit treatments; refactoring would risk the existing benchmark for no proven reuse. |
| Permit real runs from the foundation manifest | Rejected | Model, full held-out set, commit, and final seal are not frozen yet; accepting a run would create non-authoritative evidence. |
| Store truth beside agent tasks | Rejected | A renderer bug could leak seeded answers; exact task schemas and separate truth files make the boundary testable. |
| Put model in both `freeze` and agent profile | Rejected | Dual authority can drift; the sealed agent profile owns model, sampling, command, and response source. |
| Create product skill/CLI now | Rejected | The approved PRD authorizes Phase E only and explicitly forbids Phase P surface before a recorded pass decision. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Full suite: `bun test` — 1146 passed, 1 platform skip, 0 failed.
- Focused suite: `bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts` — 10 passed.
- Typecheck: `bun run check:type` — passed.
- Foundation validation: `bun scripts/run-bdd2-evals.ts validate` — valid.
- Dry-run plan: `bun scripts/run-bdd2-evals.ts plan --experiment S --partition development --dry-run` — deterministic coordinates emitted.
- Required checks: deploy SQL, architecture sync, task sync, inspector, and direct migration dry-run passed.
- Known baseline blocker: strict workflow reaches only the pre-existing brain mirror drift
  (`docs/reference-configs/harness-overview.md` -> `brain/repo-harness/references/harness-overview.md`);
  the same failure reproduces on `origin/main` and is outside this contract.
- Advisory environment gaps: Codex Waza `health`/`check` installed-copy paths and the
  worktree-local CodeGraph index are absent; focused/full tests and source checks are
  unaffected, and no user-level environment mutation was authorized by this contract.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
