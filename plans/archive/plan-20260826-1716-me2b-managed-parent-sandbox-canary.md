# Plan: ME-2B Managed Parent/Sandbox Runtime Admission Canary

> **Status**: Archived
> **Created**: 20260826-1716
> **Slug**: me2b-managed-parent-sandbox-canary
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: `plans/prds/20260824-1653-writable-worker-grant.prd.md`
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Host-enforced dynamic Parent freeze, revocation and child runtime identity at the mutation boundary
> **Rollback Surface**: canary script, ME-2B PRD/research decision and workflow artifacts only
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260826-me2b-managed-parent-sandbox-canary.md`
> **Task Contract**: `tasks/contracts/20260826-1716-me2b-managed-parent-sandbox-canary.contract.md`
> **Task Review**: `tasks/reviews/20260826-1716-me2b-managed-parent-sandbox-canary.review.md`
> **Implementation Notes**: `tasks/notes/20260826-1716-me2b-managed-parent-sandbox-canary.notes.md`

## Objective

Run the dedicated ME-2B security canary before any writer-grant implementation. Prove or falsify that the current Codex Host can freeze an already-running Parent Engineer, keep a writable child fenced to one runtime principal, revoke the grant at the effect boundary, and restore the Parent without any writer overlap. If the runtime cannot enforce these conditions, close ME-2B as runtime-not-admitted and preserve read-only-only behavior; do not build prompt/store/hook facsimiles.

## P1 Architecture Map

- The current Parent is a Provider/App or CLI Session whose sandbox is selected when the process/session starts; repo-harness owns no Agent runtime.
- ME-3B owns one `codex exec --sandbox read-only` action and at-most-once observation. It has no dynamic Parent permission or writable effect broker.
- Codex CLI `sandbox` and `exec --sandbox` are the observable Host enforcement surfaces. The canary uses the installed executable directly and a disposable Git repository.
- Existing Task, Lease, WorkEnvelope, Binding, ClaimActorReceipt, Publication and Acceptance stores are protected controls and must remain byte-identical.

## P2 Concrete Trace

1. Freeze installed Codex executable path, version and bytes.
2. Prove `:read-only` denies a disposable worktree mutation and `:workspace-write` admits it.
3. Resolve one exact version-pinned Host probe adapter; unknown runtime versions fail closed instead of inheriting launch-only semantics.
4. Keep one workspace-write Parent alive across a neutral checkpoint to prove the static launch profile persists; never label that checkpoint as revocation.
5. Only an adapter backed by authoritative Host APIs may attempt revocation and report post-revocation Parent mutation/control plus the effect-time child principal/epoch.
6. Record exact JSON evidence and decide admission. No model output or self-report is trusted.

## P3 Decision Rationale

- The invariant is OS/Host enforcement, not a store state: at every instant the worktree has at most one process principal capable of mutation.
- A static launch sandbox cannot prove dynamic revocation. If the live process retains write permission after the grant epoch changes, adding writer-current records would create false authority.
- Full process termination could remove the Parent writer, but it cannot preserve the required persistent Parent read/observe/cancel role and would require a new supervising runtime. That is outside the approved control-plane architecture.
- At 10x scale the first failure is not lock throughput; it is unbounded process-tree and effect interception. Therefore the smallest coherent result may be a durable no-go decision with an explicit runtime-capability revisit trigger.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/me2b-runtime-admission-canary.ts` | Add | Disposable, model-free static/dynamic sandbox probe |
| `tests/me2b-runtime-admission-canary.test.ts` | Add | Deterministic canary classification tests with a fake runtime |
| `docs/researches/20260826-me2b-managed-parent-sandbox-canary.md` | Add | P1/P2/P3 evidence and admission decision |
| `plans/prds/20260824-1653-writable-worker-grant.prd.md` | Modify | Record canary decision and activation state |
| `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md` | Modify | Project ME-2B terminal runtime decision |
| `docs/researches/20260824-persistent-module-engineer-organization.md` | Modify | Preserve the verified boundary and revisit trigger |
| `tasks/todos.md` | Modify | Keep only the external runtime-capability revisit trigger if no-go |
| 20 existing `docs/architecture/modules/**` capability projections | Project | Refresh verified-flow proof after CodeGraph initialization; no capability or relation change |
| workflow artifacts | Add/project | Contract, review and notes |

## Invariants

- No writer grant, writer current, daemon, generic Worker Host, Provider fallback or writable adapter is created before a passing canary.
- No prompt, hook or Git-common store flag is treated as filesystem revocation.
- Canary runs only in a disposable repository and removes it on completion.
- Parent/child runtime identity and grant epoch must be enforced by the Host at each effect; self-reported IDs are insufficient.
- A no-go result is a valid completion: ME-2B stays disabled/read-only with a precise revisit trigger.

## Task Breakdown

- [x] Implement deterministic model-free canary and unit classification.
- [x] Execute against installed Codex CLI and capture exact evidence.
- [x] Decide ME-2B admission without compatibility fallback.
- [x] Update PRD, umbrella and research with the verified decision.
- [x] Run focused tests and root workflow checks.
- [ ] Complete independent acceptance, archive and merge.

## Verification Boundary

The canary must distinguish: exact-envelope static read-only denial, static workspace-write admission, a neutral static-Parent checkpoint, actual Host revocation, process termination, and an unavailable dynamic probe. A passing ME-2B admission requires denial after a real adapter-backed revocation while the same managed Parent remains available for non-mutating control and one exact child principal is checked at every effect. Any weaker or unavailable probe is no-go.

## Evidence Contract

- **State/progress path**: this plan, its contract/review/notes and the ME-2B PRD decision.
- **Verification evidence**: canary JSON, deterministic tests, installed Codex path/version/hash and repository gates.
- **Evaluator rubric**: no false positive; a static sandbox or stopped Parent cannot be classified as dynamic freeze.
- **Stop condition**: the canary result is recorded, ME-2B activation state is unambiguous, no unsupported writer surface exists, and exact-subject acceptance passes.
- **Rollback surface**: canary/research/workflow files only; no runtime authority migration.

## Promotion Gate

- **Merge/PR unit**: one security admission decision and its reproducible canary.
- **Rollback surface**: canary script/tests plus ME-2B decision docs.
- **Verification boundary**: dynamic Parent revoke/restore and child effect identity.
- **Review/acceptance boundary**: exact canary evidence and Protocol-2 semantic review.
- **High-risk surface**: writable filesystem delegation; false admission would create concurrent writers.
- **Why not checklist row**: the result decides whether an entire high-risk product capability may exist.

## Out of Scope

Implementing WriterActorCurrentV1, DelegatedMutationGrantV1, a new Agent runtime, daemon, process supervisor, container/user isolation, Task/Lease/Publication/Acceptance mutations, or any unmanaged Provider Session compatibility mode.
