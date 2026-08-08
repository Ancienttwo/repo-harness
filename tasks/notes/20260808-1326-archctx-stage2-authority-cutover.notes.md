# Implementation Notes: archctx-stage2-authority-cutover

> **Status**: Active
> **Plan**: plans/plan-20260808-1326-archctx-stage2-authority-cutover.md
> **Contract**: tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md
> **Review**: tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md
> **Last Updated**: 2026-08-08 14:20
> **Lifecycle**: notes

## Round-Trip Gate (Falsifier, run before any consumer touch)

One-shot `scripts/migrate-capabilities-to-archcontext.ts` generated the 10 nodes from the
untouched registry and compared the two resolutions field by field
(`domain`, `name`, `prefixes` in order, `contract_files`, `architecture_module`,
`workstream_dir`, `lsp_profile`, `verification_hints`). Verbatim output:

```
[round-trip] registry capabilities: 10
[round-trip] node capabilities:     10
[round-trip] OK public-surface-action-commands prefixes=1 module=docs/architecture/modules/public-surface/action-commands.md workstream=tasks/workstreams/public-surface/action-commands
[round-trip] OK public-surface-adoption prefixes=6 module=docs/architecture/modules/public-surface/adoption.md workstream=tasks/workstreams/public-surface/adoption
[round-trip] OK public-surface-root-router prefixes=5 module=docs/architecture/modules/public-surface/root-router.md workstream=tasks/workstreams/public-surface/root-router
[round-trip] OK runtime-harness-hook-adapters prefixes=6 module=docs/architecture/modules/runtime-harness/hook-adapters.md workstream=tasks/workstreams/runtime-harness/hook-adapters
[round-trip] OK runtime-harness-mcp-sidecar prefixes=7 module=docs/architecture/modules/runtime-harness/mcp-sidecar.md workstream=tasks/workstreams/runtime-harness/mcp-sidecar
[round-trip] OK runtime-mcp-general-repo-access prefixes=6 module=docs/architecture/modules/runtime-mcp/general-repo-access.md workstream=tasks/workstreams/runtime-mcp/general-repo-access
[round-trip] OK verification-codegraph-readiness prefixes=5 module=docs/architecture/modules/verification/codegraph-readiness.md workstream=tasks/workstreams/verification/codegraph-readiness
[round-trip] OK verification-evals-checks prefixes=13 module=docs/architecture/modules/verification/evals-checks.md workstream=tasks/workstreams/verification/evals-checks
[round-trip] OK workflow-engine-contract-assets prefixes=19 module=docs/architecture/modules/workflow-engine/contract-assets.md workstream=tasks/workstreams/workflow-engine/contract-assets
[round-trip] OK workflow-engine-inspection-migration prefixes=4 module=docs/architecture/modules/workflow-engine/inspection-migration.md workstream=tasks/workstreams/workflow-engine/inspection-migration
[round-trip] PASS: nodes and registry resolve identically
```

The migration script retired with the registry in this same package (it is not in the
final diff), per the plan's "removed-with-legacy-path" semantics.

Two deliberate, post-gate divergences:

- Capability **order** is not part of the gate. The JSON authority preserved file order;
  `capabilityRegistryFromArchcontextNodes` sorts by id. Every consumer resolves by
  longest prefix with a deterministic id/prefix tie-break (`matchCapabilityPath`), so
  order carries no meaning. Prefix order *inside* a capability is compared and equal.
- `workflow-engine-contract-assets` no longer includes `.ai/context/capabilities.json`;
  that prefix pointed at the retired file itself, and `validateRegistryEffects` requires
  prefixes to exist. It was replaced by `.archcontext/model/nodes/**`, the successor
  authority artifact, so the same capability keeps owning capability-authority edits and
  no path becomes unmapped.

## Consumer Census And Disposition

Grep base: `rg -n --hidden -uu "capabilities\.json"` across the repo. After the fixes,
every surviving hit outside the excluded globs below is accounted for in one of the two
tables: it is either registry-mode implementation (the mode is still supported), a
downstream template/fixture, or one deliberately retained downstream-scaffold sentence.

**This is not a claim that no stale registry statement remains in the repo.** It does not
hold for `docs/architecture/modules/**`, which is excluded for a scope reason rather than
a historical-record reason — see "Excluded for scope" below.

