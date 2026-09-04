# Refactor shadow entry acceptance

> **Status**: Passed
> **Base**: `11a2a6fbd02eefc736e12cdc23408049ba9ab249`
> **Substantive Change SHA256**: `sha256:38246323e0610fb09a5bd27ae2eb983625088273877f7ca5feb938657d9b6aba`

Scope is upstream handoff D1. Durable behavior and limits are documented in
`docs/researches/20260905-refactor-shadow-entry.md`. D2 publication conformance,
upstream release, and automatic hook/queue triggering are outside this slice.

Pre-fix public invocation returned `unknown command 'discover'`. A regression
for discovery-to-assessment HEAD/worktree pinning failed before the production
fix, then passed. New CLI/controller tests exercise the real parser and provider
validation with deterministic provider/author transports, plus a separate actual
process invocation against a disposable fake Codex executable. The controller fixtures are not published-provider end-to-end evidence.
A separate real local Codex invocation returned a valid proposal from fixed
disposable cycle evidence, using the production adapter and upstream validator
(proposal digest `sha256:351a7a96740ae548b8a1cf53292674207e9be15a8ebddd16748c3c9288297cf0`).
Package-local real capabilities readback reported archctx 0.5.6 and the required
refactor feature set. Combined live provider/author conformance remains distinct
from these checks.

Standard security and architecture reviews completed. Environment inheritance
was corrected by exporting and reusing the existing minimal Codex child
environment policy; a subprocess sentinel regression proves secret variables
are not forwarded. The parent independently checked the proposed delegation
admission requirement: that surface requires a live task Lease and cannot serve
the no-Lease D1 author. Upstream responsibility validation requires a non-empty
id and legal kind/source pair, not an execution principal. The local adapter
uses the trusted host Codex PATH, as a new invocation, rather than reusing any
previously admitted runtime identity. No stronger executable-attestation claim
is made.

Focused CLI/controller and process-adapter verification passed (14 tests).
Typecheck passed. All six required repository-integrity checks have passed;
task-sync was refreshed after the environment change. A packed production
install exposes `refactor discover --help`. Full suite passed: `bun test --timeout 60000` returned exit 0, with
4,179 pass, 4 skip, 0 fail and 54,119 assertions across 349 files (1,312.77 s).
The four skips are pre-existing platform/runtime cases; no D1 test was skipped.
`bun run check:type` and `git diff --check` passed. No dependencies were added.
The new controller owns the CLI orchestration/trigger receipts; its new test file
owns behavior-specific CLI/process coverage. The research document is the
durable usage and boundary reference; this archived review is verification evidence.
