# Task Review: codex-delegation-session-auth

> **Status**: Complete
> **Plan**: plans/plan-20260714-2052-codex-delegation-session-auth.md
> **Contract**: tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md
> **Notes File**: tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-14 22:44
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:ed00c22b7140c9dfe3733977cacf0a5c088704e69a909f52dd8ac1a2cfa42526
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: assets/hooks/codex-delegation-advisor.sh, assets/hooks/session-start-context.sh, .ai/hooks/* (generated projection), .ai/harness/policy.json, src/cli/hook/runtime.ts, scripts/lib/project-init-lib.sh, scripts/ensure-task-workflow.sh, assets/templates/helpers/ensure-task-workflow.sh, docs/reference-configs/hook-operations.md, assets/reference-configs/hook-operations.md, README.md, docs/architecture/modules/runtime-harness/hook-adapters.md, tests/cli/hook.test.ts, tests/hook-contracts.test.ts, tests/hook-runtime.test.ts
- Actual files changed: matches intended set plus contract/plan/notes/todos workflow artifacts; every changed path traced to contract `allowed_paths` by the acceptance gate (no out-of-scope edits)
- Commands passed: `bun run check:hooks` (25 files OK), `bun run check:helpers` (46 helpers OK), targeted `bun test` (182 pass / 0 fail), full `bun test` (1420 pass / 1 pre-existing skip / 0 fail), `bash scripts/check-architecture-sync.sh` (0 blocking), `bash scripts/check-task-sync.sh` (pass)
- External acceptance: manual_override (independent fresh-context gatekeeper review in-session; see External Acceptance Advice)
- Residual risks: on hosts without `jq`, the SessionStart standing block degrades to absent (pre-existing guarded soft-dependency pattern in session-start-context.sh; recorded as known behavior, not a defect)
- Reviewer action required: none — diff, probes, and checks reviewed by the acceptance gate
- Rollback: single revert of the work-package commit on `codex/codex-delegation-session-auth` (base d5a80279); no data migration, no install-surface change

## Mode Evidence

- Selected route: capture-plan (Approved work-package) -> contract worktree -> delegated worker slices 1+2 -> independent acceptance gate
- P1/P2/P3 evidence: plan `## Root cause being fixed` and contract `## Why` (advisor auto-branch trace at codex-delegation-advisor.sh lines 242-249 pre-change; consumer coupling verified: stop-orchestrator keys on `state.explicit === true` only, subagent-start-context tolerates missing delegation state)
- Root cause or plan evidence: standing authorization was session-level state re-asserted per message with contract-continuation authority attached; fix relocates it to SessionStart and makes UserPromptSubmit explicit-trigger-only in both modes

## Verification Evidence

- Waza `/check` run: equivalent in-session acceptance gate (independent gatekeeper agent, fresh context, read-only + real verification commands)
- Commands run: `bun run check:hooks`, `bun run check:helpers`, `bun test tests/cli/hook.test.ts tests/hook-contracts.test.ts tests/hook-runtime.test.ts tests/workflow-contract.test.ts tests/contract-run.test.ts` (182 pass), `bun test` (1420 pass / 0 fail), `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-sync.sh`
- Manual checks: isolated-HOME runtime probes — plain prompt under repo-policy auto and global-config auto: advisor exit 0, empty stdout, no `.ai/harness/delegation/` created; mechanism question containing trigger phrase: silent; explicit trigger: injects with `explicit=true, mode="explicit", stop_fallback=true` and new current-turn-authority framing; full CLI dispatcher SessionStart on idle codex+auto repo emits the 10-line `# Delegation Standing Authorization` block (previously empty via budget drop); override matrix global-vs-repo in both directions plus invalid-global-JSON fallback; HOOK_HOST=claude silent on all paths
- Supporting artifacts: regression test in tests/cli/hook.test.ts exercising the dispatcher path (self-checked: fails with the fix reverted, passes with it restored); EXECUTION_BOUNDARY first sentence verified byte-identical across parity surfaces
- Implementation notes reviewed: yes (tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md, slices 1 and 2)
- Run snapshot: not applicable (no contract-run delegated execution; work performed by session-managed worker in the contract worktree)

## External Acceptance Advice

> **External Acceptance**: manual_override
> **External Reviewer**: independent gatekeeper agent (fresh-context acceptance gate, read-only)
> **External Source**: in-session acceptance gate review, 2026-07-14
> **External Started**: 2026-07-14 22:15
> **External Completed**: 2026-07-14 22:30

- P1 blockers: none
- P2 advisories: review card and plan closeout hygiene (addressed: this card completed before commit; plan closes via archive-workflow after merge); jq-absent hosts silently lose the standing block (pre-existing soft-degrade convention, documented)
- Acceptance checklist: diff-vs-allowed-paths sweep clean; absence checks clean (no intent classifier, no compatibility branch, worker-packet authority surfaces untouched); all verification commands re-run by the gate itself; runtime probes reproduced independently of the implementer

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
