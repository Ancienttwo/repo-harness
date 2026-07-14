# UX Feature Guard

Use this guard before implementing a new user-visible feature or intentionally
changing user-visible behavior. It freezes the product contract that the code
must preserve; it is not a second PRD, a design-system replacement, or a new
BDD lifecycle.

User-visible copy is product behavior. So are interaction rules, persistence
semantics, error states, and the decision to reuse or replace an existing
component. None of them may be invented during implementation.

## Route

1. If 2-3 genuine visual or UX directions exist and the choice is taste,
   brand, or product fit, run `repo-harness docs show design-options` first.
   The user's choice is the authority. Do not let this guard or BDD re-decide it.
2. Trace one current behavior end to end. Read the real UI entrypoint, state or
   request path, domain authority, existing components, and visible failure.
3. Fill the UX Feature Guard section in the design brief. Every line must name
   evidence or an explicit product decision; a blank is unresolved authority.
4. Express the frozen decisions as positive, negative/non-goal, and failure
   Given/When/Then scenarios.
5. Get explicit human confirmation with the rest of the design brief before a
   frontend Sprint or contract executes.

## Authority Chain

One semantic fact has one owner. The chain is one-way:

1. Explicit user decisions, `docs/spec.md`, and the approved PRD own product
   intent. A `design-options` choice recorded as `user_evidence` is an explicit
   user decision.
2. The human-confirmed design brief is the frontend slice's UX behavior
   projection. It may make the approved intent concrete; it may not reinterpret
   or override it.
3. A task contract may narrow implementation scope and must cite the design
   brief plus its scenario IDs. It does not own alternate product semantics.
4. BDD tests are executable projections of those scenario IDs. Review and test
   output are evidence that the projection holds, never a competing authority.

If two layers disagree, stop and reconcile the earliest authoritative layer.
Do not pick the convenient wording or make the contract/test silently win.

## Guard Card

The design-brief template owns the exact Guard Card field schema. This runtime
doc owns the interpretation rules and hard stops. Fill every template field; do
not restate the schema in a PRD, contract, sidecar, or local checklist, and do
not create a parallel guard artifact.

Instruction and payload are never interchangeable. For example, in “把 XXX 加入
记忆”, “加入记忆” is the requested action and `XXX` is the payload. Storing the
carrier sentence is a behavior change, not a reasonable interpretation. When the
payload is ambiguous, stop and ask; do not infer a replacement value.

## Hard Stops

- Do not change gameplay, workflow, scoring, permissions, persistence meaning,
  or other product rules unless the user or product authority explicitly changes
  them.
- Do not create a component when an existing component owns the same UI
  responsibility. Do not copy domain logic when an existing function or module
  owns it. Extend the authority or stop with the concrete mismatch.
- Do not keep old and new semantics alive through dual reads/writes, aliases,
  shadow parsers, heuristic translation, or best-effort compatibility.
- When an authoritative value is missing, malformed, unauthenticated, or
  unavailable, surface the failure. Do not synthesize product meaning from local
  regexes, defaults, or a second parser.
- Runtime runner degradation is allowed only on the same task contract and must
  be visible. It is not permission to change the feature's semantics.
- Do not silently catch an error to make the UI look successful. If a trace is
  intentionally suppressed, preserve the original message and next action.

## UX Writing And Diagnostics

Apply these rules when the feature exposes copy, status, diagnostics, help, or
machine-readable output:

- Report effective runtime values, not merely stored values. Resolve layered
  config exactly as the runtime does and annotate the source at the granularity
  of the claim.
- A diagnostic may show a verified partial state only when it labels that state
  as partial and still reports the load failure. Otherwise abort. Never replace
  failed authority with blank defaults that manufacture a second error.
- Show actionable deltas in health/diagnostic views; leave exhaustive state to
  the dedicated inspect surface.
- Keep JSON, TSV, porcelain stdout, and similar machine output undecorated.
  Human notices belong on stderr or the human-format path. Test required absence
  as well as required presence.
- Errors answer: what happened, where it happened, and what the user can do now.
  Validation errors should name rejected fields and allowed fields when those
  lists are relevant.
- Paths, IDs, and URLs that users must copy from diagnostics remain fully
  available. A visual UI may truncate them only when it offers reliable reveal
  and copy behavior.
- Keep one canonical home per changing fact. Link from other docs or surfaces;
  do not restate the same field list, precedence chain, or supported-value set.
- After behavior changes, sweep `--help`, centralized strings, docs/README,
  bundled skills, plugin/MCP descriptions, and status notes for stale meaning.
- Claims such as “recommended”, “faster”, or “better” require evidence.

These writing rules are adapted from FogMoe's
[`ux-writing` skill](https://github.com/FogMoe/agents/blob/main/skills/ux-writing/SKILL.md).
That source is guidance for UX copy and docs; the behavior-freeze, reuse,
instruction/payload, and no-compatibility rules above are repo-harness's local
product boundary.

## BDD Hand-off

Scenarios are executable examples of the frozen card, not a place to invent a
new rule. Give each scenario a stable ID in the design brief, then carry that ID
unchanged into the contract, test name/tag, and review evidence. At minimum
cover:

```gherkin
Scenario: requested behavior succeeds without changing an existing rule
  Given the current product rule and its authoritative value
  When the user performs the new UX action
  Then the requested outcome is visible
  And the frozen rule is unchanged

Scenario: a non-goal stays absent
  Given an existing reusable component or domain function owns the behavior
  When the new UX feature is implemented
  Then that authority is reused
  And no parallel component, copied logic, or unrequested product rule exists

Scenario: authority failure remains visible
  Given the authoritative value is unavailable or invalid
  When the user performs the action
  Then the UX reports what failed, where, and the next action
  And it does not synthesize a fallback value or report success
```

Use concrete product vocabulary and paths in the real brief. These examples
define the shape, not the feature's semantics.

## Boundary

This convention is judgment plus a human-confirmed brief. It deliberately does
not add a validator, ledger, sidecar, catalog, scoring model, or semantic
classifier. Product intent and the confirmed design brief remain semantic
authorities in the one-way chain above; contracts and BDD tests are projections,
and tests/reviews are evidence.
