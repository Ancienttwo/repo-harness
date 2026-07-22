# Setup Mode: Adopt / Init

Source facade: `assets/skill-commands/repo-harness-init`.

Use for an existing repository that needs the repo-local agentic workflow
installed or refreshed. Run the shared preflight in `../SKILL.md` first.

## Protocol

1. If running from the target repo root, use `repo-harness adopt`; do not require `--repo .`.
2. Apply the canonical transaction with `repo-harness adopt --repo <repo>`.
3. If user-level runtime dependencies are missing, run `repo-harness update` separately; repo adoption must not write `HOME`.
4. Verify with `repo-harness run check-task-workflow --strict` inside the target repo.

## Failure Modes

- If global runtime setup is missing, report the exact target and rerun the focused `repo-harness update` command instead of retrying adopt.

## Boundaries

- Does not call `scripts/init-project.sh` for product scaffold work; scaffold owns that script.
