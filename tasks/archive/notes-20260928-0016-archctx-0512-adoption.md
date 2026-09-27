> **Archived**: 2026-09-28 00:16
> **Related Plan**: plans/archive/plan-20260926-2343-archctx-0512-adoption.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260928-0016
> **Archive Projection V1**: `plans/plan-20260926-2343-archctx-0512-adoption.md` => `plans/archive/plan-20260926-2343-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/notes/20260926-2343-archctx-0512-adoption.notes.md` => `tasks/archive/notes-20260928-0016-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/contracts/20260926-2343-archctx-0512-adoption.contract.md` => `tasks/archive/contract-20260928-0016-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/reviews/20260926-2343-archctx-0512-adoption.review.md` => `tasks/archive/review-20260928-0016-archctx-0512-adoption.md`

# ArchContext 0.5.12 candidate adoption

The actual CLI does not accept a target/global version override. Candidate package and both runtime pins must agree. Upstream registry queries for archctx@0.5.12 and archctx-contracts@0.5.12 returned E404; source lock regeneration and shipping remain pending. Canonical candidate install paths avoid npm treating /tmp -> /private/tmp as an external linked root, which had left old nested versions installed.

Development-only dependency staging reuses the two already npm-installed 0.5.12 packages from the verified canonical prefix. npm could not resolve the uncached latest dev dependency metadata offline, and Bun no-save still tried the unavailable registry pins; neither failed command changed the source lock. No more installer retries were used. Final consumer evidence must come from its newly packed tarball installed with the declared canonical file overrides, not this development staging.

> **Substantive Change SHA256**: `sha256:75a72ec732a898641b11319b4d395beb8364fdc9fb1900ab32001453aef2d64f`

Initial selected coverage: 133 pass / 1 fail across six files, typecheck passes. The single macOS global-runtime-init older-Bun launcher test also fails unchanged in the accepted d6deed06 worktree under the same Bun 1.4.0 / TMPDIR; preserve it as a baseline limitation, not a version-adoption fix. Its managed dependency step correctly observes 0.5.12 before the unrelated fleet launcher failure. Logs: /tmp/issue225-0512-tests.log and /tmp/issue225-0512-baseline-launcher.log.

Final candidate: all 838 packaged files match this worktree. Consumer integrity `sha512-lzf/2Hh68M9hUZFyDi8ox4s1j1VmnWYPjdvGbELckwjwwqNR/3VnPw2PrjsE7q3zAy8DKwkVsuY2PvidmpHL/g==`. Canonical offline npm installation in `/private/tmp/issue225-final-installed-v2` declares the candidate consumer and both producer tarballs; actual nested dependencies are 0.5.12 and no registry/global install occurred. The installed CLI applies the correction through the daemon; all 45 ADR title/status/link rows match authoritative frontmatter and resolve to existing files. Repeated projection check returns noop, with no refresh signals. A real 0.5.11 package is rejected by the unchanged strict resolver. ArchContext records the durable packet in `docs/verification/20260926-installed-producer-0512.json`.

Selected version coverage totals 215 pass / 1 known baseline failure across 13 existing test files; final typecheck and the nine root integrity checks pass (task digest refreshed after final AXR runner pin alignment). Historical AXR result files were not rewritten. Complete consumer contract acceptance is not claimed because the named global-runtime-init test remains red. Registry E404 and the unchanged old bun.lock are explicit ship blockers, not waived conditions.


## Approved normal adoption and launcher blocker

Owner approved merge/publication/downstream adoption. #454 merged as 176ec3c8; this candidate integrated that exact main with no product conflicts. Registry lock and release text await real 0.5.12 publication.

P1: global-runtime validates one Bun executable; fleet installation is a shell subprocess. P2: a pinned Darwin Bun 1.4.0 executable ends in bun.exe. bindBunRuntimeEnv only prepends its directory, while install-agent-fleet independently searches for a file named bun; the injected PATH bun1.0.0 is therefore selected after validation succeeded. P3: pass the validated executable explicitly and make the helper honor it without fallback when supplied; preserve standalone discovery and minimum-version rejection.

