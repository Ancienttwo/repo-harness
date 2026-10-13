# Minimal Change Hooks

No hook reads the `minimal_change` policy. The block in
`.ai/harness/policy.json` is inert. Hook wave 2 deleted the runtime that used
it (#692, #695):

- the `SessionStart` minimal-change section;
- the `UserPromptSubmit` minimal-change advice;
- the `PostToolUse.edit` observer and its post-edit journal;
- the Stop review, the Stop enforce gate, its audit receipt and the
  `minimal-change` circuit kind.

## Policy Status

`mode: "enforce"` has no effect. Stop never blocks on a minimal-change finding.
This repository sets `mode: "advice"`. `repo-harness init` still writes the
block with `mode: "advice"`. No code reads `mode`, `session_context`,
`prompt_advice`, `post_edit_observer`, `stop_review`, `report_path` or any
other field of the block.

`.ai/harness/checks/minimal-change.latest.json` and
`.ai/harness/checks/minimal-change-audit.latest.json` have no writer and no
reader. An operator can delete them.

A `minimal-change` entry in `.ai/harness/state/circuit-breaker.json` fails
closed. Run `repo-harness run evidence-gc --repo <path>` once to remove it.

## What Remains

The smallest coherent change is a review rule, not a hook. The active plan,
the contract scope, the tests and the review decide whether a change grew too
large. Change Assessment is the deterministic boundary.

## Change Assessment Boundary

Hook output and `.ai/harness/events.jsonl` remain advisory and fail-open: a
hook crash must not create or remove merge authority. Before semantic review or acceptance, run
`repo-harness run change-assessment prepare --contract <contract>` from the
execution repository. Change Assessment v1 then recomputes the normalized final subject from the sole policy-owned base
`.ai/harness/policy.json#worktree_strategy.review_base`. Missing/malformed
policy, an unobservable final subject, an invalid packet, or an unmet declared
oracle fails the assessment boundary closed. `verification-plan execute`
records declared check execution. It does not prepare the assessment.

The assessment has no model or Hook-journal input. It emits only the closed
reason vocabulary `authority_change`, `irreversible_effect`,
`pattern_novelty`, `reviewer_disagreement`, and `oracle_gap`. A later reviewer
may append `reviewer_disagreement` for paths already bound to the packet, but
cannot remove a reason, lower a selection, or change the packet subject/target.
Prepare it again with `change-assessment prepare --contract <contract>
--packet .ai/harness/checks/change-assessment.latest.json` to preserve the
overlay. The acceptance owner recomputes the base assessment and validates the
packet against the current subject and target. A missing or stale packet fails
closed. Native execution facts remain separate.
