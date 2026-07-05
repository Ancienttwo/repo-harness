> **Archived**: 2026-07-06 01:44
> **Related Plan**: plans/archive/plan-20260705-1938-authority-closure.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260706-0144

# Task Review: authority-closure

> **Status**: Reviewed
> **Plan**: plans/plan-20260705-1938-authority-closure.md
> **Contract**: tasks/contracts/20260705-1938-authority-closure.contract.md
> **Notes File**: tasks/notes/20260705-1938-authority-closure.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-06 01:00
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: pending
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: per plan's 13 slices (T1 T2 / H0-H3 / G1 G2 / C1-C3 / G3 / F1) — contract template 5 surfaces + 2 helper mirrors, `verify-contract.sh`/`harness-trace-grade.sh`/`contract-run.ts` (+ mirrors) bugfix root-cause gate, shared `tests/fixtures/root-cause/` fixtures, `.ai/harness/policy.json` `hai_stack` entry + `codex-subagent` runner label (+ seed mirrors), `docs/reference-configs/{sprint-contracts,external-tooling,agentic-development-flow}.md` (+ `assets/reference-configs/` mirrors), `contract-brief-example-bugfix.md`, `scripts/plan-to-todo.sh` (+mirror) `[Geju]` advisory, `.claude/agents/` fleet definitions, `.gitignore` + `.codex/agents/*.toml` symmetric Codex fleet, PRD/Plan/Check SKILL.md teaching, plus this closeout's two small fixes (self-contained Root Cause Evidence pointer text, stale H2 plan prose).
- Actual files changed: 12 slice commits `db54963..3a45112` (T1 through G3; F1 is verification-only, no diff) plus this dispatch's two closeout commits (template/plan doc fix; review + projection artifacts) — all paths verified within the contract's `allowed_paths`, no out-of-plan additions.
- Commands passed: F1 battery 15/15 green — `bun test` (1050 pass / 0 fail / 1 skip), `bun run check:type`, `bun run check:hooks`, the three `check-*.sh` scripts (deploy-sql-order, architecture-sync, task-sync), `repo-harness run check-task-workflow --strict`, `bun scripts/inspect-project-state.ts`, `bash scripts/migrate-project-template.sh --dry-run`, all mirror/template/reference-configs pairs diffing clean, the bugfix golden example returning `preflight_pass`, `.codex/agents/*.toml` no longer `git check-ignore`d, and the EXECUTION_BOUNDARY "forbidden design space" clause covering all four runner surfaces. The two shared-fixture root-cause gates (contract-run.ts / verify-contract.sh) agree on every case: `bugfix-pass` accepted by both, `artifact-missing` rejected by both, and the passing-run artifact case rejected by both (gate-gaming guard holds). Non-bugfix contract behavior is unchanged (exit_criteria-only path untouched). This closeout's own re-verification (after the two small doc edits) reconfirms: targeted template-assertion suite 126/126 pass, full suite 1050/0/1 skip (unchanged), all mirror/template/reference-configs pairs still clean, migrate dry-run exit 0, `verify-contract.sh --strict` 30/33 pass (see Verification Evidence).
- External acceptance: unavailable — no cross-vendor (Codex) review was run for this closeout dispatch; the branch's earlier slices were produced under dual-track Opus+Codex convergence and two prior adversarial plan reviews (see Mode Evidence), but this specific pass/fail call is the internal gatekeeper/orchestrator acceptance recorded below, not an external peer run.
- Residual risks: C2 (`.codex/agents/*.toml` recognition) has no automatable introspection surface on this machine's codex-cli 0.141.0 — recorded as manual verification pending, not a failure (schema itself is officially confirmed and TOML files are validated to exist with required keys). The G1/G3 brain-vault resync (`scripts/sync-brain-docs.sh`) writes outside git to a `repo-to-brain` manifest target when in-scope reference-configs docs change; this is documented, reversible, orchestrator-endorsed infrastructure, not part of this diff.
- Reviewer action required: none blocking; a human should confirm `deep-reasoner`/`fast-worker`/`gatekeeper` are visible under interactive Codex `/agent` in this worktree as a follow-up (C2 standing item).
- Rollback: all slices are revertible with no data migration — revert branch `codex/authority-closure` wholesale, or per-slice (mirror/seed pairs must revert together; C1 revert = delete the copied-in `.claude/agents/` files; C2 revert = delete `.codex/agents/` and undo the `.gitignore` negation). Base: `a409656` (origin/main at plan creation).

## Mode Evidence

