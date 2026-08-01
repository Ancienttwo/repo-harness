# Implementation Notes: codex-app-thread-dispatch

> **Status**: Active
> **Plan**: plans/plan-20260802-0309-codex-app-thread-dispatch.md
> **Contract**: tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md
> **Review**: tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md
> **Last Updated**: 2026-08-02 03:09
> **Lifecycle**: notes

## Design Decisions

- The advisor sentence references `~/.codex/agents/<role>.toml` as the model/effort source instead of naming any model ID, so `! rg -q "gpt-5\.6" src/` stays true and `scripts/install-agent-fleet.sh` remains the single model-mapping authority.
- The fail-closed condition is worded as a conjunction plus an explicit negative ("declared fallback only when the App Thread tools are unavailable AND the live spawn schema accepts the exact model and reasoning effort of that role" / "MUST NOT fall back to native spawn, because native spawn silently inherits the parent model"). The reason clause is kept inline so a reader cannot restore native spawn as a generic availability fallback without also deleting the stated cause.
- The degradation ladder keeps the existing `${fallbackRunner || 'main-thread'}` interpolation and only prefixes `codex-exec`, so the sentence still projects the policy value rather than hardcoding the tail of the chain.
- The `fork_turns="none"` rule stays in `sharedRules` but is prefixed "On the native spawn_agent fallback path" rather than moved into the runner sentence: it is a spawn-call rule, not a runner-choice rule, and keeping it in the shared list preserves it for the Claude host.
- Thread-lifecycle rules are added as six flat `sharedRules` bullets (no sub-heading, no new block) to keep the advisor a single flat rule list; the header/permission/contract split is untouched.
- The standing-authorization block keeps `# Delegation Standing Authorization` and re-flows the first paragraph so `spawn no more than ${maxAgents}` lands inside one line ("workstreams exist; spawn no more than ${maxAgents} agents; never give"), which is what the pinned substring assertion matches.
- Session-context wording avoids apostrophes ("the exact model and reasoning effort read from the installed ...") to keep the single-quoted string literals escape-free, matching the surrounding style.
- `assets/reference-configs/external-tooling.md` is the canonical copy; `docs/` is a projection written by `bun scripts/sync-reference-configs.ts --write`. Editing docs/ directly would be reverted by the sync check.
- `delegation.rule` prose was left unchanged: it governs when the authorization block is injected (trigger/mode), not which runner is preferred, so it does not contradict the new runner semantics.

## Deviations From Plan Or Spec

- None.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add a `thread-lifecycle` sub-block to the advisor vs. flat bullets in `sharedRules` | Flat bullets | Plan says "compact"; a sub-block would fork the advisor's single rule-list shape for one path |
| Edit `docs/` then mirror by copy vs. edit `assets/` then run the sync script | Sync script | `scripts/sync-reference-configs.ts` treats `assets/` as canonical and `docs/` as projection |

## Round 2 (gate findings)

- Downstream seed skew: `pi_write_harness_policy` (`scripts/lib/project-init-lib.sh`) and the `ensure-task-workflow.sh` pair still seeded the old native-first `preferred_runners`/`runner_rule` into generated repos, so downstream policy contradicted this repo's. Fixed by copying both values verbatim out of `.ai/harness/policy.json` with a one-shot script (no re-paraphrase), then projecting `scripts/` -> `assets/templates/helpers/` through the sanctioned `bun scripts/sync-helper-sources.ts --write` rather than hand-editing the mirror. `project-init-lib.sh` is a separate seed copy, not a projection, so it is edited directly; its `rule` string legitimately differs from the helper's and was left alone.
- Symmetric thread-path fail-closed: the original wording only covered "App Thread tools unavailable", leaving the worse case open — `create_thread` exists but its live schema cannot carry the role's exact model/effort, so a literal orchestrator would create the thread anyway and silently inherit the parent model (the exact failure this slice exists to kill). Added the symmetric clause in both hook surfaces: such a thread is inherited-model, MUST NOT be adopted as a role-routed worker, degrade to codex-exec then sequential main-thread on the SAME contract with the degradation recorded. Placed as a `sharedRules` bullet (so it reaches both the permission and contract envelopes) plus one clause in the contract runner-preference sentence, and as one paragraph in the standing-authorization block — deliberately short, since both strings are injected context.

## Open Questions

- None. Live `codex_app__create_thread` model acceptance stays a post-merge runtime canary per the plan's Out of scope.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