Non-consumer exclusion is a re-runnable glob list, not a prose judgment. A path is a
historical record (append-only or frozen artifact, never read at runtime) iff it matches
one of:

```
tasks/archive/**
plans/archive/**
plans/*.md                          # superseded/completed plan bodies, except the active plan
plans/sprints/**
tasks/contracts/**                  # except this slice's own contract
tasks/reviews/**                    # except this slice's own review
tasks/notes/**                      # except this slice's own notes
docs/researches/**
docs/CHANGELOG.md
docs/architecture/snapshots/**
evals/skill-routing/final-subject-freeze.json
.claude/templates/**                # mirrors of assets/templates, regenerated by adoption
docs/architecture/modules/**        # excluded for SCOPE, not because it is clean -- see below
```

#### Excluded for scope: `docs/architecture/modules/**` (27 hits across 9 of the 10 docs)

Excluded because this slice's Goal freezes the human regions of these documents
byte-for-byte, and their machine regions are archctx's to reproject (handoff §2 partition,
now delimited by the `archctx:intro|p1|p2` markers this slice added). Editing either
region here would violate the contract: the human region because it is frozen, the machine
region because reprojection owns it. The exclusion means "out of this slice's authority",
NOT "no residue".

- **17 hits inside markers** (`archctx:intro` / `archctx:p1` / `archctx:p2` — the
  `Matched Prefixes` / `Verification hints` provenance lines, plus the P1/P2 diagram and
  table cells that name the registry): these refresh when archctx reprojects the machine
  sections. No manual action needed. (Counted by line: 26 lines / 27 occurrences total =
  17 in-marker + 8 frozen human-region + 1 dated `§4` line. An earlier revision of this
  bullet said 6; that was wrong and is corrected here.)
- **8 hits outside markers, present tense, in the frozen human region** — verbatim list as
  located by the acceptance review:

```
docs/architecture/modules/workflow-engine/contract-assets.md:297   [### 3.2 必须守住的不变量 — I4 行,最硬]
docs/architecture/modules/workflow-engine/contract-assets.md:336
docs/architecture/modules/workflow-engine/contract-assets.md:589
docs/architecture/modules/workflow-engine/inspection-migration.md:274
docs/architecture/modules/runtime-harness/hook-adapters.md:417
docs/architecture/modules/runtime-harness/hook-adapters.md:483
docs/architecture/modules/runtime-mcp/general-repo-access.md:351
docs/architecture/modules/public-surface/root-router.md:260
```

  The hardest is `contract-assets.md:297`, the I4 invariant row asserting
  `` `.ai/context/capabilities.json` 是 capability 的唯一 runtime 权威 `` — after this
  cutover that is a false present-tense statement, and unlike the marker-internal hits it
  has no automated refresh path. Tracked as a named follow-up below.
- `contract-assets.md:414` sits in the `## 4. 历史决策记录（append-only）` dated section,
  which carries the document's own staleness disclaimer, so it is not listed.

Re-run the exclusion with:

```bash
rg -n --hidden -uu "capabilities\.json" \
  --glob '!.git/**' --glob '!node_modules/**' \
  --glob '!tasks/archive/**' --glob '!plans/archive/**' \
  --glob '!plans/*.md' --glob '!plans/sprints/**' \
  --glob '!tasks/contracts/**' --glob '!tasks/reviews/**' --glob '!tasks/notes/**' \
  --glob '!docs/researches/**' --glob '!docs/CHANGELOG.md' \
  --glob '!docs/architecture/snapshots/**' \
  --glob '!evals/skill-routing/final-subject-freeze.json' \
  --glob '!.claude/templates/**' \
  --glob '!docs/architecture/modules/**'
```

Everything that survives that filter is either in the Migrated table or in the
"Deliberately NOT changed" table below.

### Migrated (this repo's own state / authority-aware behavior)

