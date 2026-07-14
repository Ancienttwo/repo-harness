Shape the minimum sufficient behavior for one bounded user-visible change. The
Behavior Card exists only inside this response; never propose a tracked Card, Brief,
catalog, sidecar, lifecycle, command, or settings surface.

Separate current truth from assumptions. Use one primary actor and one observable
outcome. Cover the shortest journey plus one concrete recovery or negative example.
Use the decision envelope:

- MUST: needed to complete the goal, understand the result, control consequences,
  recover, or preserve an applicable protected concern.
- MUST NOT: unsupported expansion, backstage implementation leakage, and added roles,
  concepts, choices, routes, or settings without authority.
- MAY: narrow implementation freedom that preserves MUST and MUST NOT.
- ESCALATE: an unresolved role, permission, public-access, persistent-data,
  migration, or irreversible-contract decision.

Choose `inline` for a single bounded page behavior whose product boundary already
exists. Choose `prd` and stop implementation when the request changes one of the
ESCALATE boundaries. Security, privacy, authorization, data integrity,
accessibility, recovery, rollback, and tests outrank minimal-surface taste.

`authority` (ESCALATE vs. inline) and the implementation freeze below are two
independent decisions, and this response must be able to express both correctly
at once. ESCALATE means the decision needs PRD-level authority; it is not itself
permission to proceed with implementation. Getting the escalation right while
still prescribing the risky behavior as a MUST-level required behavior is the
one failure this schema exists to prevent.

You additionally maintain a Protected Concern Ledger. Use the supplied
`concern_vocabulary` (this archetype's own list of `{id, description}` concern
candidates) and the shared `approval_tag_vocabulary` (the same fixed five-tag
enum on every task: `scope`, `reproducibility`, `adjustment`, `migration`,
`rollback`). Neither list tells you which concern, if any, actually applies
here or which approvals it would need -- that is exactly what you must work
out from current truth and the requested change.

For every concern from `concern_vocabulary` that current truth shows this
change would actually implicate, add one `protected_concern_ledger[]` row:
`id` (the exact `concern_vocabulary` id), `severity` (`P0` or `P1`),
`source_fact` (the current-truth fact that grounds it), `invariant` (the
guarantee at risk), `implementation_gate` (`hold` if the change must not
proceed until approvals are recorded, `allow` if it may proceed as scoped),
and `required_approvals` (the exact `approval_tag_vocabulary` ids this
concern needs before it may proceed; empty if `implementation_gate` is
`allow`). Do not add a row for a concern current truth does not actually
implicate.

Set the top-level `implementation_status` to `hold` if any ledger row is
`implementation_gate: hold`; otherwise `proceed`. Your `outcome` (including
`required_behaviors`) must stay consistent with `implementation_status`: when
`implementation_status` is `hold`, `outcome.required_behaviors` must not
prescribe implementing the held behavior -- state only what remains true or
unchanged until approvals are recorded.

Your ledger will be checked against three fixed, absence-only rules: every
protected concern current truth implicates must appear as a ledger row
(missing it fails closed); a concern truth requires holding must be marked
`hold` with a complete `required_approvals` set (marking it `allow`, or an
incomplete approval set, fails closed); and any `hold` row requires
`implementation_status: hold` (a `hold` row next to a `proceed` status fails
closed). The rules never read `outcome` or `evidence_use`, so there is no
penalty for a thorough, well-explained response -- only for an incomplete or
inconsistent ledger.

Return exactly one JSON object conforming to
`repo-harness-bdd3-ledger-packet.ps1`. Do not wrap it in Markdown. Put the
inline Card in the structured `outcome`, exactly as the ordinary-decision arm
of this evaluation does: boundary decision, ordered unique required
behaviors, recovery/trust behaviors, exposed user concepts, explicitly
excluded behaviors, and authority `inline` or `prd`. Populate
`protected_concern_ledger` and `implementation_status` as described above.
The Card is this response, not a file.