Root cause evidence: existing regression tests/cli/global-runtime-init.test.ts, test named CLI subprocesses stay bound to the validated launcher Bun when PATH contains an older Bun, fails under /Users/kito/Projects/arch-context/_ops/toolchain-bun-1.4.0/node_modules/.bin/bun on dffbe69b (0 pass/1 fail; fleet reports found1.0.0 after launcher1.4.0 passed). Earlier unfixed baseline log /tmp/issue225-0512-baseline-launcher.log shows the same boundary failure. This is the one directly blocking fix; no unrelated remediation is authorized.

Bounded fix validation on pinned Bun 1.4.0: the existing older-PATH launcher regression now passes (1 test, 6 assertions); all 22 existing installer tests pass (262 assertions); a new invalid-explicit-runtime guard passes (1 test, 4 assertions), proving it does not rediscover a supported PATH Bun. Typecheck and all 59 helper parity checks pass. These checks supersede the earlier launcher baseline limitation only; real registry lock and final consumer acceptance still await publication.


## Published registry adoption (2026-09-27)

Both npm manifests now report 0.5.12. `bun install` regenerated only the two direct pins and their registry integrity records; `bun install --frozen-lockfile --force` replaced candidate staging with registry-installed packages. Upstream source inspected at `Ancienttwo/arch-context@331c526`, relative to `v0.5.11`: ADR frontmatter/title and index-relative links, controlled manifest/ADR/root-contract ChangeSets, shared daemon projection orchestration, Explorer/runtime hardening, and loopback RPC keep-alive reset prevention. The latter uses a fresh local connection rather than retrying an ambiguously committed mutation; see upstream `docs/researches/20260927-rpc-keepalive-hotfix-0512.md`. No new consumer API, dependency, file or abstraction is needed beyond the already aligned exact-version adoption.

Canonical final verification runs once on this registry lock and existing accepted launcher fix, based on origin/main `176ec3c8`. Existing file-tarball evidence remains historical and is not relabeled registry evidence.

Registry verification outcome: actual package-local `capabilities --json` reports 0.5.12 and the required projection/refactor features. Typecheck, hooks/helpers/reference-config parity, deploy SQL order, task-sync, inspection and init dry-run pass. Focused coverage across seven existing files: initial run 139 pass / one 5-second timeout; rerunning only that test with the repository's prescribed `--timeout 60000` passes (1 pass, 7 assertions). The first run accidentally used Bun's default timeout; no source or test was changed. Logs: `/tmp/archctx-0512-focused.log`, `/tmp/archctx-0512-focused-timeout-correction.log`, `/tmp/archctx-0512-integrity.json`.

Formal acceptance is blocked before the expensive release command starts: `verify-sprint --prepare-acceptance` returns `human-action-required / unresolved-major-change`, reason `verified-flow-proof-changed`; provider snapshot also reports CodeGraph unavailable. The returned candidate affects 27 capabilities. `check-architecture-sync` reports one blocking human action. Separately, `check-task-workflow --strict` reports the pre-existing adoption plan lacks Evidence Contract, Promotion Gate, Promotion Reason, Verification Boundary and Rollback Surface. These were not repaired under this dependency task; no model edits, acceptance bypass, full release pass, merge, publication or global adoption is claimed. Failure log: `/tmp/archctx-0512-adoption-final-gate.log`. Next bounded slice: reconcile this candidate's projection proof and plan admission, then run the unchanged final verification/acceptance gate.

## Approved proof and workflow reconciliation

Owner approved the next bounded slice. Plan Evidence Contract / Promotion Gate metadata now passes strict workflow validation. `tools ensure codegraph --init --sync --no-install-deps` initialized only this worktree's ignored index. The first indexed check exposed a still-running 0.5.10 daemon; the package-owned `daemon upgrade` replaced it with 0.5.12. Indexed check then returned `planned`, CodeGraph `ready`, zero human actions, and exactly one changed file: `docs/architecture/.projection-manifest.json`. Producer apply completed without refresh signals. The manifest's model digest and semantic flow-proof digest are unchanged; this is current source/provenance reconciliation, not a semantic model change. No nodes, source code, dependencies beyond the approved pins, new files or abstractions were added in this unblock.

Exact proof-only reconciliation completed successfully for `sha256:6bebfcf77faf238275b93a94ee55996b3bc2cf9a42fade07cc198d02aa5aa3fa`; canonical receipt is retained under ignored architecture-projection runtime state. Final release verification starts after this frozen registry/projection/workflow checkpoint.

