# Bun startup cost in temporary-directory fixtures

## Observed boundary

On this macOS host, a trivial `bun -e 0` launched with its working directory beneath the default `/private/var/folders/.../T` repeatedly costs about 0.59–0.87s; under `/private/tmp` it costs about 0.016–0.024s. A package.json in the slow directory does not remove the cost. Both installed Bun 1.4.2 and the existing pinned Bun 1.4.0 show the slow-path behavior. A crossed HOME comparison rules out the initially suspected disposable HOME as the distinguishing variable. The lower-level OS/runtime cause has not been established. Do not generalize these timings to other machines.

## Concrete path

`tests/architecture-drift.test.ts:271` creates a temporary Git fixture with projection disabled, changes an unmapped workspace file and a mapped source file, then invokes the real CLI with a 30s deadline. `src/cli/commands/architecture-projection.ts:64` drains the legacy cascade through `processArchitectureCascade`. That calls the package-owned `assets/templates/helpers/architecture-queue.sh`, then `context-contract-sync.sh`, then capability-context.

Temporary instrumentation in the clean pre-adoption baseline traced the first workspace-file queue call at 9246ms (the nested shell took 7153ms). At 25s the active descendant was the context helper's `architecture-event.ts json-get --key contract_claude`, before reaching the mapped source tail. `scripts/context-contract-sync.sh:385` reads 15 event fields through separate runtime invocations before its root-scope no-op decision at line 422. The wait is cumulative subprocess work, not evidence of a lock deadlock or an ArchContext projection RPC failure. Instrumented files were restored byte-for-byte; no diagnostic code ships.

## Controlled verification

Candidate source is unchanged from the accepted adoption execution slice; source baseline `176ec3c87548c4904a95e8c559eb579ca662a408` independently reproduces the 30s timeout with archctx 0.5.11. With only an isolated `TMPDIR` beneath `/private/tmp`, the unchanged candidate case passes in 5.31s. Replaying all three previously failing files serially with the same Bun 1.4.2, `--timeout 60000 --max-concurrency 1`, original inner deadlines and scrubbed harness environment passes:

| Existing file | Tests | Assertions | Time |
| --- | --- | --- | --- |
| architecture-drift.test.ts | 19 | 141 | 9.281s |
| architecture-projection-continuation.test.ts | 4 | 46 | 4.371s |
| architecture-projection-provider.test.ts | 40 | 224 | 13.273s |

Total: 63 tests / 411 assertions; 26.925s across the three serial processes. No product code, fixture assertion or timeout was changed. Diagnostic files live at `/tmp/drain-process-trace.jsonl`, `/tmp/drain-cwd-startup-comparison.json`, `/tmp/drain-private-tmp-candidate.log` and `/tmp/archctx-0512-controlled-tmp-results.json`.

## Decision

For this release verification, use a dedicated operator-owned TMPDIR under `/private/tmp`; TMPDIR is already a declared Verification Plan input, so its identity is captured in canonical execution evidence. Keep strict deadlines and provider authority unchanged. This is a bounded verification-environment correction, not a production fallback or a claim that the full release gate passed. Any later helper batching optimization or root-scope short-circuit needs its own contract and must preserve authoritative event validation.
