# Implementation Notes: design-options-proactive-choice

> **Status**: Active
> **Plan**: plans/plan-20260714-1353-design-options-proactive-choice.md
> **Contract**: tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md
> **Review**: tasks/reviews/20260714-1353-design-options-proactive-choice.review.md
> **Last Updated**: 2026-07-14 14:31
> **Lifecycle**: notes

## Design Decisions

- **Falsifier proof (before authoring)**: `src/cli/commands/docs.ts` (`listRuntimeDocs`/`resolveRuntimeDoc`) resolves `docs show <id>` by listing `.md` files under `assets/reference-configs/` at runtime (minus `AGENTS.md`/`CLAUDE.md`) and matching the id against the filename stem. There is no registration table. Confirmed with an existing id (`bun src/cli/index.ts docs show heartbeat-triage`) before authoring, then confirmed again after DO-01 (`bun src/cli/index.ts docs show design-options`, exit 0) with zero code changes. `docs show` reads from the CLI package's own bundled assets root (resolved from the running script's location via `SCRIPT_DIR`/`SOURCE_ROOT`), not from a downstream repo's local copy, so the command works for any adopted repo regardless of whether the doc is shipped locally. Falsifier holds: reachable/triggerable with zero new runtime machinery.
- **Style exemplars used for DO-01**: `assets/reference-configs/heartbeat-triage.md` (short procedure-doc shape: purpose + explicit negative-scope sentence, imperative steps) and `assets/reference-configs/agentic-development-flow.md` (routing-table row shape, `##` section rhythm, prose+list mix, no marketing language). `assets/reference-configs/global-working-rules.md` confirmed the repo's general imperative/no-fluff voice.
- **Lineage citations**: the contract's "Why" names "three sealed experiment rounds." Read all four candidate research docs and determined the three sealed *rounds* are BDD² Phase E (`docs/researches/20260713-bdd2-phase-e-closeout.md`), BDD3-EA1 (`docs/researches/20260714-bdd3-ea1-typed-evidence-authority-outcome.md`), and BDD3-PS1 (`docs/researches/20260714-bdd3-ps1-protected-shape-outcome.md`) — each a terminal Kill outcome doc. The direction adjudication (`docs/researches/20260713-bdd3-ea1-direction-adjudication.md`) is the connective decision doc that left the human-closure path open; it is cited separately from "the three." All four paths appear in the doc's `## Lineage` section.
- **Routing key naming (DO-02)**: added `agentic_development.routing.design_options_choice: "convention:design-options"` to `.ai/harness/policy.json`, placed after the existing `design_plan` key. Named `design_options_choice` (not `design_plan`, which already exists and means something different — an up-front UI/UX planning mode routed to the parent agent, vs. this proactive mid-task trigger) and not `design_options` alone (ambiguous with the doc id). Value follows the existing `<owner>:<mechanism>` colon-pair shape used by sibling values (`waza:think`, `parent-agent:geju`).
- **Root routing clause (DO-02)**: extended the existing sentence in `CLAUDE.md`/`AGENTS.md` (`## Operating Rules`, the line beginning "Route product discovery and complex/design planning...") with one trailing sentence: "Route a proactive multi-direction visual/UX choice mid-task to the design-options convention (`repo-harness docs show design-options`)." No new section added; both files kept byte-identical on this line (verified with `diff` before and after).
- **workflow-contract.v1.json / .ai/harness/workflow-contract.json — judged NOT to sync.** `assets/workflow-contract.v1.json`'s `agenticDevelopment.routing` is a byte-mirror of the same 6 routing keys, but it is governed by a *closed*, fixed-shape TypeScript interface (`scripts/workflow-contract.ts:42-50`: `productDiscovery`, `complexEngineeringPlan`, `designPlan`, `smallOrMediumPlan`, `bugOrRegression`, `postImplementationReview` — no index signature, no 7th field). Adding a 7th key there in a structurally sound way requires editing that interface, and `scripts/workflow-contract.ts` is not in this contract's Allowed Paths. Appending an untyped JSON key the type system and no consumer reads would be exactly the kind of undocumented drift the repo's own Code Optimization Principles forbid ("every other representation must be a deterministic projection with a drift check"). Declined the sync per DO-02's own conditional ("sync them only if they do [carry routing, within scope]"); `.ai/harness/policy.json` (a loosely-typed, deep-merged `JsonObject`, not backed by a fixed interface) is the sole routing mirror this task-package changes. `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json` remain untouched and therefore still byte-identical to each other (verified with `diff`), satisfying `tests/workflow-contract.test.ts`'s parity assertion.
- **Adoption stub decision (DO-03)**: added `"design-options.md"` to the `minimal` allow-list `Set` in `addReferenceOperations()` (`src/core/adoption/standard-plan.ts`), placed immediately after `"agentic-development-flow.md"`. That function ships/stubs a reference-config into a downstream repo's local `docs/reference-configs/` under the default `minimal-agentic` documentation profile only when the filename is in this allow-list; outside the list, a doc is not shipped locally until profile `full*`. `docs show design-options` itself needs no stub (see falsifier proof above), so the stub is a discoverability nicety, not a functional dependency. Chose to add it for parity with `agentic-development-flow.md` (which is in the allow-list and now contains the routing row pointing at `design-options.md`): shipping the routing table locally but not its target doc would leave a dangling local reference for any reader browsing `docs/reference-configs/` directly instead of running the CLI. Verified with `bun src/cli/index.ts adopt --repo . --dry-run --json`: `docs/reference-configs/design-options.md` now appears as a planned/skipped `writeFile` operation.
- **Test-set updates**: none of the seven content-contract tests named in Allowed Paths required edits — all pass unmodified against the new doc/routing/stub (`tests/output-parity.test.ts`, `tests/prompt-routing-explicit-first.test.ts`, `tests/action-command-skills.test.ts`, `tests/workflow-contract.test.ts`, `tests/global-working-rules-distribution.test.ts`, `tests/cli/docs.test.ts`, `tests/cli/adoption-plan.test.ts`: 110 pass / 0 fail across all seven). None of them enumerate an exhaustive/exact reference-config file set (all use `.toContain`/`.toBe(true)`/lower-bound checks), so the new doc and stub entry do not collide with any fixed expectation.

