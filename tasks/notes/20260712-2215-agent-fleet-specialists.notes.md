# Implementation Notes: agent-fleet-specialists

> **Status**: Completed
> **Plan**: plans/plan-20260712-2215-agent-fleet-specialists.md
> **Contract**: tasks/contracts/20260712-2215-agent-fleet-specialists.contract.md
> **Review**: tasks/reviews/20260712-2215-agent-fleet-specialists.review.md
> **Last Updated**: 2026-07-13 00:19
> **Lifecycle**: notes

## Design Decisions

- `root-cause-prover` is an evidence producer for the existing four-field bugfix gate, not a new gate. Its workspace-write projection is limited by the active contract's allowed paths and its prompt forbids production fixes.
- `harness-evaluator` uses workspace-write only inside a complete disposable repo/HOME. A full skill benchmark requires that boundary because the existing runner writes repository-local manifest/summary files even when its workspace root is temporary; source checkout or real HOME makes the persona return BLOCKED.
- The skills profile invokes the existing runner with `--require-disposable --repo ... --home ...`. That guard rejects the source checkout, real HOME, non-sibling repo/HOME roots, incomplete repo state, and manifest/config/output paths outside the disposable repo before creating output directories; spawned agent commands receive the canonical disposable HOME.
- The adoption profile invokes the same runner once with `--run-adoption-profile`; code then supplies the validated canonical repo/HOME directly to inspector and adopt dry-run. The shared root guard rejects source checkout and real HOME in either argument position, including swapped inputs.
- Migration auditing is the evaluator's adoption profile; it does not become a separate persona.
- Native Explore is host-owned, informal discovery only. The repo cannot read or inherit its prompt, so formal contract exploration always uses the complete repo-owned `explorer` persona and no `explore` alias exists.
- Codex writable roles are an explicit closed set: `fast-worker`, `root-cause-prover`, and `harness-evaluator` only.

## Deviations From Plan Or Spec

- Independent review found the initial `harness-evaluator` read-only sandbox contradicted its full skills profile because the existing runner necessarily writes manifest and summary files. The brief, writable set, docs, projections, and tests were revised so evaluator workspace-write is valid only in a complete disposable repo/HOME; a new runtime test executes the selected skills profile and proves both outputs remain inside that disposable repository.
- Claude cross-review then found two P1 gaps: the disposable boundary had no runner-level guard, and `root-cause-prover` lacked a Claude tools allowlist. The work-package scope was narrowly widened to add the runner's boundary mode without changing cases/scoring, both roles now have explicit `Read/Grep/Glob/Bash` tool sets, and negative tests cover source-checkout and real-HOME rejection.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Separate `migration-auditor` | Rejected | Its distinction is disposable adoption/inspection execution, which is a profile of one evaluator identity. |
| Native Explore prompt delta | Rejected | The host prompt is invisible and unversioned; an incremental merge would create hidden dual authority. |
| Keep harness-evaluator read-only | Rejected after review | The existing full skill runner necessarily writes manifest and summary files. The role must be workspace-write in a complete disposable repo/HOME or it cannot execute its declared profile. |
| Rely only on the evaluator prompt for disposable safety | Rejected after Claude review | The runner now rejects unsafe roots and escaped output paths before writes; the persona still supplies the broader adoption-profile judgment boundary. |
| Add a new root-cause gate | Rejected | The TypeScript/Bash gates and fixtures already own semantics; the persona only supplies their evidence. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Root-cause authority map: existing gate applies only to bugfix contracts and consumes `root_cause`, `repro`, `regression_guard`, and `pre_fix_failure_artifact`; no gate files are modified.
- Evaluator authority map: skill runner is `scripts/run-skill-evals.ts`; adoption profile uses `inspect-project-state` plus canonical `adopt --dry-run --json`; `evals/bdd2/**` and `scripts/run-bdd2-evals.ts` are forbidden.
- First focused run: 57 pass / 1 unrelated timing failure in skills CLI availability; isolated re-run of that exact test passed 1/1.
- Final focused suite: 70 pass / 0 fail across fleet installer, tooling, bootstrap, downstream runtime, and disposable skill-eval runtime.
- Full suite: 1149 pass / 1 skip / 0 fail, 11465 expectations across 102 files.
- Package/readiness smoke: six packaged fleet sources and twelve generated temporary-HOME targets.
- Internal exit review: initial BLOCKED verdict exposed the evaluator sandbox contradiction; after the disposable-only workspace-write revision and runtime test, re-review returned PASS with no P1/P2.
- Claude review attempt 1 (23:00:50-23:05:46 CST): two P1 and two P2 findings. P1s were resolved with mechanical disposable guard plus explicit root-cause tools; stale four-role todo wording was corrected; substring-only safety confidence was replaced by real runtime and negative-path tests. Re-review required.
- Claude review attempt 2 (23:14:07-23:17:37 CST): found swapped repo/HOME inputs were not rejected and adoption lacked the code-level preflight claimed publicly. The shared guard now rejects both swapped forms; adoption requires its read-only preflight and exact repo/HOME propagation. Re-review required.
- Claude review attempt 3 (23:20:34-23:26:05 CST): confirmed skills, swapped-input, and root-cause tool fixes, but found adoption's two-step preflight could still lose the validated values. Adoption now runs both existing commands inside one guarded function and a runtime test asserts identical canonical repo/HOME injection. Re-review required.
- Claude review attempt 4 (23:28:58-23:34:02 CST): found guarded skills incompatible with the checked-in sibling workspace default, ambient repo-harness source overrides leaking into child commands, and a dead preflight flag. Guarded skills now deterministically uses a repo-internal workspace, disposable commands scrub the three known source/helper/target overrides, tests inject the dangerous variable, and the dead flag was removed. Re-review required.
- Claude review attempt 5 was textually ambiguous, so a standalone clarification review (23:42:38-23:45:32 CST) was required. It found remaining git/grader subprocesses still inherited real HOME plus a symlink-ancestor escape. Disposable HOME/scrubbing is now threaded through every skill-runner subprocess, and boundary checks canonicalize the nearest existing ancestor for future output paths; hook/wrapper and symlink regression tests cover both.
- Claude review attempt 6 (23:48:28-23:53:14 CST) found config-provided env could reintroduce scrubbed overrides and manifest/config were read before containment checks. Scrubbing now applies after combining inherited/config env, and guarded mode canonicalizes repo-relative inputs then validates manifest/config paths before reading JSON; malicious config-env and symlinked-manifest regressions cover both.
- Final standalone Claude acceptance (23:56:00-00:01:03 CST): `No P1 or P2 findings.`
- Actual HOME closeout: after commit `8444092`, `scripts/install-agent-fleet.sh --force` installed six Claude Markdown and six Codex TOML projections. All 12 files compared byte-identical to repo authority; readiness reports both hosts `present` with no missing roles. The temporary rollback backup was removed only after exact readback succeeded.
- Architecture queue: pending 0; contract-assets and inspection-migration modules/workstreams record the six-role closeout; root request archived as no architecture change.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
