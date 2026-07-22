# Implementation Notes: epc-03-postbash-observed-importer

> **Status**: Active
> **Plan**: plans/plan-20260722-1810-epc-03-postbash-observed-importer.md
> **Contract**: tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md
> **Review**: tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md
> **Last Updated**: 2026-07-22 18:10
> **Lifecycle**: notes

## Design Decisions

- **Existing `post-bash-latest.json` write path failure semantics
  (observed, not assumed)**: `runCommandObserved`
  (`src/cli/hook/command-observed.ts`) wraps essentially its entire body
  -- from input parsing through the `post-bash-latest.json` write -- in
  one `try` block. Any thrown error anywhere in that block is caught by
  one `catch` that returns `{ exitCode: 1, stdout: '', stderr:
  '${warnings()}[PostBash] ${message}\n', reason: 'write-failed' }`, with
  no differentiation by which statement threw. A separate, earlier
  early-return path (repair-circuit-tripped) returns `exitCode: 2` before
  ever reaching the `post-bash-latest.json` write; that branch is
  untouched, so the ledger import correctly never runs there either,
  mirroring how the checks-file write itself doesn't run there. The
  ledger import call was placed as a plain statement inside the same
  `try` block, immediately after the existing write and before the final
  success `return`. On failure it throws `new Error(\`ledger import
  failed (${reason}): ${message}\`)`, caught by the *same* pre-existing
  `catch` -- identical `exitCode`/`reason`/stderr-prefix envelope as any
  other failure in this function, no new fallback, no new severity. No
  new stdout messaging was added on the success path (not asked for by
  the Goal).

