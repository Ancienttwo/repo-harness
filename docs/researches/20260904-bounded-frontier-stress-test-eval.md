# Bounded frontier stress-test extraction eval

> Date: 2026-09-04
>
> Status: eval-ready, not productized

## Conclusion

The extractable unit from `grill-with-docs` is the frontier rule: a question is
eligible now only when every user-owned prerequisite decision is resolved. The
wrapper, unlimited loop, domain-modeling file layout, and conversation-only
decision persistence are rejected.

This slice adds an isolated five-case A/B evaluation. It does not modify
`repo-harness-plan`, managed Skill manifests, profiles, hooks, or default Plan
creation. A passing treatment is evidence for a later product decision, not
approval to make that change.

## P1: boundary map

- Baseline: `assets/skills/repo-harness-plan/references/create.md`, copied into
  every arm at run time; `docs/researches/20260811-minimum-effective-interview-routing.md`
  supplies provenance only.
- Treatment: `evals/frontier-stress-test/treatment/SKILL.md`, copied only into
  the `with_skill` workspace by its local benchmark config. The two arms receive
  the same command permissions; the treatment arm gets no extra repository path.
- Cases: three archived complex plans, one answered-decision case, and one
  fully specified negative control.
- Evidence producer: existing `scripts/run-skill-evals.ts`, invoked through its
  exported API so the production CLI remains unchanged.
- Runtime product surface: unchanged.

Out of scope: installing upstream Skills, parallel context/ADR artifacts,
changing default interviews, interactive continuation, and claiming
effectiveness from a dry run.

## P2: concrete route

The runner copies the canonical planning baseline, shared fixture, and one
`CASE.md` into a disposable Git workspace. The `without_skill` arm sees the
current bounded interview. The `with_skill` arm additionally receives a local
copy of the eval-only frontier treatment. Live runs fail closed unless the
caller supplies a disposable repository and sibling HOME. A case-specific
structural validator checks exact mode/status fields, frontier question count,
prerequisite/deferred placement, and planning-boundary markers; the ordinary
contract grader also rejects every agent-created workspace change. Provider JSON
remains authoritative for tokens, turns, cost, duration, and model identity;
missing fields remain unavailable.

## P3: decision rationale

The invariant is that the experiment must not create product authority. Keeping
the treatment below `evals/` makes the delta inspectable and prevents a prompt
from silently entering minimal or full profiles. The cases target the real
pressure point: event identity, security liveness, and Human decision authority
must precede downstream lock/schema/recovery questions. The negative control
proves dormancy. At 10x scale provider cost and variance fail first, so the
closed set remains five cases until it shows a useful signal.

## Case provenance

| Case | Source | Target signal |
| --- | --- | --- |
| Architecture event identity | `plans/archive/plan-20260814-0157-architecture-queue-idempotent-events.md` | Identity before lock/recovery |
| OAuth active token | `plans/archive/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md` | Liveness before storage mechanics |
| Human decision authority | `plans/archive/plan-20260826-0707-me2c-verified-evidence-context.md` | Actor before schema/CAS/recovery |
| Answered scope persistence | `plans/archive/plan-20260705-2027-review-scope-fidelity.md` | Answer into Plan + Contract |
| Simple rename | Protocol-derived negative control | Bypass with zero questions |

## Decision gate

Run at least three matched trials per supported agent. Productization requires:

- for each frozen agent/model/CLI cohort, every dependency case is evaluated as
  one whole-case pass/fail and treatment improves over its paired baseline; the
  runner's aggregate assertion pass rate is not this decision metric;
- no regression on answered-authority mapping or the negative control;
- zero Agent-answered user decisions;
- zero Approved plans with `[UNKNOWN:BLOCKING]`;
- zero forbidden authority artifacts and implementation starts;
- provider-authoritative token/turn evidence confines added cost to eligible
  cases.

Every live output still requires semantic review for invented user answers;
regex/structural graders are a screen, not semantic authority. The answered case
checks where a decision would be recorded, not that a non-mutating planning run
performed the write. This slice also does not measure second-round continuation,
later Contract amendments, or implementation rework. Those need longitudinal
evals. Here, prerequisite-ordering misses are the bounded pre-plan proxy; no
amendment-rate or persistence claim is made.

## Execution

Wiring-only dry run (fixtures, profiles, command serialization, and report
shape), not grader or effectiveness evidence:

```bash
bun -e 'import { runSkillEvals } from "./scripts/run-skill-evals.ts"; runSkillEvals({ evalsPath: "evals/frontier-stress-test/evals.json", configPath: "evals/frontier-stress-test/benchmark.config.json", dryRun: true })'
```

For an authoritative run, call the same API in a complete disposable clone with
`repoRoot`, sibling `home`, `requireDisposableBoundary: true`, and a unique
`iterationLabel`. Freeze explicit model arguments and CLI versions before the
first paired trial, keep them unchanged for the cohort, and preserve every
iteration manifest plus raw run directory; the single summary path is only the
latest rendering, not a cohort aggregate.
