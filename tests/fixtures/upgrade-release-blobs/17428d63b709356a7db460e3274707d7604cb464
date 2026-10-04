# Official Codex plugin provider mode

This is the Codex-host special case. It runs OpenAI's official Claude Code
plugin (`codex@openai-codex`) as the outside-review transport, while Codex
itself remains the reviewer through the plugin's app-server companion runtime.
It does not launch Claude as a reviewer.

## Provider boundary

- Discover the enabled plugin through `claude plugin list --json`; never scan
  cache directories or guess a versioned path.
- Validate the inventory identity/version, OpenAI manifest, contained
  `scripts/codex-companion.mjs`, and official structured review schema before
  invocation. Missing, disabled, duplicate, unsafe, or unsupported installs
  fail explicitly; there is no Claude or direct-Codex fallback on a Codex host.
- Invoke `adversarial-review --json` directly through the plugin companion.
  Do not wrap `/codex:review` inside `claude -p`: the slash command can return
  before a background job completes, and its native target chooses branch or
  working tree rather than their required union.

## Review subject

The runner captures one subject before provider admission, materializes its
final content in a private temporary Git snapshot, and pins the plugin request
to both its resolved base and HEAD SHAs. The focus text requires the union of:

- committed branch changes against the pinned base;
- staged changes;
- unstaged tracked changes;
- untracked files;
- the exact captured path set and subject SHA-256.

The plugin app-server uses a read-only sandbox. Official severities map at the
provider boundary: `critical|high -> P1`, `medium|low -> P2`. The verbatim Codex
structured transcript is preserved in the existing cross-review result. The
source subject is recomputed after the provider exits; a concurrent source
change returns blocking `stale_scope` instead of attaching the result to newer
bytes. Inconsistent `approve`/`needs-attention` and findings combinations fail
closed.

## Command

```bash
repo-harness cross-review --provider codex-plugin
```

## Boundaries

- Review Gate stays disabled; this mode is invoked only by the explicit
  repo-harness outside-review command.
- Exactly two identical provider attempts, never a third and never a provider
  fallback. Exhaustion is `SKIPPED`, not a pass.
- No merge-gate: this mode never produces or verifies a `merge-gate` receipt.
- `degraded_scope` and `stale_scope` are blocking at command level. A successful acceptance
  receipt must truthfully record `reviewer=Codex, source=codex-plugin`.
