# Autoresearch Changelog

- Skill: `/Users/ancienttwo/Projects/agentic-dev/SKILL.md`
- Objective: Improve the agentic-dev plans-to-contracts workflow by making plan/contract state inventory explicit before execution without weakening approval, scope, or verification gates.
- Runs per experiment: 4
- Budget cap: 2
- Created at: 2026-05-28T04:03:47.199922+00:00

## Experiment 0 - baseline

**Score:** 14/20 (70.0%)
**Change:** No mutation. Baseline measurement of existing plan, contract, capture, projection, and hook surfaces.
**Reasoning:** The current workflow preserves approval and isolation, but generated artifacts do not force a concrete state inventory before execution and do not consolidate workflow verification evidence.
**Result:** Useful baseline: 14/20. Strong gates already exist; the pressure point is missing explicit inventory and representative verification on the files agents actually read before implementation.
**Failing outputs:** Agents can rely on generic plan prose and contract placeholders instead of naming active plan, contract, review, notes, todo, checks, allowed paths, and workflow checks before editing.

## Experiment 1 - keep

**Score:** 20/20 (100.0%)
**Change:** Added explicit workflow inventory to generated plans, captured plans, contracts, fallback templates, planning facade, docs, and assembly guidance; retained approval and contract gates.
**Reasoning:** The article/autoresearch lesson is to make the target function representative and keep useful instructions near the action point. The smallest coherent change is to place inventory and verification ownership in plans/contracts, not to remove gates or add a new abstraction.
**Result:** Targeted regression passed: bun test tests/helper-scripts.test.ts tests/scaffold-parity.test.ts tests/output-parity.test.ts tests/agents-assembly.test.ts. One line-budget failure appeared on the first run and was fixed by compressing AGENTS wording.
**Failing outputs:** No remaining scored failures for this mutation.
