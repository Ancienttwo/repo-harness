# Experiment 0 Baseline

## Target

Root `SKILL.md` routes to the workflow engine, while the concrete `plans/ -> tasks/contracts/` behavior is implemented by:

- `assets/templates/plan.template.md`
- `assets/templates/contract.template.md`
- `scripts/capture-plan.sh`
- `scripts/new-plan.sh`
- `scripts/plan-to-todo.sh`
- `scripts/ensure-task-workflow.sh`
- `.ai/hooks/prompt-guard.sh`
- `.ai/hooks/lib/workflow-state.sh`

## Baseline Findings

- Draft/Approved/Executing boundaries are already enforced by `capture-plan.sh`, `plan-to-todo.sh`, and `prompt-guard.sh`.
- Generated plans and contracts cross-link the main artifacts, but neither surface has a dedicated pre-edit workflow inventory.
- `plan.template.md` still says the latest non-archived plan is current, which is weaker than the newer `.claude/.active-plan` plus `switch-plan.sh` concurrency model.
- Verification is present but scattered: contracts mention `verify-contract.sh`, while workflow checks and review evidence live in docs/hooks rather than the generated plan/contract surfaces.

## Baseline Score

The baseline passes approval boundary, artifact linkage, and concurrency isolation because recent hook work already added independent Draft plan starts and worktree execution. It fails inventory-first and representative verification on the generated artifact surface.
