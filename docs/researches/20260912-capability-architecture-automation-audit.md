# Capability architecture automation audit

Audit date: 2026-09-12. Source subject: `2bea52c13482ef1777f57a1bdc799a745acc524f`.
Scope: capability document creation/update, automatic refactor recommendations,
and their real host entrypoints. This report records observations, not repair
authorization or a claim of production acceptance. Runtime observations must be
read again before remediation.

## Conclusion

The requested end-to-end behavior is not active in the inspected installation.
The source contains projection orchestration and recommendation delivery, but
the installed host runtime differs from this checkout despite both reporting
version `0.19.0`. Existing documents and passing fixture tests do not establish
continuous operation.

## P1: authority and entrypoints

- `.ai/harness/policy.json#context.capability_source` selects `archcontext`.
  `scripts/capability-resolver.ts` reads capability nodes under
  `.archcontext/model/nodes/` and performs longest-prefix matching. All 27
  current capabilities have non-stub architecture module documents.
- Codex and Claude user-level Stop adapters execute the globally installed
  `repo-harness-hook`, whose entrypoint is `dist/hook-entry.js`.
- Current source reads projection execution preferences from the global
  configuration through `src/effects/architecture/projection-config.ts`.
  The installed provider still reads the repository policy instead. Its
  `src/effects/refactor/recommendations.ts` and projection-config module are
  absent; its hook bundle contains no `RefactorRecommendations` delivery path.

## P2: observed paths and findings

### Runtime integration: document writer is disabled

Both `repo-harness architecture-projection status --json` and the source CLI
report `provider=disabled`, `apply.mode=disabled`. The installed CLI attributes
this to repository policy. The source CLI reports missing global architecture
configuration (`initialized=false`).

`src/core/architecture/projection.ts:214` defaults absent execution settings to
disabled. `src/cli/commands/architecture-configuration.ts:5` initializes the new
global settings during runtime setup, but that initialization is not present
in the inspected account configuration.

In `src/cli/hook/stop-handler.ts:723`, disabled projection selects the legacy
cascade. `src/cli/hook/mutation-observed.ts:853` records a queue card and runs
context synchronization; it does not author module document prose. Initial
readback found two low-severity cards dated September 8 and 9, below the
medium freshness threshold. After the interrupted session's Stop processing,
readback found four cards, including two new high-severity cards. These are
queue observations, not proof of module document refresh.

### Runtime integration: automatic refactor suggestions are not installed

Current source calls `observeRefactorRecommendations` near normal Stop exit
(`src/cli/hook/stop-handler.ts:872`). It defaults to enabled, requires current
complete code facts and unambiguous ownership, scans through ArchContext,
delivers at most three unseen observations, and uses a five-minute cooldown.
Recommendations ask for a user decision; they do not authorize execution.

That implementation is absent from the installed hook bundle. No local
`.ai/harness/runs/refactor-recommendations.json` was present at inspection.
Absence of the delivery implementation, rather than absence of that optional
state file alone, establishes the installed-runtime gap.

The source also shares a 20-second Stop budget with architecture work and
defers scanning when less than 10 seconds remain. This is a scheduling limit;
this audit did not establish persistent starvation on an enabled installation.

### Confirmed gate defect: empty change set bypasses projection blockers

`scripts/check-architecture-sync.sh:367-374` returns zero on an empty changed
path list, before enforcing the already-computed projection blocker count.
An isolated fixture with strict mode, automatic ArchContext, and an unavailable
provider returned `projection.blocking=1` with exit zero. The same fixture with
one changed path returned exit one and the expected strict projection failure.
Provider availability and durable projection completion therefore cannot be
inferred from this check's exit code on an empty change set.

### Coverage gap: module creation is not enforced by resolver validation

`scripts/capability-resolver.ts:278-310` validates prefixes and orphan documents,
but does not require every declared architecture module to exist. A disposable
repository declaring a missing module passed `validate --format json` with
`ok=true`.

Separately, a legacy queue fixture recording
`.archcontext/model/nodes/capability.apps.web.yaml` returned `unrelated` and
exit zero. `scripts/architecture-queue.sh:276` does not classify model-node
changes. This is a gap in the currently selected legacy lane, not proof that
the enabled ArchContext projection lane ignores these paths.

## P3: constraints and next verification boundary

Preserve ArchContext as semantic authority, ownership markers around generated
content, and explicit acceptance for unresolved major architecture changes.
Do not implement a second local semantic writer or interpret a drift card as
a completed document update.

The next bounded slice is installed-runtime alignment and a disposable
end-to-end canary: install the intended source subject in an isolated HOME,
verify its configuration authority, exercise one capability document creation
and one source-driven update through the actual Stop/provider path, and verify
one evidence-backed refactor observation reaches the user-facing hook result.
Include the empty-change-set strict gate regression. This distinguishes setup
gaps from implementation failures without widening into automatic refactoring.
At higher edit volume, the shared Stop time budget is the first observed
scheduling constraint to measure; no throughput claim was made here.

## Verification and limits

- Six focused files covering resolver, ArchContext capability source, queue,
  sync, drift, and drift recovery: 102 cases ultimately passed. Two exceeded
  Bun's default five-second timeout on the initial run; only those two were
  rerun with `--timeout 60000`, passing in approximately 19 seconds combined.
- `tests/unit/refactor-recommendations.test.ts`,
  `tests/architecture-projection-e2e.test.ts`,
  `tests/architecture-projection-provider.test.ts`, and
  `tests/unit/global-architecture-projection.test.ts`: 42 passed.
- `tests/architecture-projection-orchestration.test.ts`: 37 passed.
- Disposable probes reproduced missing-document validation success,
  model-node legacy classification, and the empty-change-set gate bypass.
- `tests/architecture-projection-e2e.test.ts:44` inspects committed documents;
  it does not create a new capability through the installed hook. Provider and
  orchestration fixtures do not replace an enabled installed-runtime canary.
- No live provider apply, global update, configuration change, or production
  source repair was performed. Two delegated research passes were interrupted
  without final reports; their proposed findings were not used. The main thread
  independently read and verified the evidence included above.
- After interruption, existing modifications to `assets/AGENTS.md`,
  `assets/CLAUDE.md`, the architecture index, and two new queue cards were
  retained. This audit adds only this report and does not claim the worktree
  remained clean throughout host hook processing.
