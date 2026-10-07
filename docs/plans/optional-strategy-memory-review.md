# Strategy implementation review

Base: 5f8ae4bc3f27cd662a3e04171cb37da91a476e08.
Branch: feat/optional-strategy-memory. Environment: selected saved cloud checkout.
Runtime: Node 24.19.0 and temporary Bun 1.4.0. No dependency files changed.
Dependencies were installed from the frozen lockfile with scripts disabled.
Temporary tooling is outside the checkout. No provider ran.

## Delivered behavior

The strategy CLI exports compact, bounded context and validates inert proposals.
Its only host mutation commands install or remove an explicitly requested owned
Skill link. Neither command enables a project. Default profiles and hooks stay
unchanged. Project context and lessons remain canonical, manually authored docs.
Lesson summaries are unverified. Selected bodies need matching current and Git
revision hashes. Every request rebuilds lifecycle eligibility in memory.

## Verification

All commands below used a PATH prefix for the temporary Bun binary:
`/tmp/strategy-tooling/node_modules/@oven/bun-linux-x64/bin`.

- `bun run check:type`: passed on the final source and tests.
- `bun run test:files tests/strategy.test.ts tests/skill-surface/catalog.test.ts tests/skill-surface/canonical-packages.test.ts --timeout 60000 --max-concurrency 1`:
  initial run failed. It found new-test errors, stale catalog counts and the
  missing Bot audience label. A second run passed 93 tests and failed two:
  a remaining owned-package count and Bun compiler cache in temporary HOME.
- `bun run test:files tests/strategy.test.ts tests/skill-surface/catalog.test.ts --timeout 60000 --max-concurrency 1`:
  passed, 72 tests, 297 assertions. Runtime compiler cache was disabled for the
  real CLI no-write test. Repository and HOME no-write assertions stayed.
- `bun run test:files tests/strategy.test.ts --timeout 60000 --max-concurrency 1`:
  passed after the last source delta, 13 tests, 84 assertions. This delta added
  a stale diagnostic for selected-body hash drift and removed an unused import.
- The unchanged canonical-package coverage passed all 23 tests in the second
  three-file run. The later changes did not affect those subjects.
- `bun run check:state-boundaries`: passed, 322 existing boundary files.
- `bun run check:hooks`: passed, three projections.
- `bun run check:helpers`: passed, 59 projections.
- `bun run check:reference-configs`: passed, 26 projections.
- `bun run check:context-map`: passed, ten entries.
- `git diff --check`: passed.
- `bun scripts/select-ci-coverage.ts --base 5f8ae4bc3f27cd662a3e04171cb37da91a476e08`:
  passed. The conservative selector returned 370 tests for 14 changed paths.
  CLI entry imports widen that set to host and provider lifecycle tests.

The aggregate `scripts/check-ci.sh affected` and full suite were not run.
They include broad host/provider lifecycle coverage forbidden by this task.
No lint script exists in package.json. Typecheck and whitespace checks ran.

## Read-only review

Self-review traced source scope, schema checks, proposal binding, lifecycle and
host-link ownership. It found and corrected the shipped-guide location, the
missing audience label and UTF-8 byte-boundary handling. Selected body hash
changes now return a stale diagnostic. Tests retain no-write assertions on
success and failure, including actual CLI context and proposal validation.

Existing test changes are limited to the catalog count (20 to 21), repo-owned
count (11 to 12), and the explicit Bot audience list. The new optional Skill
requires these changes. No existing behavioral assertion was removed.

An independent review was not run. The required Herdr pane tool is absent.
The task forbids live coding providers. Parent review remains required before
publication. This report is self-review evidence, not independent acceptance.

## Limits and rollback

Provenance verifies content identity, not truth or semantic entailment. Semantic
consistency stays unknown. Review conditions in prose need human interpretation.
Host read-only/resume support is unverified, so this version exports only packets.
Readers reject symlinks and nested repositories and confirm source hashes.
Concurrent hostile replacement of parent directories is outside the filesystem
race guarantee. Oversized inputs fail closed. Truncation blocks proposal review.
A business pilot needs an actual owner and goal. No such project was fabricated.

