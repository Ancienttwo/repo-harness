# Task Review: skill-surface-discovery-convergence

> **Status**: Reviewed
> **Plan**: plans/plan-20260715-1140-skill-surface-discovery-convergence.md
> **Contract**: tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md
> **Notes File**: tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-23
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: the plan's full affected file family — root `SKILL.md`; `assets/skill-commands/**`; `assets/skills/**`; `.agents/skills/**` (retired); `src/core/skill-surface/**`; `src/core/review/**` + `src/effects/review/**`; `src/cli/installer/**`; `src/cli/commands/{init,global-runtime,cross-review,chatgpt}.ts`; `src/cli/mcp/setup.ts`; `scripts/sync-codex-installed-copies.sh`; the Skill-routing eval surface; README x5; `docs/reference-configs/**` + `assets/reference-configs/**`; `docs/architecture/modules/public-surface/**`; `docs/CHANGELOG.md`; package plan/contract/review/notes; `tasks/todos.md`
- Actual files changed: exactly that set across 10 commits on `codex/skill-surface-discovery-convergence` (SSD-01..07 + the amendment/closeout commits); zero drift outside `allowed_paths` beyond the six contract-amended paths ratified during the SSD-06 gate rounds (`tests/hook-contracts.test.ts`, `tests/readme-dx.test.ts`, `tests/ux-feature-guardrail.test.ts`, `.ai/context/capabilities.json`, `assets/templates/prd.template.md` + its helpers mirror, `evals/fixtures/{prd-from-idea,prd-to-sprint}/README.md`, `.claude/templates/prd.template.md`) — each a documented mechanical consequence of the mandated cutover, ratified in the contract before the fix landed
- Commands passed: full suite 2024 pass / 1 skip / 0 fail (phase A); `check:type` clean throughout every slice; `bash scripts/check-tarball-install-smoke.sh` OK (post-`files[]` change); `check-deploy-sql-order`, `check-architecture-sync` (advisory, 0 blocking), `check-task-workflow --strict`, `inspect-project-state` (no drift), `adopt --dry-run` (0 ops, self-host expected) all green; live 4-profile x 2-host `sync-codex-installed-copies.sh` probe matches the target discovery matrix exactly on both hosts
- Residual risks: (1) SSD-07 Phase B's real-provider routing-quality measurement is recorded `contaminated_invalid_evidence` — frozen fallback applied, deferred-goal follow-up added, does not block this package per the orchestrator's ruling (see Acceptance Receipt Projection and Residual Risks below); (2) three intake findings carried across slices for future packages (root `SKILL.md` doesn't link `references/workflow-packaging-rubric.md`; three homonym `FILE_ALLOWLIST` entries in the retired-names scan could be deleted outright; `read-back.md`'s Connector Invocation Evidence contract lacks a binding assertion) — all LOW/MEDIUM, non-blocking, recorded in the notes
- Reviewer action required: none further — every slice passed its own gatekeeper round (SSD-01 PASS; SSD-02 round-1 FAIL/3 findings → fix → round-2 PASS; SSD-03 PASS; SSD-04+05 wave PASS; SSD-06 round-1 FAIL/1 acceptance-line finding → fix → round-2 PASS; SSD-07 Phase A round-1 FAIL/1 HIGH finding → fix → round-2 PASS); Phase B's contamination was caught by the orchestrator's own post-hoc diagnosis, not a gate miss, and is ruled via frozen fallback, not silently absorbed
- Rollback: revert the single work-package PR; host transaction rollback (proven under injected failure at every mutation stage across SSD-02/06) restores all preexisting bytes; never remove unowned or modified host Skill content to force recovery; after publish, restore the previous package/profile from the release artifact and ship a corrective minor

## Mode Evidence