## Verification

- `bun test` full suite: 1405 pass, 1 skip, 1 fail, 11986 expect() calls, 1407 tests across 111 files (478.41s).
- The 1 fail is `tests/retired-planning-provider.test.ts` ("is absent from active product and generated surfaces"): it finds the literal string `gstack` inside `assets/skill-version.json` line 205, in a changelog *description* field reading "...removes gstack and the Human Review Card dual authority" — a self-referential mention (the entry about removing gstack contains the word). Proven pre-existing and unrelated to this task: `git log --oneline 1317bad2..HEAD -- assets/skill-version.json` shows the only touching commit is `ca15eff1 chore(release): prepare 0.10.0`, already part of the worktree's inherited history before this session made any edit (this session made zero commits before this check; `git status --short assets/skill-version.json` shows no working-tree changes to that file). `assets/skill-version.json` and `tests/retired-planning-provider.test.ts` are not in this contract's Allowed Paths and not among the 7 named content-contract tests or the 3 `exit_criteria.tests_pass` files. Left unfixed as out of scope; flagged here for the orchestrator/gatekeeper to route separately (release-changelog wording, not design-options).
- The 1 skip and the `tests/skill-hooks.test.ts` / hook "unknown route" / "missing script" lines above the summary are pre-existing fixture/hook-harness noise unrelated to reference-configs, routing, or adoption — none reference `design-options`, `agentic-development-flow.md`, `policy.json` routing, or `standard-plan.ts`.
- All 7 named content-contract tests pass in isolation and inside the full run: `tests/output-parity.test.ts`, `tests/prompt-routing-explicit-first.test.ts`, `tests/action-command-skills.test.ts`, `tests/workflow-contract.test.ts`, `tests/global-working-rules-distribution.test.ts`, `tests/cli/docs.test.ts`, `tests/cli/adoption-plan.test.ts` (110 pass / 0 fail, 919 expect() calls).
- `bun run check:type`: clean, no output.
- `bun src/cli/index.ts docs show design-options`: resolves, exit 0.
- `bun src/cli/index.ts adopt --repo . --dry-run`: exit 0; `docs/reference-configs/design-options.md` appears as a planned `writeFile` operation (confirms the DO-03 stub decision took effect).
- `bash scripts/check-task-sync.sh`: exit 0 ("Repo changes include synchronized tasks/ updates").
- `bash scripts/check-architecture-sync.sh`: exit 0 (`mode=advisory gate_min_severity=medium changed_capabilities=4 blocking=0`).
- `repo-harness run check-task-workflow --strict`: exit 0 (`[brain] OK`, `[BrainSync] OK`, `[workflow] OK`) — required running `bash scripts/sync-brain-docs.sh --changed docs/reference-configs/agentic-development-flow.md` first, since that file has a registered `sync.direction=repo-to-brain` manifest entry (`.ai/harness/brain-manifest.json`, id `agentic-development-flow`) and editing it without a normal PostEdit-hook session left the local brain vault mirror (`~/Library/Mobile Documents/com~apple~CloudDocs/brain/repo-harness/references/agentic-development-flow.md`) stale. The sync writes only to that external, non-repo, non-git-tracked vault file — no repo path was touched by it.

## Deviations From Plan Or Spec

- The contract's `allowed_paths` lists `tests/adoption-plan.test.ts`; the actual file at that logical location is `tests/cli/adoption-plan.test.ts` (there is no `tests/adoption-plan.test.ts` at the repo root). Treated as the intended file (contract path omits the `cli/` prefix) since it is the only adoption-plan test in the repo and its content matches the contract's own description ("only if the stub changes adoption expectations"). No edits were needed to it either way (see Design Decisions).
- Did not touch `assets/workflow-contract.v1.json` / `.ai/harness/workflow-contract.json` despite them being listed as conditionally in-scope — judged the condition ("only if routing is mirrored there") not satisfied in a way reachable within Allowed Paths; see Design Decisions for the full reasoning.
- Did not touch `src/core/adoption/standard-plan.ts`'s `defaultPolicy()` `agentic_development.routing` object (the routing map shipped to *new* downstream adopters) — only this self-hosted repo's own committed `.ai/harness/policy.json` was extended, per DO-02's explicit scope and the Allowed Paths note restricting `standard-plan.ts` edits to "only the reference-config shipped-set line."

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Sync `assets/workflow-contract.v1.json` + `.ai/harness/workflow-contract.json` routing vs. leave untouched | Leave untouched | Closed 6-field TS interface in `scripts/workflow-contract.ts` (out of Allowed Paths); appending an untyped key would be silent, unread drift, not a real mirror |
| Add `design-options.md` to the adoption minimal-profile stub set vs. leave `full`-profile-only | Add it | Parity with `agentic-development-flow.md` (already in the minimal set, now contains the routing row pointing at this doc); avoids a locally dangling reference for minimal-profile downstream repos that browse `docs/reference-configs/` directly |
| New routing key name `design_options_choice` vs. reusing `design_plan` vs. bare `design_options` | `design_options_choice` | `design_plan` already means a different thing (up-front UI/UX planning mode, parent-agent-owned); bare `design_options` risks reading as the doc id rather than a work-type key |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
