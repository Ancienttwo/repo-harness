# repo-harness 0.9.0 Release Prep Notes

## Context

The `0.9.0` minor line packages nine work-package plans landed since
`v0.8.5` (`a8f8663`):

- `file-coupled-delegation-phase2` — policy runner degradation
  (`preferred_runners`/`fallback_runner`), `codex-delegation-advisor`
  slim-down, and a non-blocking `plan-to-todo` brief-preflight advisory.
- `dev-loop-distillation` — contract template Why/Stop-Conditions/Exemplar
  fields, `writePrompt()`/`runBriefPreflight()` distillation, the golden
  contract-brief example, `verify-sprint` finish advisories, `contract-run.ts`
  `--runner` support, and SKILL.md teaching.
- `contract-intent-boundary` — carries plan Non-scope into contracts, splits
  In/Out-of-scope preflight, and injects the `EXECUTION_BOUNDARY` clause.
- `authority-closure` — bugfix task profile + Root Cause Evidence gate
  (contract-run.ts and verify-contract.sh sides), contract template
  `## Falsifier` field and full five-surface alignment, geju dependency +
  freeze advisory, and this repo's own `.claude/agents/`/`.codex/agents/*.toml`
  fleet with the `codex-subagent` runner label.
- `agent-fleet-dependency` — `fable_agents` policy entry, the
  `install-agent-fleet` helper, `check-agent-tooling` `detectAgentFleet()`
  strict-readiness, and tiered init/migrate assembly.
- `review-scope-fidelity` — review rubric v1 → v2 bump (fingerprint-bound
  external acceptance) plus a bounded P1-escalation Scope Fidelity dimension.
- `intake-trigger-rules`, `frontend-task-profile`, `archcontext-boundary-bridge`
  — intake prior-art/negative-scenario/canonical-term triggers with recorded
  acceptance, a frontend task profile with a design-brief gate, and a
  read-only `archcontext-boundaries-v1` capability export.

Each plan is archived under `plans/archive/` with its own contract, review,
and notes filed under `tasks/archive/`; this notes file is scoped to the
version-prep slice only, not to re-litigating any of those plans' own
decisions.

## Release Boundary

This slice prepares version surfaces and release filings only. It does not
publish to npm, create `v0.9.0`, or create the GitHub release, and it does
not re-run or re-verify the nine source plans' own acceptance evidence.

Version surfaces updated:

- `package.json`
- `assets/skill-version.json` (version bump + new `versionHistory` entry)
- `.claude/.skill-version`
- README current-release lines, including all four localized READMEs
- `docs/CHANGELOG.md`
- `deploy/release-checklists/260706-repo-harness-0.9.0.md`

## Deviation From The Release-Prep Brief's CHANGELOG Outline

The brief's CHANGELOG outline was verified line-by-line against
`git log --since="2026-07-04" --first-parent main` and each archived plan's
`## Task Breakdown` track IDs in `plans/archive/`. Two additions and one
correction were required:

- **Added** (missing from the outline entirely): the
  `file-coupled-delegation-phase2` policy/advisor/preflight work
  (`da1f21c`, `a67593d`, `38141a6`, `9456934`, `cbf023e`) predates and is
  explicitly superseded/absorbed by `dev-loop-distillation`'s own plan
  document, but its commits land after `v0.8.5` and were otherwise
  unrepresented in any outline bullet.
- **Added** (missing from the outline, beyond the template-field fragment
  already covered by the outline's Falsifier/template bullet): the rest of
  `dev-loop-distillation` Phase 3's prompt-distillation mechanics —
  `writePrompt()`/`runBriefPreflight()` changes, the golden example + guard
  test, `verify-sprint` finish advisories, `contract-run.ts` `--runner`
  option, and SKILL.md teaching.
- **Corrected**: the outline's "review rubric v1 指纹绑定" phrase describes
  `3dc4b84` (`feat(review): add Scope fidelity rubric dimension with bounded
  P1 escalation`), which actually bumps the rubric from v1 **to v2** (not a
  v1-only fingerprint tightening) while also adding the Scope Fidelity
  dimension; the CHANGELOG and skill-version description reflect v1→v2.

All other outline bullets (bugfix/root-cause gate, geju, agent-fleet
dependency, codex-subagent + fleet commit, frontend/intake/archcontext,
EXECUTION_BOUNDARY, `check:type` rename + sprint-contracts.md bugfix
revision, bash 3.2 heredoc fix) were confirmed accurate against the actual
commits and are carried through unchanged in substance (reworded into
CHANGELOG prose).

Left out of the CHANGELOG on purpose, consistent with this file's existing
granularity (internal/non-user-facing): `95077e1` (tsconfig coverage/type-error
repair), `3bf2d0a` (CLI validator dedup refactor), `ba7ce45` (external
verification evidence manifest research doc), and the `e47315a`/`61b244d`
README image-order WIP checkpoints.

## Verification

- `bun -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"))'`
  and the same for `assets/skill-version.json` — both parse clean.
- `rg -n "0\.8\.5" package.json README*.md .claude/.skill-version
  assets/skill-version.json` — zero hits except the intentionally preserved
  historical `0.8.5` entry inside `assets/skill-version.json`'s
  `versionHistory` array.
- `rg -rn "skill-version" scripts/ src/ tests/ --glob '!node_modules'` to find
  consumers, then `bun test tests/skill-version.test.ts
  tests/migration-script.test.ts tests/installed-copy-sync.test.ts
  tests/workflow-contract.test.ts` — 60 pass / 0 fail / 993 expect() calls.
- `bash scripts/check-task-workflow.sh --strict` initially failed on a stale
  `.ai/harness/handoff/resume.md` left over from the prior
  `agent-fleet-dependency` contract closeout (older than `tasks/current.md`,
  unrelated to this slice's edits). Remediated with
  `bash scripts/prepare-handoff.sh --reason "0.9.0 release prep version
  bump"` (writes only the gitignored `.ai/harness/handoff/` packet, no
  tracked-file side effect), then reran clean.
- `bash scripts/check-task-sync.sh` passed once this notes file and the
  release checklist were added; this notes file is this slice's task-sync
  artifact.
- `git status --short --branch -uall` shows only the version-surface files,
  the new checklist, and this notes file.

Not run in this prep slice (out of its verification boundary; see the
release checklist's Publish Checklist): the full `bun run check:release`
battery, `npm pack`/tarball install smoke, and npm registry preflight.
