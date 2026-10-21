# Setup Mode: Impact-Scoped CI

Use when the user asks to set up or maintain this CI policy in a target repo:
routine pull requests and main pushes run only an impact plan, and only an
explicit release validation runs the complete matrix.

## Authority

- Confirm the target repo path (step 1 of the shared preflight in `../SKILL.md`).
  The `repo-harness init --dry-run` step does not apply. This mode does not
  change harness files.
- The target workflow, selector, planner, gate and their tests are
  user-authored files. Edit them in place, and only on an explicit request. Do
  not regenerate, rename or delete them.
- Never change repository settings, environments, rulesets, branch protection
  or required checks. Tell the user which setting gives hard enforcement.
- Never dispatch release validation. It is a release operation and needs user
  approval.

## Contract

1. **Impact plan.** A routine `pull_request` or `push` run selects one Linux
   affected-workspace job and only the platform families whose owned paths
   changed. The affected-workspace job runs the complete suites of each changed
   workspace and of each transitive dependent. A reviewed workspace graph
   declares the dependency edges. A drift test compares the graph with the
   workspace manifests: every workspace and every local dependency edge.
2. **Family owners.** Each platform family `<family>` declares the paths that
   it owns: its test files, its smoke scripts and the source that they qualify.
   A routine plan selects a family only when a changed path matches one of its
   owners. Package or workspace membership alone never selects a platform
   family.
3. **Owner drift contract.** A contract test parses each family job in the
   workflow YAML. It collects each test file and script that the job runs. It
   asserts that an owner of that family matches each one. It also asserts a
   minimum count of checked inputs, so a parser that finds nothing fails.
   Prove the test with a mutation probe: remove one owner, run the test, record
   the failure `<family> runs <path> but does not own it`, then restore the
   owner.
4. **Release-only complete matrix.** Only `workflow_dispatch` runs the complete
   matrix. The dispatch input carries the exact approved 40-character SHA, and
   it must equal the checked-out commit. The ref must be on an allowlist, for
   example `refs/heads/main` and `refs/heads/release/<name>`. Both the planner
   and the aggregate gate check the ref. The planner also refuses a targeted
   plan that contains the complete-suite family. A test runs the selector over
   all selectable tracked paths and asserts that the union never contains that
   family.
5. **Fail closed.** An unmapped, broad-impact or malformed path fails the plan.
   The error tells the author to add a reviewed mapping and names the selector
   file. It never tells the author to use release validation. A selected
   workspace without a check fails the same way.
6. **One aggregate gate.** One job runs on every event, also when other jobs
   fail or skip (`if: always()`). It checks the job inventory against the known
   family list, the exact-SHA plan, the mode for the event, the comparison base
   and a selection that it computes again from the plan's file list. Each
   selected job must have `success`. Each unselected job must have `skipped`.
   A missing, cancelled or unexpected result fails the gate. Tell the user to
   make this job the only required check.

## Protocol

1. Map the workflow jobs, the family list, the complete-suite family, the
   selector, the planner and the gate. Record the platform job count of recent
   routine runs as the baseline.
2. Replace package-membership fan-out with family owners. Do not change the
   affected-workspace job.
3. Pass the run ref (`github.ref`) to the planner and the gate. Add the ref
   allowlist to both.
4. Change unmapped-path errors to the reviewed-mapping text.
5. Add or extend tests:
   - Each family is selected by one path that it owns.
   - A shared-core path and a package-only path select no family.
   - The owner drift contract and the workspace graph drift test.
   - No routine selection contains the complete-suite family.
   - Allowed refs pass. Feature, fix, tag and malformed refs throw.
   - Unmapped and malformed paths throw the reviewed-mapping error.
6. Record the dispatch command and the limits in the target's release runbook
   or CI note.

## Verification

- Run the target's selector, planner and workflow contract tests. Report the
  command, the pass and fail counts and the revision.
- Run the mutation probe from contract item 3 for at least one family. Report
  the failure output.
- Replay the old selector (from the base revision) and the new selector on the
  changed files of recent pull requests. Report the platform job count before
  and after, for each pull request and in total. If a path needs content
  comparison against a base, remove it from both sides and say so.
- Parse the workflow YAML and run `git diff --check`.
- Justify each changed test assertion item by item in the PR description:
  the old behavior that it pinned, the new behavior, and the policy reason.
  Never delete an assertion only to make a test pass.

## Limits to Report

Put each limit in the PR description.

- A dispatch runs the workflow and planner of the dispatched ref. A branch that
  edits them can skip the ref check. The check stops default and agent
  behavior only. Hard enforcement needs GitHub environment protection or
  rulesets, which the user configures.
- A platform regression in a path that no family owns first shows at release
  validation.
- A shared-core change still runs most workspace suites on the Linux job,
  because its dependents consume it.

## Boundaries

- Does not run `repo-harness init` or change harness files.
- Does not dispatch release validation, publish or change repository settings.
- Does not select platform families from package membership.