| Surface | Disposition |
|---|---|
| `.ai/harness/policy.json` | `context.capability_source` -> `"archcontext"`. `capability_registry_file` kept (see boundary note). |
| `.ai/context/capabilities.json` | Deleted (`git rm`). |
| `.ai/context/context-map.json` | `root_context_files` entry -> `.archcontext/model/nodes`. |
| `src/effects/state/resolve-effective-state.ts` | New `capabilitySourceMode()` (validated eagerly in `validateWorkflowPolicy`), `loadCapabilityRegistry()` branches on it, node YAML read via `Bun.YAML` with a fail-closed guard, `capabilityAuthorityHash()` / `capabilityAuthoritySourcePaths()` feed `authority_revision` and `collectStateInputs`. Registry-mode hashing is byte-identical (`sourceHash` of the single file), so existing state fixtures/goldens are unaffected. |
| `scripts/check-task-workflow.sh` | New `capability_source()` reader; `artifacts.requiredFiles` skips `.ai/context/capabilities.json` when the repo is not in registry mode, and requires `.archcontext/model/nodes` instead. Workflow contract JSON untouched. |
| `scripts/ensure-task-workflow.sh` | New `capability_source()` reader; the empty-registry seed is gated on registry mode. Without this the seeder resurrects `capabilities.json` on the next `ensure-task-workflow` run. |
| `src/core/adoption/standard-plan.ts` | `capabilitySourceOf(policy)` gates the `ifMissing` capabilities.json write operation. Same resurrection hazard via `repo-harness init`. |
| `scripts/select-agent-context-blocks.sh` | Resolver attempt moved out of the `-f capabilities.json` gate (the resolver already reads whichever authority policy selects). The direct-JSON path stays behind the registry-file gate as the no-Bun path. |
| `src/cli/commands/capability-context.ts` | `sync --apply` no longer writes the JSON registry under archcontext; contract-file drift now raises `CapabilitySourceError` naming the node to fix. `status.registry_file` and the generated source-map `positioning` report the active authority path. |
| `scripts/workstream-sync.sh` | Two message/template strings that named the registry file now name the resolver / policy selector. |
| `CLAUDE.md`, `AGENTS.md` | Canonical-file line and the "source of truth for capability prefixes" rule now name `.archcontext/model/nodes/*.yaml` under `capability_source: "archcontext"`. Both files kept identical. |
| `docs/spec.md` | Capability glossary entry now names the policy-selected authority instead of the file. |
| `.gitignore` | `.archcontext/` blanket ignore replaced with `.archcontext/*` + re-includes down to `.archcontext/model/nodes/`. `git check-ignore -v` on a node file returns no match. |
| `assets/templates/helpers/*` | Regenerated via `bun scripts/sync-helper-sources.ts --write` (4 helpers changed); `--check` green. |
| `tests/session-context.test.ts` | Updated for the thinned architecture card. |
| `tests/create-project-dirs.runtime.test.ts:456-478` | The four-seeder agreement loop asserted this repo's own tracked policy is `capability_source: "registry"`. Split: the three seeders (project-init-lib bash policy, `defaultPolicy()`, ensure-task-workflow POLICY_EOF) still assert `registry`; this repo asserts `archcontext` plus nodes-present / registry-absent. The shared `capability_source_rule` string is still asserted identical across all four. |
| `assets/AGENTS.md:17`, `assets/CLAUDE.md:17` | Machine-managed CAPABILITY CONTEXT block, `workflow-engine-contract-assets`. Regenerated by `capability-context sync --apply`; Positioning now names `.archcontext/model/nodes`. |
| `scripts/AGENTS.md:17`, `scripts/CLAUDE.md:17` | Same block, `workflow-engine-inspection-migration`. |
| `assets/hooks/AGENTS.md:29`, `assets/hooks/CLAUDE.md:29` | Same block, `runtime-harness-hook-adapters`. |
| `.ai/hooks/AGENTS.md:29`, `.ai/hooks/CLAUDE.md:29`, `.ai/hooks/.projection.json` | Projection of `assets/hooks/` written by `bun scripts/sync-hook-sources.ts --write`; never hand-edited. |
| `docs/architecture/index.md:26,78,92,183,210` | Five authority sentences rewritten to name the policy-selected authority, matching `docs/spec.md:127-133` and the root contracts. |
| `docs/architecture/index.md:173` | Kept naming `.ai/context/capabilities.json` because the row describes what `project-init-lib.sh` writes into **downstream** repos; annotated as registry mode and explicitly unrelated to this repo's authority. |
| `docs/architecture/domains/{public-surface,runtime-harness,verification,workflow-engine}.md:3` | `> **Source**:` line aligned with the template `workstream-sync.sh:232` now emits (`repo-harness run capability-resolver`). |