Revert the implementation commit to remove the optional surface. Explicitly
installed host links can be removed with strategy uninstall-skill before a
package rollback. No project memory was written by this task.

## Independent review fixes on 88860d5

Parent supplied an independent static review. It verified the original archive
hash, commit object and eleven new-file blob hashes. It did not run tests.
It requested changes for four P2 findings. This section supersedes the original
state-read readiness claims above.

1. IO limits now use one reader for proposal, context, current sources, history,
   state observation and confirmations. File sizes are checked before payload
   reads. Historical object sizes are checked before Git show. Git output counts
   in the quota. Budget failures are not downgraded to unverified evidence.
2. Every enum requires a string. Arrays, objects and null cannot bypass fact
   evidence checks or produce reviewable action values.
3. Provenance revisions must resolve to commit objects. Tree and missing object
   IDs cannot prove a source revision. No ancestry rule was added.
4. A bounded observer is called again after all context, evidence, body and
   proposal confirmations. A changed state revision fails stale. The injected
   regression changes tasks/current.md after the first observation. It uses no
   sleeps and exercises both collection and proposal validation.

The full effective-state resolver has unbounded direct and transitive reads.
Strategy now takes the review's explicit fail-closed alternative. Production
commands do not call resolveEffectiveStateReadOnly or the ordinary writer.
They export packets with state unavailable and block otherwise valid proposals.
There is no CLI bypass. The internal observer seam uses the request reader in
synthetic tests. A bounded adapter owned by the full state resolver is still
required to restore production reviewable status. This scope change avoids a
false IO-limit promise and avoids substituting a partial state projection for
canonical effective state.

### Verification of the review changes

- `bun run check:type`: passed.
- `bun run test:files tests/strategy.test.ts --timeout 60000 --max-concurrency 1`:
  passed, 18 tests, before the final enum regression refinement.
- `bun run test:files tests/strategy.test.ts tests/skill-surface/catalog.test.ts tests/skill-surface/canonical-packages.test.ts --timeout 60000 --max-concurrency 1`:
  passed on the final code and tests, 100 tests, 425 assertions.
- `bun run check:state-boundaries`: passed, 322 files.
- `bun run check:hooks`: passed, three projections.
- `bun run check:helpers`: passed, 59 projections.
- `bun run check:reference-configs`: passed, 26 projections.
- `bun run check:context-map`: passed, ten entries.
- `git diff --check`: passed.

The real CLI test now expects blocked instead of reviewable because production
state observation is unavailable. It still asserts no persistent repository or
HOME changes on success and failure. This is the only changed readiness
assertion. Pure validation with a synthetic bounded observer still proves that
complete consistent context can be reviewable. All prior lifecycle, source
scope, provenance, contradiction and truncation assertions remain.

No broad host lifecycle tests, full suite or providers ran. Repeat independent
review is pending with the parent. Remaining limits include the unavailable
production state adapter, semantic entailment, concurrent hostile directory
replacement, same-size writes during a read, output-envelope truncation edge
coverage, Unicode truncation edge coverage and injected host-install rollback
failure coverage. The confirmation pass is not an atomic filesystem snapshot.

## Approved production observation expansion on 702e8c3

The owner approved the eight-owner scope on 2026-10-07 at 19:01 UTC.
See the plan for the authorization reference and source trace. This section
supersedes the unavailable-production-adapter limitation above.

The production adapter now uses the canonical stable read-only resolver.
All source payload reads and Git output share the strategy request budget.
File sizes are checked before allocation. Directory names are charged as read.
The scope latches safety failures even when an owner catches the exception.
The final observation compares the canonical state revision again.

Ordinary callers retain their defaults. Scoped state-version reads observe the
existing owner file without acquiring or reclaiming locks. Scoped evidence
reads reject corrupt tails without repair. Scoped virtual Git trees hash blobs
and trees in memory. They do not write an index or Git objects. The identity
matches the existing default capture for supported files. Git transforms,
non-SHA1 repositories, symlinks, submodules and invalid UTF-8 paths fail closed.
Commands cannot launch providers, external diff programs or content filters.
Only current-project authority and exact package inputs are permitted outside
the worktree. These exceptions have no cross-project retrieval authority.