- **Repo-state identity fields (`base_commit`/`target_commit`) degrade to
  `unbound`, not just the contract-derived fields**: the Goal's "computed
  from repo state where available" qualifier turned out load-bearing.
  Every existing call site of `runCommandObserved` was read before
  wiring: `tests/command-observed.test.ts`,
  `tests/harness-circuit-breakers.test.ts`, and one path in
  `tests/cli/hook.test.ts` all invoke it against a bare `mkdtempSync`
  directory with no `git init`. Treating unresolvable repo state as a
  hard failure (mirroring EPC-02's stricter refusal style) would have
  turned essentially every existing `command-observed.ts` test red the
  moment this package's wiring landed. Decision: `base_commit`/
  `target_commit` independently fall back to `UNBOUND_SENTINEL` when
  `git rev-parse --verify <ref>^{commit}` fails, the same sentinel
  already used for the contract-derived fields and for the same
  underlying reason -- `observed` never satisfies a gate (D4), so there
  is no correctness reason to refuse just because git state is
  unavailable. Verified empirically: the full existing
  `command-observed.test.ts` (11 tests), `harness-circuit-breakers.test.ts`,
  `hook-runtime.test.ts`, `cli/hook.test.ts`, and `hook-contracts.test.ts`
  suites were re-run after the wiring change and stayed green with no
  edits to any of those files.

- **"Malformed input" does not require a non-empty `command`**: the
  existing "keeps malformed host input observable..." test in
  `command-observed.test.ts` deliberately feeds non-JSON stdin, which
  resolves `command` to `''` via the existing fallback chain, and expects
  `exitCode: 0`. Rejecting an empty command as malformed would have
  turned that pre-existing green test red. `command` is still
  type-checked (must be a string); only `exitCode` (must be an integer),
  `durationMs` (must be finite and >= 0), and `rawOutputPath` (must be
  repo-relative when present) are validated as possibly malformed.

- **D6 redaction over-triggers on realistic hashes AND realistic paths**
  (caught red-handed during the first real test run, not just inferred
  from the plan's warning): a payload string carrying a full sha256 hex
  digest, or a realistic repo-relative raw-output path such as
  `.ai/harness/runs/bash-output/post-bash-<ts>-<pid>-<hash12>.log`, is a
  single 32+ char run of `[A-Za-z0-9+/_-]` with no dot to break it --
  `/` is *inside* the redaction charset, so directory separators do not
  help. Observed failure: the literal path
  `.ai/harness/runs/bash-output/post-bash-example.log` came back as
  `.sha256:<64-hex>.log` in the emitted event's payload. Resolution:
  neither the payload's `command_hash` nor its raw-output reference
  stores the full string. `command_hash` is a 16-hex-char prefix of the
  real hash; the raw-output reference (renamed `raw_output_ref`, not
  `raw_output_path`, to avoid implying it is directly openable) is a
  fixed 24-char suffix of the real path. Both lengths are unconditionally
  under the 32-char threshold regardless of caller input -- a fixed-length
  slice is robust to any reasonably formed input without coupling this
  module to `command-observed.ts`'s specific filename shape. The
  full-fidelity hash lives only in `subject_identity.command_hash` (and
  `subject_hash`), which is not payload and is not redacted.

- **`subject_hash` equals `command_hash` for an observed command**: D3's
  frozen field list is shared across every evidence producer, but its
  semantic meaning is supplied per-producer. There is no code-diff
  "verification subject" for a PostBash observation (unlike EPC-02's
  `buildReviewSubject` use), so `subject_hash` is set equal to
  `command_hash` (`sha256:<hex(command)>`) -- the thing actually being
  observed is the command itself. Zero functional consequence for gate
  satisfaction, since `observed` events can never satisfy a machine gate
  regardless of `subject_hash`'s value (D4); the field only needs to be a
  non-empty string to satisfy the frozen schema.

- **`worktree_id` fallback and the genesis race**: `appendGenesisRecord`
  (EPC-01, read-only) returns the *existing* genesis record unmodified --
  including its `worktree_id` -- whenever one already exists with a
  matching epoch, silently ignoring whatever `worktreeId` the caller
  passed. So this module's own `worktreeId` argument only matters if it
  happens to write genesis first in a fresh worktree. `verify-producer.ts`
  derives its `worktreeId` from its own contract's filename stem, which
  assumes a contract always exists (true for verify-producer, since it
  fails closed otherwise). This module must also work when no contract is
  bound at all, so it uses `workspaceId(repoRoot)` (a hash of the git
  toplevel real path, already needed for `env_provider_id`)
  unconditionally as its `worktreeId` argument -- deterministic per repo
  root regardless of contract state, reusing a helper already needed
  rather than adding a second contract-stem-based code path. Every real
  event's own `worktree_id` field still uses `genesis.worktree_id` (the
  returned record), matching `verify-producer.ts`'s pattern, so whichever
  producer wrote genesis first is always authoritative.

- **Private per-producer helpers, not shared with `verify-producer.ts`**:
  `resolveContractPath`, `isContractCommittedClean`, `lastCommitTouching`,
  `parseContractAllowedPaths`, `gitOutput`, `workspaceId`,
  `providerCliVersion`, and `resolveReviewBaseRef` are structurally
  similar to (but a separate, non-exported copy from)
  `verify-producer.ts`'s equivalents. Deliberate, not accidental
  duplication: the sprint's R4 wave-qualification rule requires the
  EPC-02/03/04 parallel wave to share no store writer, projection writer,
  or barrel/export file, and `verify-producer.ts` was explicitly named a
  "pattern reference (read-only)" rather than an import target for this
  package. `ensureRepoRelativePath` (`src/effects/path-safety.ts`) and
  `uniqueSorted` (`src/effects/review/diff-fingerprint.ts`) *are* imported
  directly -- both are pre-existing, general (non-evidence-domain)
  utilities that EPC-02 itself already imports the same way, so reusing
  them is precedented and outside R4's "no shared store/projection
  writer" scope.

## Deviations From Plan Or Spec

- None. The Goal's "computed from repo state where available" and the
  redaction guidance were both explicit in the plan; the two design
  decisions above are applications of that guidance, not departures
  from it.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Hard-fail when git state is unresolvable (mirror EPC-02) vs. degrade to `UNBOUND_SENTINEL` | Degrade | EPC-02's stricter rule protects an `authoritative_machine` gate; `observed` can never satisfy a gate (D4), and hard-failing would break every existing non-git `command-observed.ts` test fixture |
| Store the full raw-output path / full hash in the payload vs. a short fixed-length reference | Short reference | The full forms trip D6's 32+ char dot-free redaction and come back double-hashed and useless; a fixed-length slice is unconditionally safe |
| Derive `worktree_id` from a contract filename stem (like `verify-producer.ts`) vs. a repo-root hash | Repo-root hash | This module must work with no contract bound at all; the hash is always available and is already needed for `env_provider_id` |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Red-first: `bun test tests/evidence-post-bash-importer.test.ts` failed
  with "Cannot find module '../src/effects/evidence/post-bash-importer'"
  (0 pass / 1 fail / 1 error) before `src/effects/evidence/post-bash-importer.ts`
  existed; 12/12 pass after implementation.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
