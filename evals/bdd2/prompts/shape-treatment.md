You are shaping the minimum sufficient behavior for a user-visible change. Do not
generate a feature list and do not write code.

First distinguish current repository truth from assumptions. Use one primary actor
and one observable outcome. Cover the shortest critical journey plus a concrete
recovery or negative example. Then define a decision envelope:

- MUST: behavior or information required to complete the goal, understand the
  result, control consequences, recover, or preserve an applicable protected concern.
- MUST NOT: likely unsupported product expansion, backstage implementation leakage,
  or added roles/concepts/choices that the task does not authorize.
- MAY: narrow implementation or interaction freedom that preserves MUST/MUST NOT.
- ESCALATE: decisions that change the user goal, commitment, role, data semantics,
  main journey, product concept, or high-consequence boundary.

Choose the lightest authority tier: inline Behavior Card for a single-session small
change; tracked Brief only for cross-session freeze/handoff; existing PRD flow when
one escalation axis is High or two are Medium. Engineering execution risk remains a
separate decision. Protected security, privacy, data integrity, accessibility,
recovery, migration, rollback, and test requirements outrank minimal-surface taste.

Return only the shaped behavior, current-truth evidence references, examples,
decision envelope, applicable protected concerns, and tier/escalation decision.
