# Waza Tooling Integrity

## Decision

`check-agent-tooling.sh` now treats a Waza install as a directory-level runtime
bundle, not only a set of `SKILL.md` files.

## Rationale

Waza upstream can add helper files under skill-local `references/`, `scripts/`,
or `agents/`, and newer skill bodies can reference shared files under
`../../rules/`. A `SKILL.md`-only hash check can report `up-to-date` while the
runtime still has broken local references.

## Tradeoff

The detector still stays read-only and avoids a full GitHub tree clone. It
compares host installs against the `~/.agents` staging cache for full skill
directories, and compares the current shared Waza `rules/` files against both
staging and upstream raw URLs. If upstream introduces a new shared top-level
directory, the detector needs a small constant update instead of discovering the
entire repository tree dynamically.

## 2026-06-23 Runtime Refresh Repair

`repo-harness install` must sync Waza shared rules to every selected host, not
only run `skills add` for `think`, `hunt`, `check`, and `health`. The setup
checker already treats `rules/*.md` as part of the Waza runtime bundle, so a
host can report `update-available` after a successful install if the installer
does not copy `~/.agents/rules` into `~/.codex/rules` and `~/.claude/rules`.

The repair keeps the detector read-only, but makes its remediation command
host-aware and makes the installer perform the same shared-rule sync it expects
to verify. Verified locally with `repo-harness install --target both --no-cli`,
`repo-harness setup check --target codex --check-updates --json`,
`repo-harness setup check --target claude --check-updates --json`,
`bun run check:type`, and `bun test`.

## 2026-08-14 Goal Calibration Overlay

The operator-approved planning change keeps hook routing advisory-only and adds
the behavior at the planning-skill boundary. New full-mode planning first reads
the repo and prior decisions, then exposes a compact calibration card and asks
at most one highest-information-gain question only when a high-impact decision
remains. Resolved cases ask zero questions; headless cases stay unconfirmed and
must not simulate a user answer.

The same rule is projected into the local Waza `think` runtime and the shared
`interview` skill for Codex and Claude. This is an explicit local overlay on the
fresh upstream Waza bundle, not an upstream Waza release; a future Waza refresh
will overwrite it until the behavior is accepted upstream or the overlay is
retired.

Runtime readback after `bunx skills add tw93/Waza -g -a claude-code codex -s
think hunt check health -y` showed all four managed skill directories and all
four shared rules synchronized across staging, Codex, and Claude. The
update-aware detector then reported the intentional boundary precisely:
`update_status=update-available`, with only `skills/think/SKILL.md` differing
from fetched upstream; there was no host drift and no shared-rule drift.

Focused skill-contract tests passed (`21 pass, 0 fail`). The root checks passed
for deploy SQL order, architecture sync, task sync, strict task workflow,
project inspection, and init dry-run. The full `bun test` run reached `2358
pass, 1 skip, 6 fail`; all six failures are outside this slice in existing
ArchContext/global-runtime fixtures after bringing the package-local dependency
from stale `archctx@0.4.1` to the lockfile-authoritative `archctx@0.4.2`. No
Goal Calibration or action-command skill test failed.