### Deliberately NOT changed (downstream scaffold defaults)

| Surface | Reason |
|---|---|
| `assets/workflow-contract.v1.json` / `.ai/harness/workflow-contract.json` `artifacts.requiredFiles` | The two files are byte-identical by test (`tests/workflow-contract.test.ts`), and the requiredFiles assertions in `tests/workflow-contract.test.ts` / `tests/bootstrap-files.test.ts` read the **asset** (the downstream template). Removing the entry would relax the artifact contract for every generated repo. The authority selector belongs in the checker, not in the shared manifest — so `check-task-workflow.sh` filters instead. |
| `scripts/lib/project-init-lib.sh` (`pi_write_capability_registry`, `pi_context_block_candidates`, `pi_context_map_discoverable_entries`, policy defaults) | This is the new-repo scaffold path (`create-project-dirs.sh` / `init-project.sh`), exercised by `tests/scaffold-parity.test.ts` and `tests/create-project-dirs.runtime.test.ts` in temp dirs. New repos keep registry mode. |
| `src/core/adoption/standard-plan.ts` policy/context-map **defaults** | Same reason: defaults describe a registry-mode repo. Only the seed *operation* is gated, and only by the target repo's own `capability_source`. |
| `scripts/capability-config.ts` | Stage 0 already fails closed under archcontext at `main()`; its registry-writing paths are unreachable in this repo. Its retirement is Stage 3. |
| `scripts/check-tarball-install-smoke.sh`, `scripts/session-context-packet-panel.ts` | Both build registry-mode fixture repos; unrelated to this repo's authority. |
| Test fixtures under `tests/**` that write `.ai/context/capabilities.json` | They exercise registry mode, which remains a supported authority. `tests/create-project-dirs.runtime.test.ts` was the only file that also asserted *this* repo's own state; it is in the Migrated table. |
| `docs/reference-configs/external-tooling.md:167,697`, `assets/reference-configs/external-tooling.md:167,697` | `:697` is the `capability_source` mode table and correctly labels `registry` as the **default**; `:167` is generic user-level runtime doc prose. These ship to every adopted repo, which stays on registry mode. |
| `docs/reference-configs/harness-overview.md:43,194`, `assets/reference-configs/harness-overview.md:43,194` | Generic runtime documentation describing the default adopted-repo shape. |
| `assets/templates/contract.template.md:74`, `.claude/templates/contract.template.md`, `scripts/plan-to-todo.sh:499` | Default `allowed_paths` seed emitted into newly created contracts in downstream (registry-mode) repos. |
| `assets/templates/helpers/{capability-config,capability-resolver,check-task-workflow,ensure-task-workflow,plan-to-todo,select-agent-context-blocks}.ts\|sh` | Projections of `scripts/*`, regenerated by `sync-helper-sources`; they carry the registry path as a mode constant, not as an authority claim. |

### Boundary judgment recorded (template vs. this-repo assertion)

`.ai/hooks/` was added to this contract's `allowed_paths` on explicit coordinator
authorization during the gatekeeper fix round: it is a tool-written projection of
`assets/hooks/` (`scripts/sync-hook-sources.ts`), and the capability-context block inside
it cannot be refreshed without writing there.

`AGENTS.md` and `CLAUDE.md` were added to this contract's `allowed_paths` on the same
kind of explicit coordinator authorization, during the acceptance round. Both root
contract files carry this repo's capability-authority declaration (the canonical-file
line and the "source of truth for capability prefixes" rule), so editing them is inside
this slice's Goal and the census lists them under Migrated. Their absence from
`allowed_paths` was a contract-drafting omission, not a scope overrun: the
`verify-sprint` allowed_paths gate reported `outside: ["AGENTS.md", "CLAUDE.md"]`.
Reverting the two four-line edits was rejected — it would recreate exactly the residue
this work-package exists to remove, namely a root routing contract pointing at the
deleted `.ai/context/capabilities.json`.

`.ai/harness/policy.json` keeps `context.capability_registry_file`. Removing it does not
stick: `pi_merge_json_defaults` / `deepMergeDefaults` merge defaults *under* current
values, so a re-run of migration/init re-adds any key the seeder declares. Keeping the
key and making `capability_source` the sole selector is the fail-closed shape — the path
constant is inert under archcontext, and `resolve-effective-state` only consults
`capability_registry_file` in registry mode. Recorded here rather than silently deciding.

