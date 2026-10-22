# Plan: Bash and Git path boundaries (#851 B/D)

Status: authorized. Implement B/D, push the branch and open a Draft PR. Do not merge.
Baseline: `8d3709c49fafac487037cbc2ab82c2b298d34111`, branch `codex/851-bash-bd`.
Claim: https://github.com/Ancienttwo/repo-harness/issues/851#issuecomment-6338081431.
A and C shipped in #853 (`a0d9d06d`).

## P1: map

- `route-registry.ts` owns event, route, matcher and host bindings. The installer projects those bindings. Existing entry order must stay stable.
- `runtime.ts` validates opt-in, parses the payload, calls one typed handler and writes telemetry. Effective State is lazy.
- `mutation-guard.ts` owns path normalization, private-directory denials and failure records. Edit/Write permits verified external absolute paths.
- `protected-path-notice.ts` reports private-directory changes at Stop. Its bounds and failure policy remain in force.
- `assets/workflow-contract.v1.json` owns the packaged helper inventory. `scripts/` is the executable helper source.
- The CI selection job runs before coverage selection. Required CI depends on its success. Daily governance runs through `scripts/check-ci.sh`.
- No managed Git pre-commit installation exists. This task adds a callable check, not a local Git configuration change.

## P2: traced paths

B: Claude Bash payload → new `PreToolUse.bash` route → string-only literal target extraction → shared path guard for a suspicious destination → exit 2 and one failure record. An ordinary command returns without Effective State, Git, ownership resolution or guard I/O. Runtime telemetry still runs.

D: Git index → NUL-delimited `diff --cached --name-only --no-renames` → root-only protected path check → exit 1. CI uses `ls-files -z` on the checked-out index because its staged diff is empty. Git or argument errors exit 2.

## P3: decision

- Share one root-directory inventory across Edit/Write, Bash, Stop and Git. Keep it in the hook path boundary module, away from unrelated MCP security ownership.
- Add the Claude-only Bash route after existing PreToolUse entries. Include it in minimal installs. Codex route entries stay stable; Codex shell tools are not claimed as covered.
- Use a bounded literal tripwire. Recognize output redirection, tee, single-file sed -i, rm, mv, cp destinations and literal Python/Node write calls. Track literal cd. Match destinations, not read operands or quoted shell examples.
- Block a known root _ops/_ref destination or an outside-repository destination. Keep Edit/Write's existing external allowance. Discard descriptors /dev/null, /dev/stdout and /dev/stderr are not file targets.
- Expansions, unsupported options, grouping, indirect scripts and symlink aliases can escape the pre-filter. A missing absolute host cwd or a command above 64 KiB is unchecked. Unknown syntax and handler failure do not block. Stop retains its existing report-only limits. There is no complete shell-parser claim.
- D rejects every staged protected mutation, including removal and rename sources. Tracked-tree mode rejects protected entries regardless of ignore negations. This follows the issue's explicit-override boundary; ignore configuration is not write permission.
- Only `REPO_HARNESS_ALLOW_PROTECTED_PATHS=1` permits a flagged Git check. It is per invocation and visible on stderr. Agents must obtain human authorization before using it. This task does not set it.
- Register the helper and put the tracked-tree check before CI coverage selection and in daily governance. Document the optional pre-commit command. Do not install it on this host.
- At 10x command volume, Bun process startup and telemetry dominate. No state lock or ownership query belongs on ordinary Bash calls.

## Verification

- RED: the new Bash host case fails because the route is absent. The Git helper is a new feature; missing-script failures are not a behavioral reproduction.
- Typecheck and affected coverage after source freeze. Cover ordinary commands, read/write separation, root and external writes, cwd, heredocs, glob roots, interpreters, unsupported syntax, crashes, install profiles and unchanged Edit behavior.
- Git fixtures cover force-add, staged deletion/rename, empty-index-diff CI, unusual names, exact override, Git errors and root-only matching.
- Measure the final bundled managed Bash command once. Compare ordinary and blocked calls with #764's historical 5,050 ms lock wait. Planning budget: ordinary p50 ≤ 50 ms and p90 ≤ 80 ms on this host.
- Run architecture-projection check before review. Report unavailable code facts; do not index or change unrelated architecture to conceal it.
- Run one read-only gatekeeper review and one fresh Claude review through Herdr, including tests changed with implementation. Reuse recorded checks.

## Delivery and rollback

Draft PR to main with `Fixes #851`; record goal, changes, checks, risk and rollback. No Co-Authored-By, prompt files, CodeGraph files or private operations state in commits. Do not touch port 4318 or use global pkill.

Rollback: revert the implementation commit(s), then reinstall managed Claude adapters from the reverted package. This task does not publish main or change the installed runtime.
