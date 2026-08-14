# Implementation Notes: terminal-test-blockers

> **Status**: Completed
> **Plan**: plans/plan-20260814-2008-terminal-test-blockers.md
> **Contract**: tasks/contracts/20260814-2008-terminal-test-blockers.contract.md
> **Last Updated**: 2026-08-14 21:30

## Decisions

- The two failures are isolated from hook-effect work because neither target path is legal under that contract.
- Diagnostic agents must populate the four-field Root Cause Evidence before production edits.
- Closeout fixture PID files are parsed only as strict positive safe integers. Invalid or empty `ps` output is never passed to `process.kill`; process-group cleanup still uses the validated negative group PID.
- Benchmark packaging now stages one source tarball, walks the installed production dependency graph, and copies each package's own files to its source-relative `node_modules` path. The source package manifest is unchanged; only the staged manifest loses install-time dependency metadata so Bun cannot consult a registry before using the embedded closure.
- Dependency identity is the real source path, not package name, so nested versions are retained. Nested `node_modules` directories are excluded during each package copy because they are queued and copied independently.
- Reuse coverage installs the one immutable artifact twice with unique HOME/cache roots and npm/Bun registries fixed to `http://127.0.0.1:9`, proving the tarball is self-contained without ambient registry or cache state. The artifact listing also checks every current direct dependency under `package/node_modules/`.

## Evidence

- `.ai/harness/runs/terminal-test-blockers/closeout-runner-pre-fix.log`: unchanged fixture passed eight assertions then exited 137.
- `.ai/harness/runs/terminal-test-blockers/benchmark-reuse-pre-fix.log`: fresh-cache registry-unavailable reuse test failed before install could complete; `benchmark-reuse-pre-fix-detail.log` records all five unresolved runtime packages.
- The contract's benchmark repro pins both npm/Bun registry authority to `127.0.0.1:9` and an explicit fresh cache root, so a future rerun distinguishes a self-contained artifact from ambient cache or registry success.
- Red-green: the closeout focused suite passed 24 tests under complete process observation; the benchmark focused suite passed 31 tests (211 assertions), including two immutable artifact installs. Sandboxed benchmark execution still reports `ps` EPERM for the descendant test; escalated run is the authoritative green result.
- Hermetic full suite: `env -u REPO_HARNESS_NODE_BIN -u REPO_HARNESS_SOURCE_ROOT bun test` completed with `2375 pass / 1 skip / 0 fail / 18388 expects` across 184 files in 716.39s.

## Open Questions

- Contract-authorized human acceptance was supplied by the repository owner's explicit ship-and-merge direction after implementation and repository verification completed; no private diff was disclosed externally.