## Deviations From Plan Or Spec

- Plan item 4 said "thin the post-edit drift card". The only user-visible architecture
  card on the hook surface is `architectureQueuePendingContext` in
  `src/cli/hook/session-context.ts` (SessionStart rendering of the requests the post-edit
  cascade writes); `scripts/architecture-queue.sh` itself only writes request files and
  the `[ArchitectureDrift]` stdout contract consumed by `mutation-observed.ts`. The card
  was thinned there: 8 lines with a fenced command block -> a 3-line checkpoint nudge.
  The `# Architecture Queue` header was kept because
  `session-context.ts`'s budget-block regex matches on it. `check-architecture-sync`
  gating logic untouched, as scoped.

## Deferred / Out Of Scope (found, not fixed)

- `.archcontext/` is not in `WORKFLOW_SURFACE_DIR_PREFIXES`
  (`src/effects/review/diff-fingerprint.ts:345`), so node YAML edits classify as
  implementation surface while `.ai/context/capabilities.json` classified as workflow
  surface. Adding it is a two-line change in TS, but the drift check in
  `scripts/sync-hook-sources.ts:131` requires the matching case-pattern in
  `assets/hooks/pre-edit-guard.sh` **and** its projection into `.ai/hooks/`, which is
  outside this contract's `allowed_paths`. Not attempted; needs its own slice or an
  allowed_paths amendment.
- `check-architecture-sync` freshness delegation to the archctx CLI stays out of scope
  (local CLI is npm 0.3.0 without the freshness gate).
- **Human-region registry statements in `docs/architecture/modules/**` need a manual
  editorial pass.** The 8 present-tense hits listed under "Excluded for scope" above sit
  outside the `archctx:*` markers, so archctx reprojection will never touch them, and this
  slice's Goal freezes that region byte-for-byte — so neither automation nor this
  work-package can correct them. Name the follow-up on
  `docs/architecture/modules/workflow-engine/contract-assets.md:297` first: the I4
  invariant row states `.ai/context/capabilities.json` is the sole runtime capability
  authority, which is now false, and it is the only one of the eight with **no** automated
  backstop of any kind (the other seven are provenance/history phrasing whose wrongness is
  cosmetic; I4 is a stated invariant a reader would act on). Entry point:
  `### 3.2 必须守住的不变量` in that file.

## Follow-ups for the PR body

Three named follow-ups, all deliberately out of this work-package:

1. `check-architecture-sync` freshness delegation to archctx (gated on the archctx §3.5
   release plus a local CLI newer than npm 0.3.0).
2. `.archcontext/` classification in `WORKFLOW_SURFACE_DIR_PREFIXES`
   (`src/effects/review/diff-fingerprint.ts:345`) plus the `pre-edit-guard.sh` case-pattern
   and its `.ai/hooks/` projection, so capability-node edits classify as workflow surface
   the way `capabilities.json` edits did.
3. Manual editorial pass over the 8 present-tense registry statements in the frozen human
   regions of `docs/architecture/modules/**`, starting with the I4 invariant row at
   `contract-assets.md:297`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Remove `.ai/context/capabilities.json` from the shared workflow contract `requiredFiles` | Rejected | The asset is the downstream template and is byte-identical to the installed copy by test; it would relax the artifact contract for every generated repo. |
| Make `requiredFiles` conditional inside the contract JSON | Rejected | Adds branching to a static manifest schema for one repo's authority choice. |
| Filter `requiredFiles` by `capability_source` in `check-task-workflow.sh` | Chosen | The selector already exists in policy; registry-mode repos see byte-identical behavior. |
| Leave `resolve-effective-state` registry-only | Rejected | Under archcontext it would report `capability:registry:absent` and `capabilityCount: 0` — a silent risk-profile degradation, exactly the fallback shape the repo forbids. |
| Drop `capability_registry_file` from policy | Rejected | Seeder merge semantics re-add it; the selector must be the authority, not the presence of a path constant. |

## Open Questions

- None blocking.

## Observation (non-blocking, raised by gatekeeper)

