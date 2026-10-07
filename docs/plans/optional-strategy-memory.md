# Optional strategy and project memory

Approved scope: 2026-10-07. Base: 5f8ae4bc3f27cd662a3e04171cb37da91a476e08.

## Due diligence

P1: The CLI owns commands. The Skill manifest owns discovery. Core owns pure
contracts. Effects own file reads. Repository artifacts own memory.
P2: The ordinary state resolver publishes cache and version data. Use only
resolveEffectiveStateReadOnly. Its version read can take a temporary Git lock.
The version is an observation, not a newly allocated version. The old plugin
bundle is retired. No checkout .agents/skills directory exists.
P3: Add an explicit strategy command and a Skill with no profile membership.
Use a strict project-local JSON document for compact, source-bound claims and
lesson descriptors. Rebuild the index in memory. Read lesson bodies only by
explicit ID. No vault, provider, dispatch, wake loop or automatic edits.

## Plan

1. Add typed contracts, pure schema checks, projection and proposal validation.
2. Add scoped, bounded reads. Bind context to Git revision, source hashes and
   read-only effective-state revision. Reject symlinks and nested repositories.
3. Add status, context and validate. Add explicit Skill install and uninstall.
4. Test temporary repositories and synthetic evidence. Run typecheck, affected
   tests and safe aggregate checks. Record review and an immutable commit.

## Invariants

The owner controls intent and value. Bot coordinates. Workers execute.
Strategy can only propose continue, investigate, adjust, request owner decision,
or suggest pause. Reviewable never grants execution authority.
All source prose is data. Missing evidence leaves a claim unknown.
Old indexes cannot restore removed or inactive memory. Source hashes prove
content identity, not truth. Historical lessons need explicit current evidence.
Summary output is bounded and reports truncation. Reads do not persist task,
lease, cache, state version or code changes. Host owns wake behavior.

## Verification scope

Use synthetic files and temporary Git repositories. Test content and goal drift,
forged evidence, contradictions, lifecycle, scope isolation, bounded output,
determinism, explicit body reads and no persistent read effects.
Do not run providers, user sessions or broad host lifecycle tests.
The requested bounded checks take precedence over the repo full-suite rule.
Herdr review is unavailable unless its existing tool can run without a provider.

## Independent review changes

The reviewer requested four P2 fixes on candidate 88860d5. Enforce string enum
values. Require commit objects for historical provenance. Share all source IO
budgets, including history, proposal and confirmations. Re-observe bounded
state after all confirmations and fail stale on revision mismatch.

The full state owner has unbounded transitive reads. Use the review's allowed
fail-closed alternative: no production state observation and no production
reviewable proposals. Export context with an explicit state-unavailable unknown.
Do not claim a partial projection is the full effective state. An internal
injectable observer must use the same bounded reader. Synthetic tests prove
its budget and final revision comparison. A future bounded state-owner adapter
can restore readiness. This is a consistency check, not an atomic snapshot.