Final verifier entrypoint correction: the first post-reconciliation prepare command selected the installed PATH repo-harness, whose real capability status points to global archctx 0.5.10. That older client invalidated the new daemon connection record, while the task-started 0.5.12 process still owned its lock. The supported `daemon stop` refused without a connection file; terminated only the verified task-started PID and restarted through the candidate package. Final verification explicitly sets the existing `REPO_HARNESS_CLI_BIN` override to this worktree's executable `src/cli/index.ts`, as an operator-owned harness override; harness-internal variables are excluded from contract inputs.env by the canonical schema. The expensive release check had not started, so no full suite evidence was discarded or repeated. Global installation is unchanged.

The inherited Verification Plan incorrectly declared REPO_HARNESS_DIFF_BASE as a user input. Removed that and the added CLI override from inputs.env to satisfy its explicit internal-environment prohibition; command and strict verification behavior are unchanged. Preflight still had not executed the expensive check.

## Frozen release gate disposition (2026-09-27)

Frozen source checkpoint: `b8c1e373d91dd7c8ce4ad5c91cc581a738c17559`, target `176ec3c87548c4904a95e8c559eb579ca662a408`. Canonical prepare now reports automatic projection `noop`. Live acceptance readback has one reconciliation receipt, zero unresolved candidates and zero invalid artifacts. Plan validation and strict workflow checks pass.

The first actual release-gate execution entered its four-worker isolated suite and observed four failures across three existing files before cancellation: `tests/architecture-drift.test.ts:296` real CLI drain returned null at its 30s deadline; `tests/architecture-projection-continuation.test.ts:145` Stop subprocess returned null at its 35s deadline; `tests/architecture-projection-provider.test.ts` process-tree boundary assertion failed and stale-local-provider status subprocess reached its 10s deadline. These are observed failures, not proven regressions or proven flakes. The previous focused provider run passing does not establish their cause under the full pool.

Stopped the owned release process group after multiple outside-slice failures, per the scope stop rule, rather than executing the rest of a known-red expensive matrix. Canonical execution `vx-23b1c6abda804e3d8575` records SIGTERM after 178567ms and preserves diagnostics in `.ai/harness/runs/verification-vx-23b1c6abda804e3d8575.log`; the run is failed/incomplete, never PASS. Current prepare snapshot: `.ai/harness/runs/run-20260927T230356-61981-20260926-2343-archctx-0512-adoption.json`. The separate reference-config check passed. No external semantic review was consumed, no acceptance receipt was fabricated, and no merge/publication occurred.

Next bounded slice: replay only the three named files serially on this frozen candidate using the repository timeout, then compare the specific failing subprocess paths against the same base if still reproducible. Diagnose concurrency/resource pressure versus a product defect before any source fix or repeat full release gate. No change to concurrency, deadlines, assertions or product behavior was made here.

## Approved serial diagnosis (2026-09-27)

Candidate `90eb3dfadcebb328b8524c073bbb70805f85513d` differs from frozen `b8c1e373` only in plan/notes; executable content and dependency lock are identical. Ran exactly the three named files sequentially, each in its own Bun 1.4.2 process with `--timeout 60000 --max-concurrency 1`, harness-internal environment scrubbed and `REPO_HARNESS_TEST_EXPENSIVE=1`, matching the release child environment. No source/test/deadline/concurrency-policy change was made.

| File | Serial result | Duration |
| --- | --- | --- |
| architecture-drift.test.ts | 18 pass / 1 fail; same 30s CLI drain deadline | 41.15s |
| architecture-projection-continuation.test.ts | 4 pass / 0 fail, including bundle Stop | 37.57s |
| architecture-projection-provider.test.ts | 39 pass / 1 fail; process-tree outer 4s deadline; stale-provider status passes | 21.78s |

Total: 61 pass / 2 fail across 63 tests, 100.50s. Logs `/tmp/archctx-0512-serial-{0,1,2}.log` and summary `/tmp/archctx-0512-serial-results.json`.