- Selected route: planning (host-plan work-package; dependency-blocked Draft until EPC closeout, then Draft → Annotating → Approved on 2026-07-23 per the plan's own activation gate)
- P1/P2/P3 evidence: plan's Architecture Map (current 25-source authority survey), Concrete Traces (installation/retirement, request-to-side-effect, cross-review, ChatGPT setup), and Design Decisions (manifest-before-deletion, one discovery source not one risk source, no compatibility aliases, no invented autoplan engine, progressive references, source-count vs discovery-count distinction, provider mechanics below Skill prose, one expensive final run) — all traced and honored across the seven slices
- Root cause or plan evidence: not applicable (Task Profile `code-change`, not `bugfix`) — SSD-07 Phase B's contamination finding carries its own root-cause record at `evals/skill-routing/phase-b-attempt-outcome.json`, separate from this package's own profile

## Verification Evidence

- Waza `/check` run: eight independent gatekeeper reviews across seven slices (one per slice, two rounds each for SSD-02/06/07-A), all fresh-context and read-only, verdicts recorded above
- Commands run: see Human Review Card; full detail per-slice in the notes file's `## SSD-01` through `## SSD-07 Phase B` sections
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `evals/skill-routing/{discovery-baseline,routing-corpus,routing-corpus.schema,final-subject-freeze,retirement-matrix-coverage,phase-b-attempt-outcome}.json` + the two real routing reports and aggregate (immutable, contaminated-labeled); `docs/CHANGELOG.md` unreleased entry; `docs/architecture/modules/public-surface/{action-commands,root-router}.md`
- Implementation notes reviewed: yes — full `## SSD-01` through `## SSD-07 Phase B` sections, every deliberate oracle-assertion migration, every ratified out-of-scope fix, every carried-forward intake finding
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] Minimal/standard/product-planning/strict discovered sets match the target matrix exactly on both hosts; product planning does not install ChatGPT; strict does not silently add product planning
  - Evidence: SSD-06 gate's own live 4-profile x 2-host sync probe (minimal→root only; standard→+plan,check; product-planning→+product; strict→+ship, both cross-review host placements) matched the target matrix exactly; negative assertions for lines 4 verified in `tests/skill-surface/catalog.test.ts`.
- [x] No live executable reference targets a retired Skill name; retired names appear only in migration metadata, changelog/history, or archived artifacts
  - Evidence: `tests/skill-surface/retired-names-scan.test.ts` (round-2 gate: zero unexcepted hits across all six previously-violating files plus the self-hosted `.claude/templates` copy; stale-allowlist freshness check tightened so a fixed file cannot leave a silent permanent exemption).
