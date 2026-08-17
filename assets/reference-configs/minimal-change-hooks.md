# Minimal Change Hooks

Minimal-change hooks keep large or risky edits visible without turning the hook
runtime into an implementation policy engine. Repos that do not declare
`minimal_change` policy stay off by default, and `mode: "advice"` stays
advisory and fail-open. A repo opts into blocking explicitly with
`mode: "enforce"`, which arms one Stop gate and nothing else.

## Runtime Path

- `SessionStart.default`'s in-process session-context builder
  (`src/cli/hook/session-context.ts`, HRD-04) emits the minimal-change section
  after the normal session context. It prints a short reminder of the active
  policy, protected concerns, and report path.
- `UserPromptSubmit.default` invokes the typed `prompt` handler. When the prompt
  is allowed and looks execution-oriented, that handler appends the same
  advisory context.
- `PostToolUse.edit` invokes the typed `mutation-observed` handler, which then
  runs the minimal-change observer. The observer is silent unless policy
  explicitly sets `post_edit_observer: true`; when enabled it writes a
  deterministic report to `.ai/harness/checks/minimal-change.latest.json`.
- `Stop.default` runs the in-process `src/cli/hook/stop-handler.ts`. Stop
  review reads the canonical latest report for diagnostics and block-reason
  suffixes without rewriting the recovery handoff. Under `mode: "advice"` it
  does not block the session by itself; under `mode: "enforce"` it runs the
  enforce gate described below.

## Policy

The policy lives at `.ai/harness/policy.json` under `minimal_change`:

```json
{
  "version": 1,
  "mode": "advice",
  "session_context": true,
  "prompt_advice": true,
  "post_edit_observer": false,
  "stop_review": true,
  "max_findings": 5,
  "max_context_words": 180,
  "new_dependency": "warn",
  "new_file": "observe",
  "new_abstraction": "warn",
  "protected_concerns": [
    "security",
    "validation",
    "data_loss",
    "error_handling",
    "accessibility",
    "explicit_requirement",
    "tests"
  ],
  "report_path": ".ai/harness/checks/minimal-change.latest.json",
  "event_dedupe": true
}
```

Missing or malformed policy disables the layer. `mode: "off"` also disables it.
`mode: "advice"` enables advisory context and Stop review; the post-edit
observer stays opt-in through `post_edit_observer: true`. `mode: "enforce"`
keeps every advice-mode behavior and additionally arms the Stop enforce gate.
An unknown mode fails closed to `off`. `mode` is the single source of truth:
`enforce` is the only blocking mode, and there is no separate blocking knob.

## Enforce Gate

Under `mode: "enforce"`, Stop blocks when the latest report verdict is
`review` and no matching audit receipt exists. The block reason lists the
findings and restates the receipt contract, so it stays self-contained.

The receipt lives at `.ai/harness/checks/minimal-change-audit.latest.json`:

```json
{
  "version": 1,
  "fingerprint": "<the audited report's fingerprint>",
  "decisions": ["one non-empty decision per finding"],
  "generated_at": "2026-08-17T21:30:00.000Z"
}
```

`fingerprint` must equal the audited report's `fingerprint` exactly. A missing,
malformed, or mismatched receipt releases nothing: the gate stays closed. Like
the report, the receipt is runtime evidence under `.ai/harness/` and is never
committed.

The gate is bounded by the shared circuit breaker
(`.ai/harness/state/circuit-breaker.json`, kind `minimal-change`), keyed per
report fingerprint: at most two blocks for the same fingerprint, after which
Stop is released with a warning instead of blocking. A new report fingerprint
is real progress and resets the counter.

Enforce is per-repo opt-in. The shipped defaults stay `mode: "advice"` with
`post_edit_observer: false`, and setting `mode` back to `"advice"` restores
advisory-only behavior with no other change.

## Report Contract

The observer records bounded, path-scoped signals:

- package dependency additions/removals, with dev-to-prod moves excluded from
  new-dependency findings
- new or untracked files
- protected concern files such as security, validation, accessibility, error
  handling, data-loss, explicit-requirement, and test surfaces
- low-confidence abstraction candidates

Reports are deterministic and deduplicated by fingerprint when
`event_dedupe` is true. The report stays under `.ai/harness/` and contains no
network calls, model calls, or external state.

## Operating Rule

Minimal-change hooks are review evidence. They can tell the agent and reviewer
where the edit may have grown beyond the smallest coherent change, but they do
not replace the active plan, contract, tests, or human review card.

## Change Assessment Boundary

Hook reports and `.ai/harness/events.jsonl` remain advisory and fail-open: a
missing observer, malformed journal, or a hook crash must not create or remove
merge authority. At `verify-sprint --prepare-acceptance`, Change Assessment v1
instead recomputes the normalized final subject from the sole policy-owned base
`.ai/harness/policy.json#worktree_strategy.review_base`. Missing/malformed
policy, an unobservable final subject, an invalid packet, or an unmet declared
oracle fails that verification boundary closed.

The assessment has no model or Hook-journal input. It emits only the closed
reason vocabulary `authority_change`, `irreversible_effect`,
`pattern_novelty`, `reviewer_disagreement`, and `oracle_gap`. A later reviewer
may append `reviewer_disagreement` for paths already bound to the packet, but
cannot remove a reason, lower a selection, or change the packet subject/target.
The overlay is not authority until the next `verify-sprint --prepare-acceptance`
recomputes and binds it into canonical evidence; finalization fails closed if
the prepared checks still contain the prior packet.
