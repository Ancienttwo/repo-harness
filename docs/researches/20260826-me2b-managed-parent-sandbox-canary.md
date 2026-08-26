# ME-2B Managed Parent/Sandbox Runtime Admission Canary

> Date: 2026-08-26
> Decision: `runtime_not_admitted`
> Runtime: `codex-cli 0.149.0`
> Scope: ME-2B writable delegation admission only

## Conclusion

The current Codex Host can enforce a sandbox profile when a process starts, but cannot revoke write permission from an already-running Parent Engineer while preserving that Parent as a useful control actor. It also exposes no authenticated child principal plus grant epoch at each filesystem effect. ME-2B therefore remains disabled/read-only and no writer-grant product surface is implemented.

This is a completed negative feasibility decision, not an incomplete implementation. Building `WriterActorCurrentV1`, `DelegatedMutationGrantV1`, hooks or prompt rules would record intent without enforcing the one-writer invariant.

## P1: Architecture Map

The relevant system has four boundaries:

1. The Provider/App or CLI Session is the Parent runtime. Its filesystem policy is selected outside repo-harness.
2. Codex CLI `sandbox` applies macOS Seatbelt permissions to a newly launched process.
3. ME-3B owns a one-shot read-only `codex exec` effect and immutable observation. It does not own a persistent Parent process or writable effect broker.
4. repo-harness owns Task, Lease, WorkEnvelope, Engineer Binding, evidence and acceptance. These records can fence control-plane mutations but cannot change kernel permissions of an existing process.

The canary operates only in `mkdtemp` disposable Git repositories. It does not read or mutate Task, Lease, Binding, Publication, Acceptance or user source bytes.

## P2: Concrete Trace

The executable was frozen as:

```text
realpath: /opt/homebrew/Caskroom/codex/0.149.0/bin/codex
version: codex-cli 0.149.0
sha256: f4a74117b8142cda581c95ff753abf4508b5636d89682c1ed77e4a9249af8963
sandbox-help-sha256: 6f07d12fb0614fbca21988b0e2a9165f33d341dbd0899728fcd3b67e19ac7660
```

The model-free path was:

```text
mkdtemp Git repository
  → codex sandbox --permission-profile :read-only … /usr/bin/touch
  → exit 1, Operation not permitted, sentinel absent
  → codex sandbox --permission-profile :workspace … /usr/bin/touch
  → exit 0, sentinel present
  → keep one :workspace Parent shell alive
  → Parent writes before revocation checkpoint
  → Host publishes checkpoint
  → same Parent writes after checkpoint
  → Parent exits 0
```

The accepted observation was:

```json
{
  "read_only_worktree_mutation_denied": true,
  "workspace_write_worktree_mutation_admitted": true,
  "parent_mutation_before_revocation": true,
  "parent_mutation_after_revocation": true,
  "parent_control_alive_after_revocation": true,
  "dynamic_parent_revocation": "unavailable",
  "child_principal_at_effect": "unavailable"
}
```

The decision reasons are exactly:

```json
[
  "dynamic_parent_revocation_unavailable",
  "parent_write_survived_revocation",
  "child_principal_at_effect_unavailable"
]
```

## P3: Design Decision

The non-negotiable invariant is not “one active grant record.” It is “at most one process principal can mutate the claimed worktree at every instant.” The current runtime fails that invariant after revocation:

- Seatbelt permissions are launch-scoped.
- A checkpoint or CAS change cannot alter the live Parent sandbox.
- Suspending or terminating the Parent removes its persistent control role and introduces a process supervisor/Agent Runtime that the accepted architecture explicitly excludes.
- A writable child process does not cross a repo-harness broker before every filesystem effect, so the broker cannot revalidate grant epoch or principal at the last responsible moment.

At 10x scale, the first failure is process-tree/effect interception, not lock throughput. Adding more records would make the evidence look stronger while leaving the enforcement unchanged.

## Decision and Revisit Trigger

ME-2B is not admitted on the current Host. The supported product boundary is:

```text
Persistent logical Module Engineer
  → exact current Binding/Claim
  → read-only ME-2A admission
  → one-shot ME-3B read-only effect
  → untrusted result / verified evidence / independent Acceptance
```

Reopen ME-2B only when both conditions are observable:

1. A Host API replaces the sandbox of a live Parent while preserving non-mutating read/observe/cancel control.
2. Every child mutation effect carries an authenticated runtime principal and grant epoch enforced by the Host/effect broker.

Then rerun:

```bash
bun scripts/me2b-runtime-admission-canary.ts
```

Prompt text, TOML declarations, hooks, current-store flags, process names, PIDs or a calendar date are not valid revisit triggers.
