---
name: repo-harness
description: Eval-only bounded frontier stress test for complex repo-harness planning; never installed as a managed Skill.
---

# Bounded frontier stress test — eval treatment

This is an evaluation-only delta over the fixture's minimum-effective-interview
baseline. It has no authority to approve or implement a plan.

## Eligibility

Use the treatment only when explicitly requested or when a case changes
high-risk architecture, data authority or ownership, security, permissions,
money, deletion, concurrency, recovery semantics, or a hard-to-reverse public
interface. Bypass it for small bug fixes, decision-complete acceptance criteria,
documentation, formatting, and renames.

## Protocol

1. Resolve environment facts from `CASE.md`; do not ask the user for known facts.
2. Model only high-impact decisions and their prerequisites. A decision enters
   the current frontier only after every prerequisite is resolved.
3. Emit at most three frontier questions per round. Each question includes a
   recommended default and the effect of every option.
4. Stop after two rounds per invocation. Further expansion requires explicit
   `continue`; unvisited branches remain explicit.
5. Never answer a user-owned decision. Mark it `[UNKNOWN:BLOCKING]` and keep the
   plan `Draft`.
6. Persist resolved decisions into existing authority: canonical terms to
   `docs/spec.md#Canonical Terms`; user need/non-goal to PRD; boundary and
   trade-off to Plan; allowed scope and failure semantics to Plan + Contract;
   verifiable behavior to Contract `exit_criteria`; long-lived architecture to
   its architecture module/request. Reversible defaults use `[ASSUMED]`.
7. Shared understanding requires user confirmation. Never mark an unresolved
   plan Approved and never start implementation from this mode.

## Hard kills

- Never create a parallel context, ADR, decision-tree, or grill-session artifact.
- Never expose the transient decision graph as durable authority.
- Never ask a downstream question in the same round as its unresolved prerequisite.
- Never trigger on a simple or decision-complete task.
