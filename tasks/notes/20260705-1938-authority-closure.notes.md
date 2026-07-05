# Implementation Notes: authority-closure

> **Status**: Active
> **Plan**: plans/plan-20260705-1938-authority-closure.md
> **Contract**: tasks/contracts/20260705-1938-authority-closure.contract.md
> **Review**: tasks/reviews/20260705-1938-authority-closure.review.md
> **Last Updated**: 2026-07-05 21:00
> **Lifecycle**: notes

## Design Decisions

- **T1 target content**: unified all 5 contract-template copies to exactly match canonical `assets/templates/contract.template.md`. The two standalone `.md` files (`assets/templates/contract.template.md`, `.claude/templates/contract.template.md`) are now byte-identical. The three embedded seed heredocs (`scripts/plan-to-todo.sh` render_contract_file bootstrap, `scripts/ensure-task-workflow.sh` bootstrap, `scripts/lib/project-init-lib.sh` `PI_TEMPLATE_CONTRACT`) now have heredoc bodies byte-identical to the canonical file's content (verified via `diff` against extracted heredoc bodies, not just `## ` heading-set comparison).
- **Status: Pending vs Active resolved as drift, not a deliberate split**: per plan instruction to read the pipeline logic before deciding. Grepped `scripts/plan-to-todo.sh`, `scripts/ensure-task-workflow.sh`, `scripts/lib/project-init-lib.sh` for any `Pending`→`Active` substitution; found none — `render_contract_file`'s `sed` pipeline only substitutes `{{PLACEHOLDER}}` tokens, never touches literal `Pending`/`Active` text. The other "Active" grep hits in these files belong to a *different* template entirely (`implementation-notes.template.md`, which always seeds `Active`); the "Pending" hits besides the contract seed belong to `review.template.md`'s seed. Neither is evidence of a deliberate contract-status pipeline. Concluded the seeds' `Pending` was stale drift from before the canonical template was updated to `Active`, and unified all three seeds to `Active`.
- Renamed the dead `bun run typecheck` command to `bun run check:type` (real script name, `package.json:38`) across all 5 copies, per the plan's already-decided rename.
- Full diff inventory (A vs B vs C vs D vs E, pairwise) confirmed the plan's own reconnaissance was accurate: no undocumented/unexpected logical differences surfaced beyond what section T1 already named. No STOP triggered.

## Deviations From Plan Or Spec

- Two `tests/helper-scripts.test.ts` fixtures (`contract-worktree finish should require external acceptance...` at the fixture package.json around line ~1504, and `ship-worktrees default mode should finish without merging...` around line ~1661) hardcoded a synthetic `package.json` with a `scripts.typecheck` key to satisfy the old exit-criteria command. Renaming the template's exit-criteria command to `bun run check:type` (per T1's already-decided rename) made these fixtures' rendered contracts require a `check:type` npm script that didn't exist in the fixture, so `contract-worktree.sh finish` / `ship-worktrees.sh` failed non-zero downstream. Verified via `git stash` that both tests passed on the pre-T1 baseline and failed only after the template edit, confirming this was a direct, expected consequence of the deliberate rename rather than an unrelated regression. Fixed by renaming both fixtures' `scripts.typecheck` key to `scripts["check:type"]` (same command value). Not explicitly named in the plan's T1 file list, but required to keep existing `tests_pass` coverage green under the plan's own rename decision; within `tests/`, an already-allowed path.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Make seed heredocs (C/D/E) match canonical A's full body vs. only patch the specific gaps recon named | Replace the full heredoc body with canonical content | Guarantees byte-level parity (not just heading-set parity) and is easier to keep correct than hand-patching ~6 separate gaps per file; still verified against the plan's named gap list before applying |
| Leave contract seed Status as `Pending` (seed-appropriate "not yet real" default) vs unify to `Active` | Unify to `Active` | No pipeline logic ever flips it later; a freshly-bootstrapped downstream repo would otherwise ship contracts permanently mislabeled `Pending`. Canonical template already treats `Active` as literal baked-in text, not a templated field |

## Open Questions

- None outstanding for T1/T2. Status-divergence question from the plan's recon is resolved (see Design Decisions).

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
