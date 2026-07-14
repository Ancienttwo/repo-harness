# Task Review: codex-delegation-session-auth

> **Status**: Complete
> **Plan**: plans/plan-20260714-2052-codex-delegation-session-auth.md
> **Contract**: tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md
> **Notes File**: tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-15 01:11
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:8f4dbfff086a6aea1f5ff0431346d327651fd49f3431984f6a66bc8aec291133
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: aef22480ad5202dfbe19677468407df30626c554

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: assets/hooks/codex-delegation-advisor.sh, assets/hooks/session-start-context.sh, .ai/hooks/* (generated projection), .ai/harness/policy.json, src/cli/hook/runtime.ts, scripts/lib/project-init-lib.sh, scripts/ensure-task-workflow.sh, assets/templates/helpers/ensure-task-workflow.sh, docs/reference-configs/hook-operations.md, assets/reference-configs/hook-operations.md, README.md, docs/architecture/modules/runtime-harness/hook-adapters.md, tests/cli/hook.test.ts, tests/hook-contracts.test.ts, tests/hook-runtime.test.ts
- Actual files changed: matches intended set plus contract/plan/notes/todos workflow artifacts; every changed path traced to contract `allowed_paths` by the acceptance gate (no out-of-scope edits)
- Commands passed: current-main `bun run check:hooks` (25 files OK), `bun run check:helpers` (49 helpers OK), `bun run check:type`, focused `bun test` (183 pass / 0 fail), strict contract verification (`total=10 failed=0 status=Fulfilled`), task sync, strict task workflow, deploy SQL ordering, architecture sync, project-state inspection, adoption dry-run, and the code-frozen full `check:ci` including packaged tarball smoke. GitHub CI remains the merge-time remote gate.
- External acceptance: unavailable and skipped by explicit repository-owner direction in the current branch-consolidation thread; this is not represented as canonical external PASS.
- Residual risks: on hosts without `jq`, the SessionStart standing block degrades to absent (pre-existing guarded soft-dependency pattern in session-start-context.sh; recorded as known behavior, not a defect)
- Reviewer action required: none — diff, probes, and checks reviewed by the acceptance gate
- Rollback: revert the work-package commits on `codex/codex-delegation-session-auth` (rebased base `aef22480`); no data migration, no install-surface change

## Mode Evidence

- Selected route: capture-plan (Approved work-package) -> contract worktree -> delegated worker slices 1+2 -> independent acceptance gate
- P1/P2/P3 evidence: plan `## Root cause being fixed` and contract `## Why` (advisor auto-branch trace at codex-delegation-advisor.sh lines 242-249 pre-change; consumer coupling verified: stop-orchestrator keys on `state.explicit === true` only, subagent-start-context tolerates missing delegation state)
- Root cause or plan evidence: standing authorization was session-level state re-asserted per message with contract-continuation authority attached; fix relocates it to SessionStart and makes UserPromptSubmit explicit-trigger-only in both modes

## Verification Evidence

- Waza `/check` run: current-main integration reviewed directly in this session; owner-directed Claude skip is recorded separately from the code verdict.
- Commands run: `bun run check:hooks`, `bun run check:helpers`, `bun run check:type`, `bun test tests/cli/hook.test.ts tests/hook-contracts.test.ts tests/hook-runtime.test.ts tests/workflow-contract.test.ts tests/contract-run.test.ts --max-concurrency 4` (`183 pass / 0 fail`), direct strict contract verification (`total=10 failed=0 status=Fulfilled`), `bash scripts/check-task-sync.sh`, strict `check-task-workflow`, deploy SQL ordering, architecture sync, project-state inspection, adoption dry-run, and `BUN_TEST_MAX_CONCURRENCY=1 BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_ISOLATE_FILES=1 bun run check:ci` (`[ci] OK`, packaged tarball smoke OK).
- Manual checks: isolated-HOME runtime probes — plain prompt under repo-policy auto and global-config auto: advisor exit 0, empty stdout, no `.ai/harness/delegation/` created; mechanism question containing trigger phrase: silent; explicit trigger: injects with `explicit=true, mode="explicit", stop_fallback=true` and new current-turn-authority framing; full CLI dispatcher SessionStart on idle codex+auto repo emits the 10-line `# Delegation Standing Authorization` block (previously empty via budget drop); override matrix global-vs-repo in both directions plus invalid-global-JSON fallback; HOOK_HOST=claude silent on all paths
- Supporting artifacts: regression test in tests/cli/hook.test.ts exercising the dispatcher path (self-checked: fails with the fix reverted, passes with it restored); EXECUTION_BOUNDARY first sentence verified byte-identical across parity surfaces
- Implementation notes reviewed: yes (tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md, slices 1 and 2)
- Run snapshot: not applicable (no contract-run delegated execution; work performed by session-managed worker in the contract worktree)

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: Claude
> **External Source**: owner-directed skip after provider session limit
> **External Started**: 2026-07-14T22:15:00+0800
> **External Completed**: 2026-07-15T00:54:00+0800
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:8f4dbfff086a6aea1f5ff0431346d327651fd49f3431984f6a66bc8aec291133
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: aef22480ad5202dfbe19677468407df30626c554
> **Benchmark Evidence SHA256**: not-applicable

- P1 blockers: none found in the current-main integration review.
- P2 advisories: jq-absent hosts silently lose the standing block (pre-existing soft-degrade convention, documented).
- Acceptance checklist: owner-directed skip — current-main code, projections, focused tests, and workflow evidence are verified locally; this records authority without claiming canonical external acceptance passed.

## Behavior Diff Notes

- Codex + effective delegation.mode=auto: standing authorization now injected once at SessionStart (survives the session-context budget via the new actionable heading in runtime.ts); plain prompts no longer receive `[repo-harness:delegation]` context and no longer write delegation state.
- Codex explicit triggers (`/delegate`, `/parallel`, imperative spawn phrasing, Chinese equivalents): unchanged injection mechanics; parent-facing text now frames the current user turn as execution authority and the active contract as a scope constraint (worker-packet brief-is-authoritative surfaces unchanged).
- Claude host: byte-identical behavior to base (host guard exits + codex-gated block + script-scoped runtime regex).
- New repos: bootstrap defaults (project-init-lib, ensure-task-workflow pair) now emit the new `delegation.rule` text.

## Residual Risks / Follow-ups

- jq-absent hosts: standing block absent (matches file convention; revisit only if a real host without jq shows up).
- assets/reference-configs/hook-operations.md has no enforced parity check against the docs copy; aligned manually this package (drift check machinery deliberately not added per minimalism rule).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All six behavior probes pass incl. the dispatcher budget path; jq soft-degrade is the only carve-out |
| Product depth | 8/10 | Root cause fixed at the right layer (session vs message state); docs/bootstrap surfaces aligned in the same package |
| Design quality | 9/10 | Deletion-shaped; no new classifier or config surface; authority downgrade scoped to the parent-facing paragraph only |
| Code quality | 9/10 | Net deletion in the advisor; regression test self-checked against the reverted fix; projections regenerated, byte-verified |

## Failing Items

- none

## Retest Steps

- Re-run: `bun run check:hooks && bun run check:helpers && bun test`
- Re-check: `bun src/cli/index.ts hook SessionStart --route default` on an idle codex host with global delegation.mode=auto must emit `# Delegation Standing Authorization`; a plain prompt through the UserPromptSubmit delegation route must stay silent

## Summary

- Delegation auto-mode de-escalated from per-prompt contract-continuation injection to a once-per-session SessionStart standing-authorization block; UserPromptSubmit advisor is explicit-trigger-only in both modes; parent-facing contract authority downgraded to scope-constraint framing; runtime budget fix makes the block actually fire in idle sessions; policy/docs/bootstrap surfaces aligned. Gate verdict PASS with two hygiene findings, both resolved via this card and the post-merge archive step.
