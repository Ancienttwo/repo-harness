# Minimum Effective Interview routing

> Date: 2026-08-11
>
> Scope: `repo-harness-plan` and `repo-harness-product` planning protocols
>
> Runtime reference: `$interview` skill installed in the active agent environment

## Conclusion

Repo reading and `$geju` remain the first planning pass. The interview route is a
bounded escalation for high-impact unknowns that would materially change the
model, system boundary, data authority, expensive or irreversible choices, or
acceptance criteria. It is not a default discovery ceremony.

The minimum effective interview contract is:

- one interactive batch of at most three questions;
- every question carries a recommended default and states what each option
  changes;
- a second batch is allowed only when the first answers expose a contradiction;
- adopted defaults are recorded as `[ASSUMED]` with a short reason;
- unresolved gaps are recorded as `[UNKNOWN]`;
- non-interactive execution asks no questions and keeps the artifact in Draft.

If the named skill is unavailable, the current runtime may reproduce this exact
question contract through its structured question tool or numbered plain text.
That is a transport fallback only: it does not introduce a second semantic
authority or relax the decision ledger.

## Update 2026-08-14: plan route narrowed to one question

The batch ceiling above now governs the PRD route only (`prd.md` step 1, one
batch of at most 3 questions plus an accept-all-defaults path). Commit
`877a8b64` (#186, goal calibration gate) changed the plan route in
`create.md` to: a compact calibration card, then exactly 1
highest-information-gain question, zero when repo evidence resolves the
decision. Plan creation has already read the repo, so usually one high-impact
gap remains; a PRD starts from a vague idea and needs several gaps confirmed in
one pass. The `[ASSUMED]` / `[UNKNOWN]` ledger, the contradiction-only second
round and the non-interactive no-question rule are shared by both routes and
unchanged. Both rules are locked by `tests/action-command-skills.test.ts`.

## P1: boundary map

- `assets/skills/repo-harness-plan/references/create.md` owns complex planning
  escalation and the plan decision ledger.
- `assets/skills/repo-harness-product/references/prd.md` owns PRD clarification,
  `Known Unknowns`, and the non-interactive behavior.
- `$geju` owns direction framing before either route decides implementation.
- `$interview` owns the compact question protocol, not the plan or PRD output.

Out of scope: changing `discover` routing for greenfield ideas, adding a new CLI
command, or treating the external skill installation as repository authority.

## P2: concrete route

For a brownfield planning request, the agent reads repository authority, runs
the direction pass when required, and classifies remaining unknowns. With no
high-impact unknown, it drafts directly. With such an unknown in an interactive
session, it asks one bounded batch, records the accepted or defaulted decisions,
then drafts. In a headless run, it records the same gaps and stops at Draft
instead of inventing answers.

## P3: decision rationale

The invariant is that fewer questions must not become silent decision-making.
The decision ledger makes defaults reviewable while the three-question ceiling
prevents discovery from replacing delivery. At larger scale, the first pressure
point is the number of cross-domain contradictions; the bounded second round is
sufficient because unresolved contradictions remain explicit `[UNKNOWN]`
entries rather than opening an unbounded interview loop.
