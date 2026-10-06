# Private pstack watcher experiment

This directory is a bounded offline test harness. It is not a product API.
It is outside package output and normal test discovery. It has no entry in the
CLI, pipeline, hook, or runtime registry. Do not install the pstack plugin.

## Plan and fixed inputs

The parent plan is [the document handoff and reuse plan](../../../plans/plan-20261006-0910-document-handoff-pstack-reuse.md).
That plan is owned in a separate change and may not exist on this branch yet.

- repo-harness base: `ef695fb9f964f29342ee6c98ce150601006eb40f`.
- Upstream: `cursor/plugins@df581122cde17e6e27686b5a448bde23e4ad4318`.
- License: MIT, copyright 2026 Lauren Tan. See `vendor/LICENSE`.
- Full source file hashes and exact byte status: `PROVENANCE.json`.

P1: Map the public collector, pure readiness projection, and watch-pr modules.
P2: Trace imports, reader calls, queue state, retry state, and event output.
P3: Compare fixed facts. Keep the existing harness readiness result authoritative.

## Bounds

Use only installed Bun and project dependencies. Do not run upstream bootstrap,
CLI, Commander, plugin setup, store, ledger, locks, inbox cleanup, Graphite,
Cursor Task, agents, or live provider operations. Tests use frozen reader inputs,
a logical clock, and in-memory output. The preload rejects process creation and
network APIs. The upstream default reader is never constructed.

The four runtime source modules and two selected pure test files are byte-exact
copies. `github.ts` imports child_process but does not call it at module load.
No production module was changed. Tests inject the harness public collector's
existing `gh_runner` seam. All source imports were read before execution.

## Comparison

1. Compare observer results with the current public collector and pure predicate.
   Each adapter independently replays the same frozen temporal identity source.
   Label direct decoder probes separately from default transport behavior.
2. Test pending, failed, unknown, exact head/base, unstable identity, incomplete
   review pages, check pagination, repeated events, retry, cancel, and stack state.
3. Count semantic differences, duplicate events, recoveries, and reader calls.
4. Separate observer omissions from misuse as a merge gate. READY is not GO.
   Exit code zero is not acceptance. A status-only zero says only that it read.
5. Record code size, dependencies, adapter work, and residual risks.

Adopt only a bounded, non-authoritative part with measured incremental benefit.
Prefer a small adapter when the scheduler or renderer helps but its input contract
must change. Select none if the baseline matches the benefit at less cost. A new
production integration requires parent review. This experiment does not start it.

## Run

From this directory, with the installed Bun on PATH:

    bun test ./comparison.test.ts ./vendor/github.test.ts ./vendor/policy.test.ts --timeout 60000 --max-concurrency 1

From the repository root, type-check the experiment:

    node node_modules/typescript/bin/tsc --noEmit -p experiments/private/pstack-watch-pr/tsconfig.json

From the repository root, also run `bun run check:type`.
The isolated test command replaces the normal runner because its preload creates
a child process. This experiment explicitly disallows child processes in tests.
It does not add a full-suite or security-scan requirement.