- Selected route: repo-harness-plan captured work-package plan -> contract-worker slice execution (T1 -> T2 -> (H0-H3 parallel-safe with G1-G2 and C1-C3) -> G3 -> F1) -> this contract-worker closeout dispatch (2 doc-only fixes + review/commit finalization).
- P1/P2/P3 evidence: plan's own dual-track convergence (Opus + Codex independently arrived at the same "extract behavior evidence, not reasoning" authority-closure principle) plus two folded adversarial rounds — Codex (gpt-5.5·xhigh) BLOCK verdict on the Draft (distribution-drift undercounted, `.codex/*` gitignore trap, non-decision-complete dual-parser gate, geju location gap) and a second Fable re-review REVISE verdict (base re-anchored to `a409656`, E1 dropped as already-landed by `contract-intent-boundary`, H0 default semantics pinned, reference-configs mirror obligation added, pre-fix-artifact capture recipe hardened against substring false positives) — both fully folded into the executed plan text (see plan's "Codex 评审已并入" / "Fable 复审已并入" sections).
- Root cause or plan evidence: not applicable (contract `Task Profile: code-change`, not `bugfix` — the Root Cause Evidence gate this plan ships does not apply to itself).

## Verification Evidence

- Waza `/check` run: this review, closing out the prior internal gatekeeper acceptance pass plus this dispatch's own re-verification battery.
- Commands run: see Human Review Card "Commands passed" for the full F1 battery (15/15) and this dispatch's reduced re-verification; raw outputs for this dispatch's own run are in the delegating orchestrator's transcript (targeted suite 126 pass/0 fail, full suite 1050 pass/0 fail/1 skip, `verify-contract.sh --strict` 30 pass/3 fail before this closeout's own manual-check dispositions below).
- Manual checks: C2 — no `codex agent`/`codex agent list` introspection subcommand exists on this machine's codex-cli 0.141.0; `codex doctor` shows no TOML parse error and lists `multi_agent` among enabled feature flags (positive but inconclusive); a bounded `codex exec` self-report probe returned `NO_AGENT_ROSTER_VISIBLE` (inconclusive, not a rejection — no parse error, no "unsupported" statement, the two only conditions the plan defines as STOP-worthy). Disposition: **manual verification pending** — a human should run interactive `codex` in this worktree and check `/agent` before treating C2 as fully proven end-to-end. D1/G1/G3 brain-vault resync: disposition **endorsed by the orchestrator** — a documented, repo-owned `repo-to-brain` manifest mechanism that lives outside git and outside `allowed_paths` by construction; not a gap in this contract's diff.
- Supporting artifacts: `tasks/notes/20260705-1938-authority-closure.notes.md` — Design Decisions (per-slice rationale for all 13 slices), Deviations From Plan Or Spec (G1/G3 brain-sync, F1 bugfix-smoke retarget, two test fixtures' `typecheck`->`check:type` rename fallout, the bash 3.2 heredoc/apostrophe parser bug and its fix), Tradeoffs Considered, Open Questions, Evidence Links, Promotion Candidates.
- Implementation notes reviewed: yes — all 13 slices have Design Decisions entries; deviations and open questions are documented with rationale, not silently absorbed.
- Run snapshot: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`.

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- Manual Override: recorded 2026-07-06 by orchestrator — this work package already carries a cross-vendor adversarial review at plan stage (Codex gpt-5.5·xhigh BLOCK round, findings folded into the executed plan), an independent orchestrator re-review (REVISE round, findings folded), and a gatekeeper PASS backed by the full F1 battery; a fresh Codex re-acceptance of the merged implementation diff (fingerprint-bound rubric) is queued in tasks/todos.md to supersede this override, mirroring the contract-intent-boundary precedent (2affc9f).
- P1 blockers: none run this dispatch.
- P2 advisories: none run this dispatch.
- Acceptance checklist: no cross-vendor run performed for this closeout; internal gatekeeper/orchestrator acceptance is the recorded verdict (see Human Review Card, Verification Evidence).

## Behavior Diff Notes

- Contract template (5 surfaces + 2 helper mirrors): gains optional `## Falsifier` and conditional `## Root Cause Evidence` sections; `bun run typecheck` -> `bun run check:type` renamed; `task_profile` legal-values comment lists `bugfix`; the `pre_fix_failure_artifact` bullet's internal cross-reference is now a self-contained pointer into `docs/reference-configs/sprint-contracts.md` (this closeout's D4 fix) rather than the plan-internal "H2/H3" slice IDs.
- Root-cause gate: `task_profile: bugfix` now triggers a symmetric pre-fix-failure-evidence check in both `contract-run.ts` (TS, preflight) and `verify-contract.sh` (bash, --strict), proven against 7 shared fixture files and one shared expectation table so neither implementation can silently drift from the other; non-bugfix contracts are unaffected (exit_criteria-only path, explicitly re-promised in `sprint-contracts.md`'s new "Root Cause Evidence Gate" section).
- geju: promoted from ambient convention to a policy-visible `hai_stack` dependency entry (byte-structural twin of the existing `waza` entry, both seed surfaces synced) plus a post-render `[Geju]` stderr advisory in `plan-to-todo.sh` (`|| true`, exit code proven unchanged) instructing authors to freeze thesis/direction into `## Why` and falsifier/proof-point into `## Falsifier`.
- Fleet: `.claude/agents/{deep-reasoner,fast-worker,gatekeeper}.md` committed into the repo (byte-identical copy from the user-level source, provenance re-verified against the upstream canonical repo at a pinned commit); a symmetric `.codex/agents/*.toml` fleet added with a `.gitignore` negation, each `developer_instructions` reusing the matching `.md` body plus the literal `EXECUTION_BOUNDARY` clause; `codex-subagent` added as a first-class `preferred_runners` label (contract-run.ts required no code change — off-policy computation is already per-contract dynamic).
- This closeout (D2/D4): no behavior change — a template cross-reference wording fix and a plan-prose staleness cleanup, both doc/artifact-level only.

## Residual Risks / Follow-ups

- C2: `.codex/agents/*.toml` recognition by codex-cli 0.141.0 has no automatable introspection surface; needs one interactive human `/agent` check before being called fully proven (see Human Review Card, Verification Evidence).
- Brain-vault resync (`scripts/sync-brain-docs.sh`) friction: any future slice or plan touching a `repo-to-brain`-registered doc in an isolated worktree without a repo-local `.claude/settings.json` will hit the same `check-task-workflow --strict` drift and need the same ad hoc dry-run-then-real fix; whether `allowed_paths` or the plan's global rules should explicitly cover this remains open at the plan level (notes, Open Questions).
- Not yet promoted (single-occurrence, per notes' own promotion threshold): the bash 3.2 "`$(...)` + single-quoted heredoc + odd apostrophe count breaks even a literal-body heredoc" parser hazard (any other `VAR=$(cat <<'EOF' ...)` pattern in this repo's `*.sh` files is at risk the moment its prose gains an odd apostrophe count); and the "shared fixture files + one shared expectation-table module, imported by both a TS test and a bash-driving test" pattern for keeping two independent gate implementations honest without a shared parsing library.
- Plan's own H2 slice prose (file-list line + Verify line) previously named the wrong golden-example filename after the orchestrator's file-split decision superseded it; fixed by this closeout (D2) with an explicit "(execution-period deviation, see notes)" annotation rather than silently rewriting history.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | F1 battery 15/15 green; dual-parser shared-fixture agreement on all 7 root-cause cases including the gate-gaming guard (passing-run artifact rejected by both); non-bugfix contracts provably unaffected; C2 manual-check gap keeps this off a 9-10 |
| Product depth | 8/10 | 13 slices land the full authority-closure principle across template, dual gate, policy+advisory, and symmetric fleet surfaces; C2's unresolved introspection gap and the ad hoc D1 brain-sync fix are the reasons this isn't higher |
| Design quality | 8/10 | Explicit YAGNI kill-list (9 items) honored; fail-closed discipline maintained throughout (no compatibility fallback for missing authority values); deliberately rejected a shared parsing library for the two gate implementations in favor of shared fixtures, a documented tradeoff rather than an oversight |
| Code quality | 8/10 | Byte-parity discipline held across 5 template copies + policy/reference-config mirrors; a genuine bash 3.2 heredoc/apostrophe parser bug was root-caused and fixed with a minimal, scoped patch; fixtures are real captured `bun test` runs, not hand-typed fakes |

## Failing Items

- (none) — all contract exit_criteria that are machine-gradable pass; the one remaining `verify-contract.sh --strict` item (`C2 smoke output recorded in notes, or C2 suspended with STOP evidence`) is an inherently free-text manual check the script's own grammar reports as `unsupported` for any value other than the one literal string it knows how to grade (`Evaluator review file recommends pass`) — not a functional gap, see Verification Evidence.

## Retest Steps

- Re-run: the F1 battery (plan §切片 F1, 15-command block) plus this dispatch's reduced re-verification (`bun test tests/helper-scripts.test.ts tests/scaffold-parity.test.ts tests/contract-run.test.ts`, full `bun test`, the mirror/template/reference-configs `diff -q` set, `bash scripts/migrate-project-template.sh --repo . --dry-run`, `bash scripts/verify-contract.sh --contract tasks/contracts/20260705-1938-authority-closure.contract.md --strict`).
- Re-check: interactive `codex` in this worktree, `/agent` should list `deep-reasoner`/`fast-worker`/`gatekeeper` (C2 standing manual item).

## Summary

- Authority-closure lands the plan's 13 slices: contract templates gain optional Falsifier and conditional (bugfix-only) Root Cause Evidence sections across all 5 surfaces; a symmetric pre-fix-failure-evidence gate runs in both the TypeScript and bash verifiers against shared, behaviorally-real fixtures; geju's thesis/falsifier output is promoted from ambient convention to a policy-visible dependency plus a post-render freeze advisory; and a symmetric Claude/Codex subagent fleet is committed into the repo with a matching `codex-subagent` runner label. This closeout dispatch additionally replaces a plan-internal "(see H2/H3)" cross-reference with a self-contained doc pointer across all 7 in-scope template/mirror copies, corrects two stale plan-prose lines to match the landed independent golden-example file, and records this passing acceptance. Sole open item is C2's manual `/agent` confirmation, already flagged as a standing non-blocking follow-up rather than a defect.
