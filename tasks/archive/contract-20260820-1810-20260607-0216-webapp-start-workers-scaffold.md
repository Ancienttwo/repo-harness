> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260607-0216-webapp-start-workers-scaffold.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: webapp-start-workers-scaffold

> **Status**: Fulfilled
> **Plan**: plans/plan-20260607-0216-webapp-start-workers-scaffold.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-07 02:20
> **Review File**: `tasks/reviews/20260607-0216-webapp-start-workers-scaffold.review.md`
> **Notes File**: `tasks/notes/20260607-0216-webapp-start-workers-scaffold.notes.md`

## Goal

Update repo-harness scaffold guidance so SEO/SSR React webapps use a single TanStack Start + Vite + Cloudflare Workers frontend deployment by default, while client-only Vite and legacy marketing/static surfaces remain explicit opt-in or rollback choices.

## Scope

- In scope:
  - Plan B/C/D/E stack-family metadata and generated project-structure guidance.
  - Initializer question-pack metadata for the webapp rendering/deployment model.
  - Template assembly variables and Cloudflare/docs output that distinguish Workers SSR from Pages/static deploy.
  - Regression tests proving one `apps/web` frontend, `/` SSR/public route, `/app` client-only boundary, and no default two-frontend scaffold.
- Out of scope:
  - Implementing or migrating Salesko.
  - Adding a new A-K plan code.
  - Running real Cloudflare deploys or adding provider/auth secrets.
  - Retiring existing legacy marketing docs except where generated-default wording must be corrected.

## Workflow Inventory

- Source plan: `plans/plan-20260607-0216-webapp-start-workers-scaffold.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260607-0216-webapp-start-workers-scaffold.review.md`
- Notes file: `tasks/notes/20260607-0216-webapp-start-workers-scaffold.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - README.md
  - README.zh-CN.md
  - SKILL.md
  - references/tech-stacks.md
  - assets/plan-map.json
  - assets/initializer-question-pack.v4.json
  - assets/initializer-question-pack.v4.schema.json
  - assets/project-structures/
  - assets/templates/tech-stack.template.md
  - assets/partials/
  - assets/partials-agents/
  - assets/reference-configs/release-deploy.md
  - docs/reference-configs/release-deploy.md
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/current.md
  - tasks/contracts/20260607-0216-webapp-start-workers-scaffold.contract.md
  - tasks/reviews/20260607-0216-webapp-start-workers-scaffold.review.md
  - tasks/notes/20260607-0216-webapp-start-workers-scaffold.notes.md
  - .ai/context/capabilities.json
  - scripts/assemble-template.ts
  - scripts/initializer-question-pack.ts
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/project-structures/tanstack-start-workers.txt
    - tests/unit/webapp-start-workers-scaffold.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260607-0216-webapp-start-workers-scaffold.notes.md
  tests_pass:
    - path: tests/unit/webapp-start-workers-scaffold.test.ts
  commands_succeed:
    - bun test tests/plan-map-consistency.test.ts tests/initializer-question-pack.test.ts tests/output-parity.test.ts tests/scaffold-parity.test.ts tests/unit/webapp-start-workers-scaffold.test.ts
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
