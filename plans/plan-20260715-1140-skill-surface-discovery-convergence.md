# Plan: Skill Surface & Discovery Convergence

> **Status**: Executing
> **Direction Approval**: Approved
> **Activation Gate**: Promote machine status to `Approved` only after LSC, HRD, and EPC are independently merged/pushed and the exact post-EPC `origin/main` SHA is pinned — satisfied 2026-07-23: EPC closed 13/13 (PR #125), fresh fetch verified `origin/main == main == 555524c1`, no active EPC writer anywhere, cross-package projection-drift closeout re-verified green (21/21)
> **Created**: 20260715-1140
> **Slug**: skill-surface-discovery-convergence
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: `/Users/kito/.codex/attachments/c8cac0f2-0f2f-44c9-b640-fdb5923aa041/pasted-text.txt`
> **Discovery Audit Baseline**: `main@af6d5216c2cd5adf2f672636a8308a309f0f5adb`
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **SSD Execution Baseline**: `POST_EPC_SHA = origin/main@555524c1aff9ff8195dd744ea209fb8cc673d817` (pinned 2026-07-23 at fresh fetch per R1, after EPC-09 merged via PR #125; the SSD contract records this pin and its own worktree base SHA)
> **Upstream Dependency**: `ESA@3b33cea2 (Done, PR #79) -> LSC (Done 8/8) -> HRD (Done, closeout PR #108) -> EPC (Done 13/13, PR #125) -> SSD (this package)`
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: Manifest/profile projection parity, bilingual Skill-routing evidence, disposable-HOME host retirement, package smoke, and full repo gates must agree on one frozen subject.
> **Rollback Surface**: Revert this work-package and reinstall the prior package/profile; never remove unowned or modified host Skill content.
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260715-archi-research.md`, `docs/researches/20260715-skill-surface-discovery-audit.md`, plus the Source Ref above
> **Task Contract**: `tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md`
> **Task Review**: `tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md`
> **Implementation Notes**: `tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md`
> **Release Boundary**: The next minor release after independent LSC, HRD, and EPC closeout. Do not present public Skill-name removal as a `0.10.x` patch.

This work-package converges Skill classification, rule ownership, profile discovery, provider adapters, and retirement safety. It does not optimize for the smallest possible directory count. It optimizes for one rule owner per workflow and a bounded, testable host discovery surface.

## Agentic Routing

- Selected route: planning
- Routing reason: The requested output is a decision-complete execution plan for a high-risk public discovery and installer migration; implementation is approved but remains dependency-blocked behind LSC, HRD, and EPC.
- Due diligence:
  - P1 map: Root router, facade catalog, installer/profile projection, host runtime installation, provider Skills, ChatGPT projections, evals, and workflow artifacts were traced from current source.
  - P2 trace: The real profile install -> Skill selection -> ownership snapshot -> host projection -> probe -> state commit path was followed end to end.
  - P3 decision rationale: Establish manifest authority without behavior change first; converge rule owners second; perform one atomic public cutover only after all replacement packages and transaction paths are ready.

## Workflow Inventory

- Active plan in this worktree: this plan (activated 2026-07-23 after EPC closeout)
- Plan file: `plans/plan-20260715-1140-skill-surface-discovery-convergence.md`
- Future contract: `tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md`
- Future review: `tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md`
- Future implementation notes: `tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority after the dependency gate: the future contract's `allowed_paths`
- Execution isolation after the dependency gate: `repo-harness run plan-to-todo --plan plans/plan-20260715-1140-skill-surface-discovery-convergence.md` must create or select an isolated `codex/skill-surface-discovery-convergence` worktree from the exact post-EPC `origin/main` SHA.
- Concurrency rule: `.ai/harness/active-plan` and `.ai/harness/active-worktree` remain the execution authority. Do not infer ownership from the newest plan filename.

### Current no-touch boundary

ESA completed through PR #79; LSC, HRD, and EPC all closed in independent work-packages (EPC 13/13 via PR #125, `POST_EPC_SHA = 555524c1` pinned above). No upstream writer remains; SSD is the active package.

SSD absorbs no EPC runtime, compatibility, or migration work. Never absorb unrelated dirty or untracked WIP from the root checkout; the user's `repo-harness-wt-terminal-plans-sweep` worktree is out-of-scope WIP and must not be touched.

## Goal

Ship one next-minor public-surface migration that:

1. makes `assets/skill-commands/manifest.json` the runtime authority for Skill package classification and host/profile discovery projection;
2. reduces rule owners from 25 current Skill-like sources to 10 canonical packages without forcing every package into default discovery;
3. moves deterministic Git scope capture, provider execution, timeout, and transcript recovery out of Skill Markdown;
4. removes ChatGPT inline/checked-in prose drift;
5. retires old package-owned names transactionally, without steady-state aliases or dual reads;
6. proves routing quality, exact discovered sets, rollback, package projection, and repo workflow gates against one frozen subject.

## Non-goals

- No change to Effective State protocol, authority precedence, risk calculation, or PreToolUse security floors.
- No SSD implementation before LSC, HRD, and EPC are independently merged/pushed and the exact post-EPC `origin/main` SHA is pinned.
- No public CLI subcommand renames and no MCP tool renames.
- No change to the `merge-gate` request schema, tool-free judge semantics, receipt identity, or ship side effects.
- No long-lived compatibility alias, `delegate_to`, dual Skill name, semantic fallback, or shadow parser.
- No new `repo-harness workflow run --mode autoplan` command; no such engine exists today.
- No full 3x9 harness benchmark rerun unless the release claim explicitly depends on its performance conclusion.
- No mechanical target such as “all Skill directories <= 5.” Source package count and host discovery count are separate concerns.
- No browser session, remote MCP, deployment, publish, merge, or secret mutation during implementation verification.

## P1: Architecture Map

### Current authority surfaces

| Concern | Current owner | Observed issue |
|---|---|---|
| Umbrella routing | root `SKILL.md` | Five actions are correct, but the file is 2,132 bytes, 84 bytes above the documented 2 KiB cap |
| Facade catalog | `assets/skill-commands/manifest.json` | Lists 19 hand-authored facades but is not read by runtime selection |
| Functional install profiles | `src/cli/installer/install-profile.ts#PROFILE_COMPONENTS` | Correct owner for non-Skill install components, but Skill paths/probes are separately hard-coded |
| Host facade selection | `scripts/sync-codex-installed-copies.sh#profile_facades` | Duplicates profile-to-Skill membership outside the manifest |
| Host mutation/rollback paths | `src/cli/installer/install-profile.ts` | Fixed Skill-name paths can miss newly introduced packages during compensation |
| Provider/judge installation | `src/cli/commands/init.ts` and `src/cli/commands/global-runtime.ts` | Cross-review and merge-gate packages use separate fixed arrays |
| Cross-review behavior | `assets/skills/claude-review`, `assets/skills/codex-review` | Both repeat base selection, diff scope, timeout, prompt, and result handling |
| ChatGPT browser/bridge behavior | `.agents/skills/repo-harness-chatgpt-*`, `assets/skill-commands/repo-harness-gptpro*`, `src/cli/mcp/setup.ts#SKILL_MD` | Multiple prose owners have already drifted in coding-profile and PTY behavior |
| Routing evidence | `evals/evals.json`, `scripts/run-skill-evals.ts` | Thirty mostly positive root-Skill cases; no profile-aware bilingual positive/negative discovery corpus |
| Architecture/docs | README x5, reference docs/mirror, public-surface modules | Names and profile claims are repeated manually |

The current package-owned Skill-like source count is 25, not 19:

```text
root router                                  1
assets/skill-commands facades               19
assets/skills provider/judge packages        3
.agents/skills ChatGPT packages              2
                                             --
                                             25
```

This count is an inventory, not the product metric. The product metric is the exact Skill set each host/profile discovers.

### Target ownership model

```text
Effective State / PreToolUse
  owns authority, phase, risk and security floors

assets/skill-commands/manifest.json v2
  owns Skill package classification, source path,
  profile/host discoverability and retirement metadata

src/core/skill-surface/catalog.ts
  parses, validates and selects manifest entries

installer / init / global runtime / sync script
  project selected packages and enforce ownership transactions

canonical SKILL.md packages
  own workflow orchestration and domain rules once

CLI/Core/Effects
  own deterministic execution, state transitions and provider mechanics
```

`PROFILE_COMPONENTS` continues to own functional install components such as CLI, hooks, verifier, and agent fleet. The Skill manifest maps packages to the component that enables them and validates that profile/package projection is consistent. It does not become a second risk authority.

### Target canonical packages

| Canonical package | Kind | Modes or responsibility | Default discovery |
|---|---|---|---|
| `repo-harness` | router | setup / plan / execute / verify / handoff | all profiles |
| `repo-harness-setup` | workflow | adopt/init, migrate, upgrade, repair, scaffold, capability configuration | router-only progressive load |
| `repo-harness-plan` | workflow | create plan, review plan | standard/product/strict |
| `repo-harness-product` | domain-package | PRD, Sprint, Goal | product-planning |
| `repo-harness-check` | workflow | workflow/release checks plus deploy-readiness reference | standard/product/strict |
| `repo-harness-ship` | workflow | commit/push/PR closeout | strict |
| `repo-harness-architecture` | domain-package | architecture request and diagram workflow | router-only or explicit install |
| `repo-harness-cross-review` | host-adapter workflow | opposite-provider review via deterministic CLI | strict, host-aware |
| `merge-gate` | judge | exact-candidate, tool-free final semantic gate | strict gatekeeper host only |
| `repo-harness-chatgpt` | optional integration | setup, consult, continue, read-back, MCP bridge | explicit ChatGPT setup only |

Old source ownership maps as follows:

```text
init / migrate / upgrade / repair / scaffold / capability -> setup references
review                                                -> plan:review
prd / sprint / goal                                   -> product references
handoff                                               -> root handoff reference
deploy                                                -> check deploy-readiness reference
autoplan                                              -> retired; root Effective State continuation
claude-review / codex-review                          -> cross-review provider modes
gptpro / gptpro-setup / chatgpt-browser / bridge      -> chatgpt modes
```

The old names are retirement metadata only. They are not routeable packages and do not generate alias directories.

### Target discovery matrix

| Profile / explicit setup | Discovered set |
|---|---|
| `minimal` | `repo-harness` |
| `standard` | `repo-harness`, `repo-harness-plan`, `repo-harness-check` |
| `product-planning` | standard set plus `repo-harness-product` |
| `strict` | `repo-harness`, `repo-harness-plan`, `repo-harness-check`, `repo-harness-ship`, host-aware `repo-harness-cross-review`, and `merge-gate` only on its gatekeeper host |
| explicit ChatGPT setup | adds `repo-harness-chatgpt` only; never implied by `product-planning` |
| architecture | loaded through root or an explicit operator install; never implied by another profile |

## P2: Concrete Traces

### Trace A: profile installation and retirement

```text
repo-harness install/update
  -> resolve explicit or recorded profile
  -> load + validate manifest v2
  -> select packages by profile, host and component
  -> derive every create/remove/probe/mutation path
  -> snapshot all mutation paths before the first write
  -> preflight ownership/hash of existing host Skills
  -> project selected canonical packages
  -> remove only pristine package-owned retired copies
  -> probe the complete selected set
  -> commit install state only after all probes pass
```

Input authority is the validated manifest plus the explicit/recorded install profile. A malformed entry, missing canonical source, inconsistent component, untracked mutation path, modified owned copy, or unowned destination fails before destructive mutation. Any injected failure after mutation begins restores original bytes and leaves install state uncommitted.

### Trace B: user request to workflow side effect

```text
host discovers exact profile projection
  -> one canonical SKILL.md matches the task
  -> SKILL.md loads one mode reference on demand
  -> deterministic CLI/Core capability executes
  -> repo artifact or host state changes
  -> canonical check reports the result
```

Ordinary questions, quoted Skill names, negated requests, hypothetical discussions, and status-only requests must not invoke a workflow. Missing authority fails closed; the Skill must not infer a semantic replacement.

### Trace C: cross-model review

```text
repo-harness-cross-review
  -> deterministic review-scope capture reuses normalized review-subject/fingerprint logic
  -> branch + staged + unstaged + untracked bytes are captured under one base revision
  -> selected opposite-provider runner executes read-only with a bounded timeout
  -> transcript/result parser emits a structured result or explicit failure
  -> Skill interprets findings and recommendation
```

Timeout, empty output, malformed transcript, auth failure, provider nonzero exit, and scope degradation remain observable failures. They do not fall back to another provider or synthesize a pass. `merge-gate` is not part of this path.

### Trace D: ChatGPT setup and projection

```text
explicit repo-harness ChatGPT setup
  -> read one file-backed canonical package
  -> project the requested host/repo Skill bytes
  -> verify byte parity with canonical source
  -> browser or MCP CLI owns setup/session operations
```

No inline Skill prose remains in `src/cli/mcp/setup.ts`. Login, captcha, SSO, cookie, token, provider readiness, and remote-control boundaries remain fail closed and mode-specific.

## P3: Design Decisions

1. **Manifest before deletion.** Manifest v2 first reproduces the existing profile/host projection exactly. No facade is added, removed, or renamed until this parity is proven.
2. **One source for discovery, not for risk.** Manifest fields are limited to `kind`, `source`, `modes`, `profiles`, `hosts`, `discoverability`, `component`, `requires`, `mutatesRepoByDefault`, and retirement metadata. `riskFloor` stays with Effective State/PreToolUse and is not copied into the Skill catalog.
3. **No compatibility aliases.** Public cutover migrates all live references and deletes old authoring paths in this work-package. Installed cleanup removes only pristine package-owned copies. Unknown or modified host content is preserved and blocks the transaction.
4. **No invented autoplan engine.** The facade is retired; root `execute` follows Effective State and the existing plan -> contract -> worktree -> verify -> ship machinery. The reusable-workflow packaging rubric moves to one reference document.
5. **Progressive references, not giant routers.** Root stays at or below 2,048 bytes. Canonical router bodies remain compact and load mode-specific references only after routing.
6. **Source count and discovery count are different metrics.** Ten canonical source packages are acceptable; profile discovery remains bounded by the matrix above.
7. **Provider mechanics belong below Skill prose.** Git capture, base resolution, timeouts, provider process management, transcript recovery, and structured errors move to shared deterministic code. Provider-specific prompts remain adapters.
8. **One expensive final evidence run.** During development, use deterministic/unit gates. After code freeze and subject hashing, run the real provider routing matrix exactly once.

At 10x package count, the first failure is not LLM confusion. It is incomplete transaction coverage: a hard-coded mutation-path list cannot compensate a partially installed new package. The manifest-derived path set must therefore precede any convergence work.

## Approach

### Strategy

Execute seven ordered slices inside one isolated work-package. SSD-04 and SSD-05 may be developed concurrently only after SSD-02, with disjoint write ownership and no edits to manifest/profile/shared inventory files. SSD-06 is the sole integration writer and performs the atomic public cutover.

### Trade-offs

| Option | Pros | Cons | Decision |
|---|---|---|---|
| Delete facades first | Immediate directory reduction | Rollback and ownership paths remain incomplete; routing regressions are hard to attribute | Reject |
| Keep all old names as generated aliases | Reduces short-term migration friction | Violates no-compatibility policy and preserves duplicate public semantics | Reject |
| Manifest authority, then one next-minor cutover | Proves transaction safety before removal; creates one discovery owner | More staged work and a deliberate breaking release | Use |
| Move every package into a new top-level directory | Clean-looking hierarchy | Large path churn without improving authority | Reject; retain existing asset roots and classify through manifest |
| Add `workflow run --mode autoplan` now | Preserves a named automation entry | Invents an unimplemented state engine and expands scope | Reject |

## Detailed Design

### Manifest v2 contract

The catalog includes the root router, public workflow/domain packages, host adapters, judges, optional integrations, and non-routeable retirement records. Validation rejects:

- duplicate names or source paths;
- missing canonical `SKILL.md` files;
- unsupported kind/discoverability/host/profile values;
- a discovered package whose required functional component is absent from that profile;
- retirement records that remain routeable or point to another retirement record;
- selected destinations absent from the precomputed transaction path set;
- profile projections that exceed their declared expected set.

The pure selector lives under `src/core/skill-surface/`. A thin TypeScript script emits selected names or JSON for `sync-codex-installed-copies.sh`; the shell no longer owns a `case` statement containing facade names. Installer probes, host-specific provider/judge installation, transaction mutation paths, static inventory tests, and generated discovery documentation consume the same selector.

### File ownership by slice

| Slice | Exclusive write scope before integration |
|---|---|
| SSD-01 | `evals/skill-routing/**`, `scripts/run-skill-routing-eval.ts`, `tests/skill-routing-eval.test.ts` |
| SSD-02 | manifest v2, `src/core/skill-surface/**`, manifest adapter script, installer/catalog focused tests |
| SSD-03 | new setup/product/plan/root reference package files and their focused content tests; no activation or deletion |
| SSD-04 | cross-review Core/Effects/CLI, new cross-review package, dedicated tests |
| SSD-05 | ChatGPT canonical package, MCP setup projection, ChatGPT dedicated tests |
| SSD-06 | root `SKILL.md`, manifest final projection, profile/install/sync files, old-source deletion, shared eval/docs/tests |
| SSD-07 | evidence reports, review, changelog/release artifacts, workflow closeout |

SSD-04 and SSD-05 must not touch `assets/skill-commands/manifest.json`, installer/profile files, README/reference mirrors, `tests/action-command-skills.test.ts`, or `tests/evals-contract.test.ts`. SSD-06 receives both sequentially.

### Affected file families

```text
SKILL.md
assets/skill-commands/**
assets/skills/**
.agents/skills/repo-harness-chatgpt-*/**
src/core/skill-surface/**
src/core/review/**
src/effects/review/**
src/cli/installer/**
src/cli/commands/{init,global-runtime,cross-review,chatgpt}.ts
src/cli/mcp/setup.ts
scripts/sync-codex-installed-copies.sh
scripts/run-skill-routing-eval.ts
evals/skill-routing/**
evals/evals.json
tests/action-command-skills.test.ts
tests/evals-contract.test.ts
tests/install-profiles.test.ts
tests/installed-copy-sync.test.ts
tests/cli/{install,init,global-runtime-init,cross-review,mcp-setup,chatgpt-browser}.test.ts
README.md
README.zh-CN.md
README.ja.md
README.fr.md
README.es.md
docs/reference-configs/**
assets/reference-configs/**
docs/architecture/modules/public-surface/{action-commands,root-router}.md
docs/CHANGELOG.md
```

Historical/archive files are not rewritten. Any retired-name scan uses an explicit allowlist for `plans/archive/`, `tasks/archive/`, changelog history, and research citations.

## Task Breakdown

### SSD-01 — Freeze inventory, classification and routing baseline

- [x] Re-audit from the exact post-EPC `origin/main` SHA; record both the post-ESA Program pin and the post-EPC SSD execution pin plus the current 25-source inventory.
- [x] Add a schema-validated bilingual Skill-routing corpus covering setup, plan/review, product, check/deploy readiness, ship, handoff, architecture, cross-review, exact-candidate merge-gate, ChatGPT, capability-as-reference, and ordinary discussion.
- [x] Include positive, ambiguous, quoted-name, negated, hypothetical, status-only, and ordinary-QA cases.
- [x] Record exact current and target discovered sets for four profiles, two hosts, copy/link projection, and gatekeeper-host exceptions.
- [x] Add deterministic corpus validation and dry-run selection tests; do not run the full provider matrix yet.
- [x] Treat the existing six-file result (110 pass, 0 fail, 25.91 seconds) as historical cached evidence; validate its subject and affected surfaces before deciding whether any portion remains reusable.

Acceptance:

- Every target canonical route has positive cases in Chinese and English.
- Every overlapping term has at least one negative/quoted/negated case.
- Corpus and expected projection hashes are recorded before production movement.
- Existing runtime behavior is unchanged.

### SSD-02 — Make manifest v2 the runtime discovery authority without behavior change

- [x] Add the pure typed catalog loader/validator/selector.
- [x] Upgrade the manifest to classify every current source, host, profile, component, discoverability mode, and retirement candidate.
- [x] Derive shell-selected facades, host provider/judge sets, install probes, managed surfaces, transaction mutation paths, and static test inventory from the catalog.
- [x] Keep the pre-cutover four-profile/two-host discovered sets byte-for-byte equivalent.
- [x] Fail before mutation on malformed catalog, missing source, invalid component/profile relation, or uncovered transaction path.
- [x] Add failure injection proving every actual Skill mutation path is snapshotted and compensatable.

Acceptance:

- `profile_facades()` and fixed provider Skill arrays no longer own package names.
- Manifest edits change all projections together or fail validation.
- A missing transaction path is a test/runtime error, not a partial install.
- Root/profile observable behavior remains unchanged in SSD-02.

### SSD-03 — Build canonical setup, product and plan rule owners

- [x] Create `repo-harness-setup` with progressive references for adopt/init, migrate, upgrade, repair, scaffold, and capability configuration.
- [x] Create `repo-harness-product` with PRD, Sprint, and Goal references.
- [x] Fold plan review into `repo-harness-plan` as a mode reference.
- [x] Move handoff guidance into a root reference and deploy readiness into a check reference.
- [x] Move the reusable-workflow packaging rubric out of autoplan into one reference document.
- [x] Rewrite the relevant migration reference; do not copy stale `agentic-dev-*`, fallback, or compatibility-shim guidance from `references/migration-guide.md`.
- [x] Add focused content/progressive-loading tests. These new packages stay inactive until SSD-06.

Acceptance:

- Each rule paragraph has one intended canonical owner.
- Canonical top-level Skill bodies contain routing and boundaries, while mode detail lives in references.
- No new package reimplements a CLI/Core state transition.

### SSD-04 — Extract deterministic cross-review and preserve merge-gate isolation

- [x] Reuse/extract normalized review-subject and diff-fingerprint logic instead of adding a third Git scope parser.
- [x] Add deterministic branch/staged/unstaged/untracked scope capture bound to one base revision.
- [x] Move timeout, provider process invocation, transcript recovery, output normalization, and error codes into Core/Effects/CLI.
- [x] Create one host-aware `repo-harness-cross-review` package with explicit Claude and Codex provider modes.
- [x] Cover clean, staged, unstaged, untracked, timeout, empty, malformed, auth/nonzero, degraded scope, and exact-base cases.
- [x] Leave `merge-gate` source, output schema, no-tool execution, receipt binding, and ship enforcement unchanged.

Acceptance:

- Provider Skills no longer contain large executable shell workflows.
- Provider failure is explicit and never falls back semantically.
- Cross-review cannot produce or verify a merge-gate receipt.

### SSD-05 — Establish one ChatGPT package source

- [x] Create one file-backed `repo-harness-chatgpt` package with setup, consult, continue, read-back, and bridge references.
- [x] Remove the inline `SKILL_MD` prose owner from `src/cli/mcp/setup.ts`; project canonical files instead.
- [x] Reconcile browser, GPT Pro, MCP Connector, coding-profile, PTY, session, login, cookie/token, and remote-control boundaries.
- [x] Make product planning independent from ChatGPT. ChatGPT discovery occurs only after explicit ChatGPT setup.
- [x] Add byte-parity tests between canonical source and installed/generated bridge/browser projections.
- [x] Keep browser/MCP CLI behavior and public tool names unchanged.

Acceptance:

- One canonical byte source produces every ChatGPT Skill projection.
- Setup/consult/bridge modes share safety rules without sharing secrets or auth state.
- A missing or malformed canonical package fails setup instead of emitting synthesized prose.

### SSD-06 — Perform the atomic public cutover, retirement and documentation migration

- [ ] Update root routing, final manifest projection and profile selections to the target discovery matrix.
- [ ] Activate canonical packages and remove old authoring directories in the same integration slice.
- [ ] Retire pristine owner-marked installed copies transactionally; preserve and fail closed on modified or unowned copies.
- [ ] Remove `repo-harness-autoplan`, provider-name Skills, GPT Pro facades, handoff/deploy facades, and all other replaced public entrypoints without generated aliases.
- [ ] Migrate all live references, routing evals, action-command tests, profile/install tests, README x5, reference docs plus asset mirror, architecture modules, prompt-guard recommendations, and package/runtime probes.
- [ ] Keep root `SKILL.md` at or below 2,048 bytes and keep specialized detail progressively loaded.
- [ ] Verify adapter/runtime refresh preserves the recorded profile on the pinned post-EPC baseline and confirm the removed stale deferred-ledger claim does not regress.
- [ ] Record retired-name -> replacement/mode mappings for migration diagnostics only; mark them non-routeable.

Acceptance:

- No executable live reference targets a retired Skill name.
- Retired names appear only in allowed migration metadata, changelog/history, or archived artifacts.
- Minimal/standard/product-planning/strict discovered sets match the target matrix exactly.
- Product planning does not install ChatGPT; strict does not silently add product planning.
- No compatibility alias directory or semantic fallback exists.

### SSD-07 — Freeze the subject and produce final evidence once

- [ ] Freeze head SHA, manifest/projection hash, corpus hash, package bytes, and changed-file list before expensive evidence.
- [ ] Run deterministic focused suites during development; run the real host/provider routing matrix exactly once after freeze.
- [ ] Before a >10-minute provider run, report case count, provider calls, expected wall time, and why cached evidence is invalid or insufficient.
- [ ] Measure canonical top-1 accuracy >=95%, double-trigger/ambiguous activation <=2%, ordinary-QA false activation <=1%, and per-route recall >=90%.
- [ ] If the negative sample is below 100, require zero false activations and report it as a small-sample result rather than claiming statistical <=1% confidence.
- [ ] Exercise disposable `HOME`/`BUN_INSTALL` across all profiles, both hosts, copy/link, fresh/reinstall/upgrade/downgrade/rollback, pristine/modified/unowned ownership, and injected failures.
- [ ] Run packed-tarball install smoke, all required repo checks, independent review, exact-subject merge gate, and workflow closeout.

Acceptance:

- Evidence is bound to the frozen head and exact manifest/corpus hashes.
- Every canonical route meets its floor; aggregate accuracy cannot hide a zero-recall route.
- Rollback restores original bytes at every injected failure point.
- Review recommends pass and all required checks are current.

## Dependency Order

```text
ESA done: PR #79 @ 3b33cea2422b1aa1e5be9080be54f731c4f2015d
                   |
                  LSC
                   |
                  HRD
                   |
                  EPC
                   |
       pin exact post-EPC origin/main
                   |
                 SSD-01
                   |
                 SSD-02
                   |
                 SSD-03
                  /   \
             SSD-04   SSD-05
                  \   /
                 SSD-06
                   |
                 SSD-07
```

ESA, LSC, HRD, EPC, and SSD are independent work-packages with independent worktrees, branches, and PRs. Within the atomic SSD work-package, SSD-06 is the only integration writer; SSD-04 and SSD-05 may run in parallel only with the disjoint ownership declared above. The same manifest, profile, README, architecture, or shared test file must never have concurrent writers.

## Verification Plan

### Focused development gates

```bash
bun test tests/skill-routing-eval.test.ts tests/evals-contract.test.ts
bun test tests/action-command-skills.test.ts \
  tests/install-profiles.test.ts \
  tests/installed-copy-sync.test.ts \
  tests/cli/install.test.ts
bun test tests/cli/cross-review.test.ts \
  tests/cli/init.test.ts \
  tests/cli/global-runtime-init.test.ts
bun test tests/cli/mcp-setup.test.ts \
  tests/cli/chatgpt-browser.test.ts
bun run check:type
```

Use actual filenames created by the implementation when a planned new test does not yet exist. Do not add a second runner if the existing eval runner can be extended without mixing prompt-guard and Skill-discovery metrics.

### Retirement and projection matrix

| Dimension | Required values |
|---|---|
| Profile | minimal / standard / product-planning / strict |
| Host | Codex / Claude |
| Projection | copy / link |
| Lifecycle | fresh / reinstall / upgrade / downgrade / rollback |
| Ownership | pristine package-owned / modified package-owned / unowned |
| Failure | inject at every host Skill mutation stage |

### Final repo gates

```bash
bun test
bun run check:type
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
bash scripts/check-tarball-install-smoke.sh
git diff --check
```

Do not rerun the full provider routing matrix after a documentation-only edit unless that edit changes discovered Skill bytes, manifest/projection bytes, prompts, routing cases, or the frozen review subject.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| New package path is absent from transaction snapshots | Medium | Critical | Derive mutation paths from validated manifest before any package is activated |
| Upstream Loop semantics/runtime/evidence work overlaps the SSD cutover | High if overlapped | High | Enforce serial `LSC -> HRD -> EPC -> SSD`, pin live remote main after each stage, and start SSD only when no upstream writer remains |
| Manifest becomes a second risk authority | Medium | High | Exclude risk policy fields; validate only discovery/component relationships |
| Old rules survive in references or inline templates | High | High | Canonical-owner inventory, live-reference scan, projection byte parity, explicit history allowlist |
| Compatibility aliases preserve dual semantics | Medium | High | No aliases; one next-minor cutover and transaction-safe retirement |
| Modified user Skill is deleted | Low | Critical | Ownership hash preflight, fail closed, preserve bytes, rollback tests |
| Product planning still implies GPT Pro | Medium | Medium | Exact target profile tests and explicit-only ChatGPT setup |
| Cross-review and merge-gate semantics blur | Medium | Critical | Separate packages, commands, schemas, tests, runtime identities and receipts |
| Aggregate routing score hides a dead route | Medium | High | Per-route recall floors plus positive/negative class metrics |
| Expensive evals are rerun before code freeze | High | Medium | Deterministic development gates; one frozen-subject provider run |
| Root router grows while facades shrink | Medium | Medium | <=2,048-byte gate and progressive reference tests |
| Historical references create false dangling-name failures | High | Low | Scan live surfaces with an explicit archive/history allowlist |

## Task Contracts

- Contract file after SSD activation: `tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md`
- Review file after SSD activation: `tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md`
- Notes file after SSD activation: `tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command after projection: `repo-harness run verify-contract --contract tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md --strict`
- Approval rule: the direction is human-approved; machine status stayed `Draft` (so `plan-to-todo` failed closed) until the activation gate was satisfied on 2026-07-23 — EPC merged/pushed and `POST_EPC_SHA = 555524c1` pinned at fresh fetch — at which point this plan was promoted through the Draft -> Annotating -> Approved flow.

The future contract must narrow `allowed_paths` to the file families above and keep this anti-extras clause:

> Requirements absent from this plan are forbidden design space. Do not add compatibility aliases, new public CLI/MCP names, a generic capability framework, or unrelated installer/effective-state refactors.

## Promotion Gate

- **Merge/PR unit**: One next-minor Skill discovery and rule-authority cutover; all seven SSD slices land in one PR so old and new public rule owners are never released together.
- **Rollback surface**: Revert the work-package and reinstall the previous package/profile; host transaction rollback must restore all preexisting bytes.
- **Verification boundary**: Exact manifest/profile projection, routing corpus, provider mechanics, ChatGPT byte projection, host retirement matrix, tarball smoke, and required repo gates.
- **Review/acceptance boundary**: Future review must recommend pass against the frozen head; `merge-gate` judges the exact candidate separately.
- **High-risk surface**: Public Skill removal, host-global install mutation, cross-provider process execution, ChatGPT auth/session instructions, and package projection.
- **Why not checklist row**: The change has an independent next-minor release, rollback, migration, verification, and review boundary and cannot share any ESA, LSC, HRD, or EPC contract, work-package, branch, or PR.

## Evidence Contract

- **State/progress path**: This plan's Task Breakdown; after the dependency gate, the same-stem contract/review/notes and one `public-surface/action-commands` workstream projection.
- **Verification evidence**: Focused test logs during development; one frozen provider-routing report; disposable-host matrix report; package smoke; `.ai/harness/checks/latest.json`; exact merge-gate receipt.
- **Evaluator rubric**: Canonical owner uniqueness, exact per-profile discovery, routing metrics with per-route floors, no compatibility paths, transaction rollback, provider error handling, and unchanged merge-gate semantics.
- **Stop condition**: All seven tasks complete, no live retired references remain, final evidence is bound to the frozen subject, required checks pass, review recommends pass, and exact-candidate merge gate passes.
- **Rollback surface**: Revert the PR before publish. After publish, restore the previous package/profile from the release artifact and ship a corrective minor; never mutate unknown host Skills to force recovery.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`
- Exact next step now: project the SSD contract/worktree and execute SSD-01 (inventory, classification, and routing baseline) from the pinned `POST_EPC_SHA` execution baseline.
- Activation record (2026-07-23): post-EPC `origin/main` SHA pinned at fresh fetch, SSD-01 re-audit pending in the worktree, `tasks/todos.md` SSD row retired serially with this promotion.

## Annotations

All planning-phase annotations were resolved into the plan body before approval (2026-07-23):

- The rejection of the attachment's generated compatibility aliases is normative in Non-goals, the Trade-offs table, and P3 decision 3.
- The manifest's exclusion of `riskFloor` (Effective State and PreToolUse remain the risk/security authority) is normative in the target ownership model and P3 decision 2.
- The concurrency-authority rule (live workflow markers and worktrees, not plan filenames) is normative in Workflow Inventory; the LSC/HRD/EPC dependency wait it described completed with EPC closeout (PR #125).
