# Host invariants distribution review

> **Status**: Complete
> **Owner**: Codex
> **Scope**: PR #466 distribution and merge readiness

P1: `src/cli/commands/docs.ts` loads only `assets/reference-configs`; package.json ships `assets/` and excludes docs/reference-configs. `scripts/sync-reference-configs.ts` projects every canonical Markdown asset into docs, with a byte-equality gate. No CLI/package allowlist changes are needed.

P2: installed `repo-harness docs show host-invariants` -> resolveRuntimeDoc -> asset inventory -> missing source -> unknown doc/exit 2. Existing docs CLI tests did not name host-invariants. The parameterized resolver/show regression fails before adding the canonical asset; pre-fix command: `bun test tests/cli/docs.test.ts`, evidence `/tmp/repo-harness-host-invariants-pre.log`.

P3: add the exact existing document as one canonical runtime asset, project through the existing synchronizer, retain document semantics. It is a required runtime contract, not a new abstraction or dependency. The independently authored docs-only research stays in docs/researches. Merge origin/main in a separate clean worktree; preserve main's generated architecture manifest and hook-adapters projection because this slice changes no architecture/model source. Do not pull, stash, commit or discard the main checkout's three modified files.

Test admission: extend the existing docs resolver/show case to host-invariants and compare output to the canonical document. Existing projection test proves mirror identity. Verify an npm tarball through an isolated consumer install and its actual binary's `docs list/path/show`; no global installation or npm publication. Run all root required integrity checks; CI keeps its selected coverage. No local full suite is justified for this doc distribution change.

Validation commands: `bun run sync:reference-configs`; `bun test tests/cli/docs.test.ts tests/reference-configs-projection.test.ts`; root required integrity checks; real `npm pack` + isolated `bun add <tarball>` + installed docs readback. Pre-fix tests show one host-invariants resolution failure. Final evidence and verdict follow after validation.

## Verdict: PASS for distribution and conflict correction

- Pre-fix: owning CLI test 4 pass/1 fail, host-invariants exit 2. Post-fix: docs CLI/projection 7 pass/0 fail/36 assertions.
- All nine root required integrity checks exited 0; per-command evidence `/tmp/repo-harness-host-doc-checks.json`.
- Real npm pack includes `assets/reference-configs/host-invariants.md`, excludes the docs projection; isolated consumer `bun add` succeeds; installed binary docs list/path/show succeed. The resolved asset is inside that installed package, with REPO_HARNESS_SOURCE_ROOT unset, and bytes equal the canonical source. Installation evidence `/tmp/repo-harness-host-doc-install-state.json`.
- No package metadata, dependency, runtime behavior or document semantics changed. One canonical asset is newly required; existing parameterized test owns the public lookup regression; this review is archived as completed validation. main's architecture manifest/hook-adapters projection are retained exactly; PR no longer carries their stale regeneration diffs.
- PR merge/CI remain publication steps; no npm version was published or global installation changed by this validation.
