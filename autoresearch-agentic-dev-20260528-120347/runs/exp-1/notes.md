# Experiment 1 Candidate

## Hypothesis

Move the workflow inventory into the artifacts agents actually read before implementation: plan templates, captured-plan output, generated contract templates, and the thin planning skill facade.

## Mutation

- Add `## Workflow Inventory` to plan surfaces before `## Approach`.
- Add `## Workflow Inventory` to contract surfaces before `## Allowed Paths`.
- Replace latest-plan-first wording with `.claude/.active-plan` first and latest non-archived as compatibility fallback.
- Add tests that generated plans and contracts contain the inventory.

## Decision

Keep. This improves inventory-first and representative-verification coverage without removing approval, review, or contract gates.

## Verification

- First targeted run found an AGENTS line-budget regression at 263/260 lines; compressed partial wording.
- Targeted rerun passed 68 tests across helper scripts, scaffold parity, output parity, and AGENTS assembly.
- Full `bun test` passed on rerun: 348 pass, 6 skip, 0 fail.
- Required workflow checks passed: deploy SQL order, task sync, strict task workflow, project inspection, and migration dry-run.