Two additional transitive owners need separate approval: change-assessment
recomputation and benchmark validation. Acceptance branches needing those
owners fail closed before they run. They never launch the benchmark grader.
Useful stable production context and active verification context now validate
as reviewable. Complete acceptance replay is still limited by these adapters.

### Checks and review evidence

- `bun run check:type`: passed on the final source.
- `bun run test:files tests/strategy.test.ts tests/effective-state.test.ts tests/state/effective-state-stability.test.ts tests/effects/verification-execution.test.ts tests/acceptance-receipt.test.ts tests/acceptance-receipt-evidence-fingerprint.test.ts --timeout 60000 --max-concurrency 1`:
  passed, 122 tests, 936 assertions, nine existing gated skips across six files.
- After the authority allowlist, Git flag restriction and directory quota
  refinements, `bun run test:files tests/strategy.test.ts --timeout 60000 --max-concurrency 1`:
  passed, 25 tests, 144 assertions on the final source.
- `bun run check:state-boundaries`: passed, 324 source files.
- `bun run check:hooks`: passed, three projections.
- `bun run check:helpers`: passed, 59 projections.
- `bun run check:reference-configs`: passed, 26 projections.
- `bun run check:context-map`: passed, ten entries.
- `git diff --check`: passed.

Earlier failures exposed a generated-helper import path, unsupported literal
pathspec flags on check-ignore, a malformed fixture plan name and an overly
broad no-index restriction. They were corrected. Logs retain diagnostic
failures and successful final checks. No assertions were removed. The real CLI
readiness assertion changed from blocked to reviewable because the production
adapter now works. The test still checks unchanged repository and HOME files.
Fixtures compare canonical state and Git tree identity with the default owners.
They cover corrupt-tail refusal, default repair behavior, scope/quota failures,
mutation during collection and unchanged code, Git objects, index and state.

The nine skips are existing generic review/orchestration, cancellation and
credential cleanup cases. They require host/provider integration. The full
suite, broad host lifecycle tests, live providers, publication and deployment
were not run. The task excludes those actions. Herdr is unavailable in this
saved environment. Parent independent read-only review is pending, including
the changed readiness assertion and the expanded owners.

Remaining limits: the two acceptance adapters above, semantic entailment,
concurrent hostile directory replacement, same-size writes during a payload
read, output-envelope and Unicode truncation edge coverage, and injected
host-install rollback failure coverage. Confirmation is not an atomic snapshot.
No business goal or owner was fabricated. No push, PR or live provider ran.

## Independent static re-review fixes on 57c15efa

The parent reviewer closed the original findings and requested four P2 fixes.
The reviewer did not run the original tests. This change stays within the
approved expansion. Acceptance assessment and benchmark replay remain excluded.

1. State IO refuses an unselected memory body before opening it. Only explicit
   selection of an active item permits its body in the state observer. If the
   canonical verification tree needs an unselected or inactive body, state is
   unavailable and proposal validation blocks. The summary packet still exports.
   No partial tree stands in for the canonical tree. Production fixtures use
   bodies larger than 64 KiB across active, stale, tombstoned, archived and
   superseded lifecycle states. They use the production observer, not a seam.
2. Enabled sparse checkout fails closed before virtual-tree source capture.
   A real sparse repository fixture includes an absent out-of-cone tracked file.
   The adapter refuses it rather than hash it as a deletion.
3. Git normalizes core.filemode through config --bool --get. The read-only
   allowlist permits that exact read shape. Mode capture uses the owner execute
   bit 0o100. Fixtures compare canonical owner tree identity for mode 0645 with
   true, false, off, no, 0 and FALSE configuration values.
4. Both command paths use a shared bounded spawn capture. They charge stdout
   and stderr on success and failure. Nonzero status, signal and captured
   buffers remain available to callers. A local synthetic Git executable emits
   60,000 warning bytes on successful calls. Both paths exhaust the request
   budget. A nonzero exit fixture retains its status and both buffers.

