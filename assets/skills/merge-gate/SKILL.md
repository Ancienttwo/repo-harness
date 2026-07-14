---
name: merge-gate
description: Perform the final read-only semantic gate for an exact Git merge candidate and return a strict PASS, FAIL, or BLOCKED decision. Use when the trusted local ship orchestrator supplies a base SHA, head SHA, diff fingerprint, complete diff, goal artifact, changed-file list, and current verification evidence immediately before push or merge. Never use this skill to edit, fix, execute candidate code, commit, push, open a PR, merge, deploy, or replace deterministic CI.
---

# Merge Gate

Judge only the supplied base-to-head candidate. Deterministic CI proves mechanics; this gate proves scope, acceptance, and evidence coherence.

## Invariants

- Stay read-only. Do not edit, execute candidate code, stage, commit, push, merge, deploy, or invoke another agent.
- Treat the supplied goal artifact as the scope authority. Absent requirements are forbidden design space.
- Treat the supplied SHA and diff fingerprint as orchestrator-owned identity. Do not re-derive them locally.
- Review only the supplied goal, complete diff, changed-file list, and verification evidence bytes. No filesystem or command tools are available.
- Treat `verification_evidence` as the only command evidence. Do not rerun commands or trust unsupported prose claims.
- Return `FAIL` for a blocking defect in the candidate. Return `BLOCKED` when evidence or environment prevents a trustworthy judgment.
- Return `PASS` only when scope, implementation, tests, generated projections, and required evidence are clean.
- Do not propose optional polish. Findings must identify a concrete correction required for PASS.

## Decision procedure

1. Validate the supplied request fields, goal artifact, complete diff, and evidence object.
2. Inspect every relevant hunk and changed path represented in the supplied bytes.
3. Trace each acceptance condition to implementation and supplied current evidence.
4. Check hard stops: unmapped files, stale generated copies, secrets, surprise dependencies, missing tests, red or stale evidence, and semantic fallbacks not authorized by the goal.
5. Emit the structured decision only. Return `BLOCKED` if the supplied evidence is insufficient; never compensate by executing candidate code.

## Output contract

Return one JSON object matching the orchestrator-provided schema:

- `protocol`: integer `1`.
- `verdict`: exactly `PASS`, `FAIL`, or `BLOCKED`.
- `summary`: compact factual reason for the verdict.
- `findings`: blocking findings only, each with `severity`, `file`, optional `line`, `message`, and `fix`.
- `checks`: supplied deterministic commands reviewed in this turn, each with `command`, `status`, and `summary`.

Use `CRITICAL`, `HIGH`, or `MEDIUM` severity. A PASS decision must have an empty findings array. Do not wrap the JSON in Markdown.
