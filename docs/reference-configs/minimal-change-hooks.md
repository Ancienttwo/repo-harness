# Minimal Change Hooks

Minimal-change hooks keep large or risky edits visible without turning the hook
runtime into an implementation policy engine. Repos that do not declare
`minimal_change` policy stay off by default; enabled policy remains advisory and
fail-open.

## Runtime Path

- `SessionStart.default` runs `minimal-change-context.sh` after the normal
  session context. It prints a short reminder of the active policy, protected
  concerns, and report path.
- `UserPromptSubmit.default` still routes only through `prompt-guard.sh`. When
  the prompt is allowed and looks execution-oriented, prompt guard appends the
  same advisory context.
- `PostToolUse.edit` keeps `post-edit-guard.sh` first and then runs
  `minimal-change-observer.sh`. The observer is silent unless policy explicitly
  sets `post_edit_observer: true`; when enabled it writes a deterministic report
  to `.ai/harness/checks/minimal-change.latest.json`.
- `Stop.default` still routes through `stop-orchestrator.sh`. Stop review reads
  the latest report and records summary evidence in the handoff. It does not
  block the session by itself.

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
observer stays opt-in through `post_edit_observer: true`. `mode: "enforce"` is
accepted for compatibility but normalized to advisory behavior so
minimal-change findings never become a host-level block.

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