The existing active verification readiness fixture now explicitly loads its
lesson. Its prior summary-only readiness assertion was invalid because the
canonical tree needed that body. Its readiness, corrupt-tail and no-write
assertions remain. The new production summary-only regression expects state
unavailable. Ordinary non-verification context can remain reviewable without
body selection. This is an explicit first-version limitation, not execution
permission or an alternate effective-state model.

### Verification

- `bun run check:type`: passed on the final source and tests.
- `bun run test:files tests/strategy.test.ts tests/effective-state.test.ts tests/state/effective-state-stability.test.ts tests/effects/verification-execution.test.ts --timeout 60000 --max-concurrency 1`:
  passed, 104 tests, 578 assertions, four files, no skips.
- After adding failure-buffer assertions to the stderr fixture,
  `bun run test:files tests/strategy.test.ts --timeout 60000 --max-concurrency 1`:
  passed, 29 tests, 195 assertions on the final tests.
- State boundaries (324 files), hooks (three), helpers (59), reference configs
  (26), context map (ten) and `git diff --check`: passed.

The full suite, host lifecycle checks and real providers were not run. The
scope excludes them. No push, PR, publication or deployment occurred. The
updated archive retains full and exact-delta patches, the immutable commit
bundle, file lists and command logs. Parent independent review remains pending.

## Draft PR 599 CI repair on 20ccf865

CI run 37684925885, job 113010410748, tested merge commit
83c26e1699b7b3191f87ac46a55f1749a65889bb against main 3ea2f7b.
Typecheck passed. Two test files failed. Required/CI failed as a consequence.
The three HOME isolation jobs passed, as reported by the parent.

The isolated hook bundle could not load readonly-observation.ts from a runtime
package path. The acceptance helper used a new eager dynamic require. The fix
uses a static import in the canonical helper, so Bun includes the owner in the
bundle. The existing helper generator projects its relative import path for
assets/templates/helpers. Both imports resolve the same canonical owner. No
second IO scope or compatibility fallback was added. Existing isolated bundle
execution assertions remain unchanged. A new guard checks that the owner is
included and no dynamic source require survives.

Routing eval expects all explicit-setup packages to be reachable in its model.
That model differs from default profile installation. Its two expected sets
now include strategy. A new assertion checks the explicit-setup reason. Default
profile exclusion assertions remain in strategy.test.ts. The routing corpus,
scoring rules, provider defaults and installation behavior did not change.

### Checks and limits

- `bun run check:type`: passed.
- Initial four-file run: 96 passed, two failed. The new bundle guard incorrectly
  rejected Bun's source-path comment; it now checks a require expression. The
  existing TERM-resistant descendant test timed out with status null after five
  seconds. Detached populate and successful bundled child execution passed.
- Bundle delta: seven passed, one failed. The only failure was the descendant
  timeout. This same test failed with the same status-null assertion on an
  unchanged archived main 3ea2f7b checkout in this saved container. The archive
  used local dependencies and the same isolated test runner. This proves the
  timeout also affects the baseline here; it does not prove its host cause.
  No timeout, assertion, skip condition or process cleanup code was changed.
- `bun run test:files tests/skill-routing-eval.test.ts tests/unit/hook-entry-single-file-bundle.test.ts tests/strategy.test.ts tests/acceptance-receipt-evidence-fingerprint.test.ts --test-name-pattern '^(?!.*TERM-resistant)' --timeout 60000 --max-concurrency 1`:
  97 passed, 822 assertions, one explicitly filtered baseline-failing test.
  All routing tests used the stub provider or an inspected local executable.
- State boundaries (324 files), hooks (three), helpers (59), reference configs
  (26), context map (ten) and `git diff --check`: passed.

Full CI still needs a remote rerun. The local result is not a clean full-suite
pass. The baseline timeout remains an environment-dependent validation limit.
No real provider, credential change, merge or deployment ran. The published
20ccf865 evidence remains preserved. This repair commit stays local for parent
independent review before publication to the existing draft PR.
