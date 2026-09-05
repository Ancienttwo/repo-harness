# Verification guidance output parity repair

> **Status**: Complete
> **Substantive Change SHA256**: `sha256:5d836a476a73740255ec3aa0efe8cfbba4461387b1053fcfd36121303fae21f6`

## Scope and boundary

Base: `0d6bc102`. Owned source: `assets/partials-agents/06-quality-safety.partial.md`;
regression: `tests/output-parity.test.ts`; durable prevention rule: `tasks/lessons.md`.
P1: assembleTemplate projects host partials into CLAUDE/AGENTS; output-parity owns
cross-target commands and total line budgets.
P2: `6c19234e` changed the intended acceptance entrypoint and added three output
lines, but verified host assembly without the output-parity consumer.
P3: preserve prepare-acceptance/finalize semantics and the 260-line budget;
consolidate related verification prose and update the stale command assertion.
No runtime classifier, helper, deadline fixture or PR #318 branch change.
At 10x guidance growth, root line budget remains the limiting boundary; detail
belongs in reference docs rather than a raised cap.

## Root Cause Evidence

- root_cause: verification-scope guidance changed the generated command contract and exceeded the AGENTS line budget while output-parity retained the old assertion.
- repro: `bun test tests/output-parity.test.ts` on isolated `0d6bc102`: 27 pass, 2 fail; missing old verify-contract command, 263 lines versus 260 limit.
- regression_guard: existing line-budget check remains 260; command contract now checks both host outputs for prepare-acceptance plus finalize and rejects the old repeated verify-contract instruction.
- pre_fix_failure_artifact: local command output identified tests/output-parity.test.ts:233 and :264; after repair all 58 assembly/host-assembly/parity tests passed (228 assertions).

## Verification

- `bun test tests/output-parity.test.ts tests/agents-assembly.test.ts tests/assembly.test.ts`: 58 pass, 0 fail, 228 assertions.
- Generated output: AGENTS Plan C returns to 260 lines; source preserves explicit full-suite triggers, stronger CI requirements, delta evidence, review/notes and finalization rules.
- Full suite not needed locally: only template prose and its asserted output changed; the three named generated-output consumers cover the affected boundary. Required CI remains in force.
- Six root integrity checks passed: deploy SQL, architecture sync (blocking 0), task-sync (lite admission), strict task workflow, project-state inspection, init dry-run. Helper/reference-config projections also passed.
- Quick final diff review passed: both hosts assert the canonical acceptance/finalization commands; the original line limit remains unchanged; verification requirements are preserved in seven consolidated bullets. No helper/runtime or unrelated branch edit.
- No full suite rerun locally; this is a bounded correction to the earlier verification-guidance baseline. Remote CI and PR merge status are not inferred from these focused passes.