Baseline comparison used a clean detached worktree `/tmp/repo-harness-0512-baseline-20260927` at `176ec3c87548c4904a95e8c559eb579ca662a408`, frozen registry install of archctx/contracts 0.5.11, and identical runtime/flags/environment. Only the two still-failing named cases were run sequentially. CLI drain reproduces the same null status at 30s (30.43s total), proving the failure also exists before this dependency adoption. Process-tree case passes alone on baseline (4.17s total). A single matching isolated candidate run also passes (4.13s total, 3 assertions). The process-tree failure is execution-context-sensitive; these observations do not prove its scheduling/root cause or justify relaxing its assertion. No full gate rerun.

P1: CLI drain/cascade and provider process supervision own these paths; upstream ArchContext semantic/model changes are not the affected authority. P2: the drift fixture configures projection disabled, invokes CLI drain, which calls drainArchitectureDriftCascade -> processArchitectureCascade, then must enqueue the mapped source path and advance its cursor; the parent kills this real subprocess at 30s. The provider fixture separately invokes a 4s outer subprocess to verify bounded cleanup of an inherited-pipe descendant. P3: retain all deadlines and assertions; the first deterministic blocker is the legacy disabled-provider cascade, which fails on both baseline and candidate. The next bounded slice should trace which helper/child owns that wait, using the one failing named case at tests/architecture-drift.test.ts:271 and src/cli/commands/architecture-projection.ts:64. The main thread has not proven a production root cause. All relevant process-runner/supervisor/launcher and architecture-drift source bytes are unchanged against baseline.

Baseline worktree is retained clean for that exact comparison. Current release gate remains failed/incomplete; no external acceptance, merge or release is implied by these diagnostic passes.

## Resolved subprocess diagnosis

The approved trace established execution-directory-sensitive Bun startup overhead in this host's default temporary tree; it did not identify a product regression. The unchanged case passes in 5.31s when only TMPDIR moves beneath /private/tmp, and all three files then pass (63 tests / 411 assertions). Canonical durable P1/P2/P3 evidence, controls, limitations and the reason for the single new research file are in `docs/researches/20260927-bun-temporary-directory-startup.md`. The baseline instrumentation was restored exactly and baseline remains clean. No production code, assertion, timeout, compatibility path or abstraction was added. Existing full release verification will run once in the demonstrated environment; this is justified by the failed environmental control, not a retry-until-green strategy.

## Final accepted candidate (2026-09-27)

This section supersedes the earlier failed/incomplete verification state. Frozen candidate `5674c18415c094742b66c2a0700e48278bb8a501`, target `176ec3c87548c4904a95e8c559eb579ca662a408`, completed the unchanged canonical release gate in 1,012,177 ms using the declared isolated TMPDIR input. All 455 isolated test files and the aggregate governance, package dry-run and real tarball-install checks passed. Execution `vx-c3222e7004a047bda3bf`; separate required reference-config execution `vx-e6d19a75fbaf41b98a3b` passed. Canonical snapshot: `.ai/harness/runs/run-20260927T232522-84760-20260926-2343-archctx-0512-adoption.json`. No production source, assertion or deadline changed in the environment diagnosis.

Official `codex-plugin` review passed with no findings and exactly matched the verification subject `sha256:92114eae500c5a9ba2f94c989c25f43c037df5bf0a9e1444b3c7951fdd983b21`. Verbatim transcript:

```json
{"verdict":"approve","summary":"No material blocking defect found in the scoped diff against the exact pinned base. Working-tree overlays are empty. Read-only review only; tests were not rerun.","findings":[],"next_steps":[]}
```

Typed AcceptanceReceipt recorded as `external_pass`, reviewer `Codex`, source `codex-plugin`, issued 2026-09-27T15:45:51.029Z. Final `verify-sprint` reported `Sprint acceptance finalized without rerunning verification`; the review file is its durable projection. No waiver or synthetic pass was used.

Integration remains pending: local main is at the exact accepted target `176ec3c8`, but its checkout contains the unrelated untracked `plans/plan-20260914-1040-herdr-kanban-session-messaging.md`. The canonical `contract-worktree finish` rejects any dirty target before merge (`scripts/contract-worktree.sh:1937` onward). This task did not move, stash, ignore, commit or delete that file, and did not bypass the guard or invoke a predictably refused closeout. The accepted source branch and all runtime evidence remain available. Resolve the receiving worktree boundary while preserving that WIP, then use canonical closeout; do not rerun the completed release gate or semantic review for this unchanged subject. Hosted CI, merge, repo-harness 0.19.3 publication and global runtime adoption are not claimed.