`verify-sprint` reports only the first failure class, which hid a real gate failure for
two full runs. The run that failed on the `closeout-runner-guardrails` load flake
recorded `failure_class: "contract_failure"` while its snapshot already carried
`allowed_paths_check.outside: ["AGENTS.md", "CLAUDE.md"]`; the allowed_paths breach only
surfaced as `failure_class` once the flaky command went green. A multi-failure run should
surface every failing gate, not just the first class, or a flaky command can mask a
deterministic scope violation indefinitely. Diagnostic shape only — no gate is wrong, and
fixing it is outside this slice.

`runCapabilityContextSync` (`src/cli/commands/capability-context.ts:472-505`) is a
partial-apply shape under archcontext when `--pending --apply` meets contract-file drift:
the per-capability contract blocks are written inside the loop, and the
`CapabilitySourceError` fires afterwards, so the blocks land, the pending queue is not
cleared, and the process exits non-zero. That is idempotent (re-running rewrites the same
blocks) and fails loudly rather than silently recreating the registry, so the direction is
right, but it is a real partial-application window. `capability-context status` currently
reports 6 capabilities as `needs-normalize`
(`public-surface-action-commands`, `public-surface-adoption`,
`runtime-harness-mcp-sidecar`, `runtime-mcp-general-repo-access`,
`verification-codegraph-readiness`, `verification-evals-checks`), so this path will be hit
for real the next time one of them is synced. Not fixed here: the fix is either moving the
drift check ahead of the write loop or teaching the loop to skip drifted capabilities, and
neither is in this slice's scope.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- `bun run check:type` -> exit 0
- `bun test` -> `2260 pass, 0 fail, Ran 2261 tests across 179 files. [925.03s]`, exit 0
- `bun src/cli/index.ts init --repo . --dry-run` -> `operations: 0 total, 0 planned, 0 skipped`
- `bash scripts/check-architecture-sync.sh` -> exit 0 (advisory WARN: 2 pre-existing
  pending drift requests, `root.md` and `workflow-engine-contract-assets.md`; gating
  unchanged by this slice)
- `bash scripts/check-task-sync.sh` -> `No changes detected.`, exit 0
- `bash scripts/check-deploy-sql-order.sh` -> `[deploy-sql] OK`
- `REPO_HARNESS_SOURCE_ROOT=$PWD bun src/cli/index.ts run check-task-workflow --strict`
  -> `[workflow] OK`, exit 0
- `bun scripts/capability-resolver.ts list --format text` -> 10 capabilities
- `bun scripts/capability-resolver.ts validate --format text` -> `[CapabilityResolver] OK`
- `bun scripts/sync-helper-sources.ts --check` -> `projection OK: 52 helpers`
- `git check-ignore -v .archcontext/model/nodes/<node>.yaml` -> no match (exit 1)
- Marker insertion audit: `git diff --numstat -- docs/architecture/modules/` -> `12 0` for
  all 10 docs, and a `git diff -U0` filter for any line that is neither a marker nor blank
  returned nothing.

### Runtime-resolution caveat (not a red)

Plain `bun src/cli/index.ts run check-task-workflow --strict` reports
`Missing required file: .ai/context/capabilities.json` because this machine exports
`REPO_HARNESS_SOURCE_ROOT=/Users/ancienttwo/.bun/install/global/node_modules/repo-harness`
(installed 0.13.2), and `resolveHelperRuntime` (`src/cli/runtime/helper-runner.ts:277`)
honours that env var over the worktree. The installed helper predates the
`capability_source` filter. Running the same gate against the worktree runtime
(`REPO_HARNESS_SOURCE_ROOT=$PWD`) or the helper directly
(`bash scripts/check-task-workflow.sh --strict`) is `[workflow] OK`. This is an
installed-version lag, not a break introduced by this slice.

### Flaky test observed (unrelated)

One full-suite run failed
`tests/unit/closeout-runner-guardrails.test.ts` -> "caller-only SIGTERM makes the
supervisor clean its group and release its token" on a 2000 ms `waitForPath` deadline
under load. In isolation the file is 24/24 green, and the subsequent full run was
2260/0. No capability or authority code is on that path.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Candidate for `tasks/lessons.md` after a second occurrence: a policy key cannot be
  retired by deleting it from an adopted repo's `policy.json` — the adoption/ensure
  merge re-adds every default the seeder declares. Retirement has to happen in the
  seeder, or the key has to be made inert behind an explicit selector.