- [x] Host retirement transaction preserves modified and unowned copies, and injected failures restore original bytes at every mutation stage
  - Evidence: `tests/install-profiles.test.ts` + `tests/installed-copy-sync.test.ts` failure-injection suites (pre-existing + SSD-02's new synthetic-package injection test), gate-verified across SSD-02 and SSD-06.
- [x] Root SKILL.md is at or below 2,048 bytes with mode detail progressively loaded
  - Evidence: 2044 bytes (SSD-06 gate independently confirmed); references load progressively per SSD-03's staged canonical packages.
- [ ] ~~Frozen-subject routing evidence meets per-route floors~~ — **superseded by contract amendment**: see the amended manual check below.
  - [x] The Phase B attempt outcome record exists, is immutable, and correctly diagnoses `contaminated_invalid_evidence` with root cause and a deferred follow-up; the two real-provider reports and aggregate are preserved byte-exact; every other SSD-07 checklist item and manual check is independently satisfied without relying on the routing-quality measurement.
    - Evidence: `evals/skill-routing/phase-b-attempt-outcome.json` (root cause: `claude -p` reads the operator's ambient/cached user-level skill registry, not the per-case isolated workspace — proven by two manual reproductions, one showing unrelated personal skills in the transcript, one showing `~/.claude/skills/repo-harness-plan` resolving to a stale pre-cutover global path); reports untouched (`git diff` shows no mutation); `tasks/todos.md` deferred-goal row added.
- [x] merge-gate source, output schema, tool-free execution, receipt binding, and ship enforcement are byte-unchanged
  - Evidence: `assets/templates/helpers/merge-gate.ts` in every slice's forbidden-paths list, confirmed byte-unchanged across all ten commits (`git diff 314ee1a7..HEAD -- assets/templates/helpers/merge-gate.ts` empty); manifest classifies `merge-gate` as `kind: "judge"`, non-selectable, per R6.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: Seven-slice atomic Skill-surface cutover, every slice independently gatekeeper-reviewed (PASS after fix rounds where findings surfaced), full repo gates green, live projection matches the target matrix exactly. SSD-07 Phase B's real-provider routing-quality measurement is contaminated by an eval-harness injection defect (not a product regression) and is recorded via frozen fallback per this Program's no-rerun discipline, with a deferred-goal follow-up. Package is fit to ship.
- Findings: none blocking; three LOW/MEDIUM intake items and the Phase B harness defect carried forward per the notes.

## Behavior Diff Notes

- 25 Skill-like sources converge to 10 canonical packages (repo-harness, -setup, -plan, -product, -check, -ship, -architecture, -cross-review, merge-gate [classification-only], -chatgpt) plus `claude-plan` (survives, postdates the plan freeze).
- Manifest v2 (16 packages + 19 retired records) becomes the sole runtime discovery authority; four independently-maintained selection mechanisms (shell case statement, two hard-coded arrays, installer probe lists) collapse into one catalog.
- Cross-review mechanics move from large embedded shell workflows in provider Skills to typed Core/Effects/CLI, with the CLI command now registered; ChatGPT drift across three prose owners converges to one canonical byte source.
- Zero risk/security authority changes: Effective State, PreToolUse, and merge-gate semantics are untouched throughout.

## Residual Risks / Follow-ups

- SSD-07 Phase B: routing-quality acceptance dimension unmeasured by a real provider; deferred-goal added (`tasks/todos.md`) for a future package to fix the Skill-injection mechanism (candidate: isolated `CLAUDE_CONFIG_DIR`/`HOME` per case, or validate the Codex path) plus the aggregate case-sourcing tie-break defect (correctness-blind first-by-path selection).
- Root `SKILL.md` does not link `references/workflow-packaging-rubric.md` (hook-only discoverability recorded as the design; 4 bytes of budget remain if a future package wants to link it).
- Three homonym `FILE_ALLOWLIST` entries in the retired-names scan test could be deleted outright (the boundary regex never matches those files; low-value cleanup).
- `read-back.md`'s Connector Invocation Evidence contract lacks a binding assertion to `assertChatGptMcpContract` (carried from the SSD-04/05 wave gate).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All seven slices pass; routing-quality measurement blocked by harness defect, not product defect |
| Product depth | 9/10 | Clean single-authority convergence; no compatibility aliases anywhere |
| Design quality | 9/10 | Manifest-before-deletion discipline held throughout; every gate round caught real issues before they shipped |
| Code quality | 9/10 | Deliberate oracle migrations documented; failure-injection coverage; zero unauthorized scope creep |

## Failing Items

- none (Phase B's routing-quality dimension is unmeasured, not failing — see the contract amendment and Manual Check Evidence)

## Retest Steps

- Re-run: `bun test` (full suite); `bash scripts/check-tarball-install-smoke.sh`; the live 4-profile sync probe under disposable `HOME`/`CODEX_SKILLS_ROOT`/`CLAUDE_SKILLS_ROOT`
- Re-check: `evals/skill-routing/phase-b-attempt-outcome.json` for the frozen-fallback ruling; `tasks/todos.md` for the deferred routing-eval-harness-fix row

## Summary

- Seven-slice atomic public Skill-surface cutover: manifest v2 becomes the sole discovery authority, 25 sources converge to 10 canonical packages with zero compatibility aliases, and every slice independently passed gatekeeper review (with two productive fix rounds where real issues surfaced). The one dimension that could not be measured — real-provider routing quality — failed for a diagnosed harness reason, not a product reason, and is handled via this Program's own frozen-fallback discipline with a deferred follow-up recorded. Fit to ship.
