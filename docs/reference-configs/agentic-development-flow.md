# Agentic development flow

- Default task worktrees use `/tmp/<repo>-wt-<slug>` on POSIX. Native Windows uses `os.tmpdir()` as the root. The stored default is `{{system_tmp}}/{{repo}}-wt-{{slug}}`. Runtime code resolves the temp token. Explicit stored templates stay unchanged. Commit or push work before a reboot or age-based tmp cleanup, such as `systemd-tmpfiles`. These cleaners can remove checkouts. Missing entries are pruned. The sweep saves missing registration identities before global prune. Later batches finish deferred branch cleanup. Unmerged branches remain.
- Closeout removes a merged, clean checkout and its branch. It releases only that checkout's own canonical marker after merge proof under the topology lock. The sweep keeps dirty, locked and marked worktrees. It keeps branch reflogs without a commit-creation message and missing or unreadable reflogs. Fast-forward, target-only automatic merges, reset and rebase-finish messages do not count. Dispatch must establish an unmerged commit or keep the worktree dirty, locked or marked. A merged, clean, unowned branch with its own commits can be swept.
- `start` recovers only a real target directory registered by this clone on the expected branch, under the topology lock, with no lock or other owner. Recovery requires a current-user-owned checkout directory without group or other write access, a regular owned Git pointer, its matching admin backpointer, and the original directory identity saved by start. Git metadata can be group-writable but must not be other-writable. Start still creates a checkout when uid is unavailable; recovery then refuses. Exact removal retires the identity after Git readback. Missing identity or a replacement directory blocks recovery. Files, symlinks, unregistered paths and other branches are refused. Cleanup refuses a registered worktree whose branch is missing. MCP cleanup also refuses active markers. Sweep reports name processed paths. Deferred entries are reported as counts. `kept` excludes deferred entries. A command timeout sends SIGTERM to the direct child only. A grandchild can briefly extend the deadline. No detached cleanup process starts. Herdr notifications accept registered default task worktrees and paths inside them. Other temporary paths and `rh-herdr-` labels stay filtered.

## Daily Flow
1. Read the current request and `AGENTS.md`; load architecture or worker techniques only when relevant.
2. Open a branch; isolate a worktree when concurrent edits overlap. Preserve unrelated work.
3. Make small, bounded commits. Ordinary tasks live in the PR description: goal, changes, verification, risk and rollback.
4. Freeze the candidate and verify once: typecheck plus affected tests. Reviewers and closeout consume the same evidence. Reopen acceptance only for blocking defects or changed inputs that affect the result. Record non-blocking improvements separately; do not change the frozen candidate for them.
5. A model may squash-merge into main only when the current task explicitly authorizes main publication, the branch contains the current main tip, the required checks pass on that exact head, and GitHub has no outstanding change requests or unresolved review threads. An explicit no-merge instruction always wins. The next merge does not wait for the main push CI of the previous merge. Pending main push CI is not an extra acceptance gate. Read its status before the next merge; when it fails, the next merge is the revert or the fix. Each PR still meets its own exact-head and current-main requirements. Record the GitHub merge SHA and parent SHA. Record `git revert --no-edit <squash-commit>`. Do not create rollback tags.
6. Run the full suite daily, automatically open a repair task on failure, and produce the daily merge/check/rollback report. Run the [Lessons Retro](#lessons-retro) in the same nightly window.
7. Use the [Report SOP](#report-sop) for formal progress, phase and final reports to the user, including the daily user summary. Raw automated CI reports are evidence inputs; they do not replace that summary and do not require this format.

## CI cost
Size PR CI by the diff, the same as step 4. A full suite on each small PR spends runner time and adds no evidence that the affected tests and the daily run do not already give. The repo-harness source repository uses this shape in `.github/workflows/ci.yml`.

- Triggers: run PR checks on `pull_request`. Do not also trigger `push` on feature branches; that runs each commit twice. A `push` to the default branch runs the affected selection for the merged diff, not the full suite.
- Superseded runs: set `concurrency` to one group per PR number with `cancel-in-progress: true` for `pull_request` events only. Do not cancel scheduled runs.
- Selection: a first job reads the diff against the PR base and outputs a mode. Later jobs read the mode in a job-level `if:`.
  - A docs-only diff (`docs/**/*.md`, README, CHANGELOG) skips build and test jobs when no test or script reads the changed files. Keep link and format checks. A document that is program input, such as a projected copy, a parsed contract or a generated region, runs its consumer tests.
  - A code diff runs typecheck plus the tests that the diff affects. Use the runner's change detection (`vitest --changed`, `jest --changedSince`, `nx affected`, `turbo run --filter=...[<base>]`, `pytest --testmon`) or an import-graph selector.
  - A change to a shared input (lockfile, root build or test config, CI workflow, a test helper with no mapped consumer) runs the full suite on that PR. A selector that cannot map a changed file widens the run; it never shrinks it.
- Required checks: skip a job with a job-level `if:`, not with workflow-level `paths` or `paths-ignore`. GitHub counts a skipped job as passing for a required check. A workflow that never starts leaves its required check pending and blocks the merge.
- Full suite: run it on `schedule` (daily) and `workflow_dispatch` against one default-branch SHA, and on the release SHA before a release. A daily failure opens a repair task (step 6).
- Matrix: each axis must change the runtime that the tests run on. When the test runner is pinned, for example one Bun version, a Node-version axis reaches only the scripts and tests that spawn Node. Run only that subset on the axis; a full suite on 3 OS × 3 Node versions repeats each OS run three times. On a PR, run a matrix cell only when the diff touches code that depends on its axis. The daily run covers each cell with its dependent subset. Set `fail-fast: false` so one cell failure does not hide the others.
- Limits: set `timeout-minutes` on each job; the GitHub default of 360 minutes lets a hung job spend all of it. Cache dependencies keyed on the lockfile.

## Report SOP
- Give a Feynman report: explain the work to a reader who does not know this project. Use plain language. Explain the goal, user value, how it works, completed work and remaining gaps. Explain each technical term at first use.
- State the conclusion, changes, reasons, verification and remaining risks. Link each claim to its source or label it as an inference. Use observed results. Name failed, incomplete and omitted checks.
- Include a PlantUML progress diagram only for multi-PR or formal phase reports. Supply an editable `.puml` file or the complete PlantUML code. Use the same evidence snapshot for the report and diagram. State the snapshot date and relevant revision. Do not invent percentages or dates.
- Keep planned, dispatched, implemented, verified, merged and released states distinct. Mark unknown and failed states as such. A worker report or an Agent `done` signal is not proof of verification, merge or release.
- Render the diagram when a permitted renderer is available. If rendering fails or is unavailable, state the limit and keep the source. Do not upload private material to an external renderer without user authorization.
- Keep the report proportional to the work. Routine confirmations, short updates and tool logs do not require a full report. This SOP adds no approval gate or separate status store. Use existing task, PR and verification sources.
- Give a catch-up reply when a human returns to a task after time away and asks for status. Use the Feynman report for completion and full reviews. Use the catch-up reply for interim check-ins.
  - Keep the turn read-only. Collect side effects only, such as commits, pushes, evidence events, PR and check state, and worker reports. Do not start a job. Do not post anywhere.
  - Open with one sentence that says how many items need the human, or that none do. If nothing happened and nothing waits on the human, say so and stop.
  - Keep catch-up and interim replies text-only and under 150 words.
  - List open gates first. They are the action items (see the parked-gate rule in [Bot and worker](#bot-and-worker)).
  - An action item is a decision or step that only the human can take. Examples are a product choice, an approval, an irreversible action, or access that the Bot lacks. Give each item the recommendation and what happens if the human does not answer. Work that the Bot can still do is not an action item. Never invent an item to fill the reply.
  - Name each PR, branch, task and agent by a name that the human knows. Leave out hashes, paths, commands and test counts unless the human needs one to act.
  - Give each thread exactly one status tag. The tags are `[merged #N]`, `[open PR #N]`, `[in flight <branch>]`, `[verified, uncommitted]`, `[reverted #N]`, `[planned, not started]` and `[blocked: <reason>]`. A thread with no tag is not done.
  - Say what changed for the human, not how the Bot did it. Give the source of each fact or mark it as an inference. Keep planned, dispatched, implemented, verified, merged and released states distinct.
  - When the task has a decision trail (`repo-harness run decision-trail render`) and the work ran unattended, end the reply with an `Attention` section. Name the reviewer model on the first line. The reviewer must be a different model from the one that did the work. List decisions with weak or missing evidence, verification that the work claims without proof, and choices that look risky in hindsight. "No flags" is a valid value.
  - Adapted from the pstack ketchup and recall skills (cursor/plugins, MIT, Lauren Tan).

## Lessons Retro
`tasks/lessons.md` is the one lessons ledger. It has the role of a root `LESSONS.md`. Do not add a second lessons file. The retro and maintenance triage read the ledger. Sessions read its active lessons at start. Current code and evidence take precedence. Keep the path; do not move lessons to docs/.

- The ledger keeps one watermark line before the first entry: `reviewed-through: <full commit SHA>`. If the line is missing, the first retro reviews the last 24 hours and adds it.
- Each night, review the default-branch history after the watermark: `git log --first-parent <watermark>..origin/main`. Skip commits that change only `tasks/lessons.md`.
- Look for three signals: a fix that repairs recent work, a change that should not have merged, and verification that was too thin for the changed behavior. A revert or a follow-up hotfix is evidence.
- Add at most one entry for each theme on one day. Keep the fields that `repo-harness run maintenance-triage` reads. `- Date:` starts each entry:

```markdown
- Date: <YYYY-MM-DD>
- Name: <2-5 word rule name>
- Mistake pattern: <stable theme key>
- Prevention rule: <rule>
- Enforced by: <path to check, test or guard> | judgment
- Missed by: self-verify | ci | independent-review | human | none
- Why: <what failed and what it cost>
- Triggered by correction: <commit SHA, PR or issue>
- Seen: <N>×
```

- For a repeat, copy the `Name` and `Mistake pattern` text exactly. Maintenance triage groups entries by `Mistake pattern`. `Seen` counts the entries with that text, this entry included. Do not edit `Seen` on older entries.
- `Enforced by` names the file that fails when the mistake comes back. For an architecture or type fix, name the file that makes the mistake impossible. `judgment` means that no file catches the mistake.
- `Missed by` names the check layer that should have caught the mistake before merge. Two entries with `Missed by: independent-review` on the same [Review by risk](#review-by-risk) signal move that signal up one tier in the PR that adds the second entry.
- From `Seen: 2×`, fix the mistake class in the PR that adds the entry. Use the highest level that works:
  1. Architecture or data structure: one owner for each state, one way to do each task, and no old path that an agent can copy.
  2. Types that cannot express the mistake.
  3. A check whose error names the fix: the file, type or function to use.
  4. A test.
  If no level works, write `Enforced by: judgment`.
- A new check or test must fail on the real commit that had the mistake and pass after the fix. Put both results in the PR.
- At `Seen: 3×` with `Enforced by: judgment`, promote the prevention rule into root `AGENTS.md` and root `CLAUDE.md` in the same PR. Add `- Promoted: <PR>` to that entry. A rule with a structural enforcer does not go into the root files.
- When the mistake can no longer occur, delete its text rule from the agent instruction files. Keep its ledger entries.
- Each retro advances the watermark to the last reviewed commit, also when it finds no lesson. If an earlier retro PR is still open, update that PR. Do not open a second retro PR.
- Every change to `tasks/lessons.md` goes through a PR and merges only after GO. GO is an explicit go-ahead from the repository owner (Aimpact for repo-harness) for one reviewed head SHA. Task-level publication authorization does not replace it. Merge with `gh pr merge <pr> --squash --match-head-commit <reviewed-sha>`. Lessons are not task logs. Ordinary tasks record a one-time decision in the issue or PR. A correction in a task can add an entry; that entry follows the same PR and GO rule.

## Internal and external PRs
Every PR is internal or external, never both. Classify it with the single rule in the `repo-harness-check` reference `references/pr-verification.md`, section Classification. An ambiguous result is external.

### Internal PR flow
An internal PR uses Daily Flow step 5 and the main-merge boundary in [Four operation boundaries](#four-operation-boundaries). The external PR flow does not apply to it. A `tasks/lessons.md` change also follows the GO rule in [Lessons Retro](#lessons-retro).

### External PR flow
An external PR never uses the internal flow. A worker produces the ready-for-GO bundle from `references/pr-verification.md`. The PR merges only after automated checks pass and the repository owner gives an explicit GO for the reviewed head SHA. Merge with `gh pr merge <pr> --squash --match-head-commit <reviewed-sha>`. A new head SHA needs a new bundle and a new GO.

## Four operation boundaries
- Main merge requires explicit current-task authorization, current automated checks, no outstanding change requests or unresolved review threads, exact head/base and conflict safety.
- Only merged, clean, inactive worktrees/branches may be deleted automatically; other deletion requires the user.
- Credentials, permissions, sandbox/write grants and confirmation-bypass settings require user approval of the exact change.
- Release and production effects require user approval of the exact artifact and operation.

## Bot and worker
PM is a shared role across Bot hosts. The PM handles user communication, task
breakdown, dispatch, follow-up and evidence-based reports. Coding agents own
source edits, tests and repairs. Follow the shared PM boundary in the
`repo-harness` Skill for the permitted tool surface and reporting duties.
Keep direct development sessions and explicitly assigned coding workers outside
that PM restriction. OAR owns coding-agent execution. Herdr owns panes and
visibility. A new Bot host adapts to that path; it does not add a new coding
runtime or task authority.

The `orchestrator` fleet role is the long-lived coordinator and integrator seat
of `repo-harness-issue-flow`. Start it with `claude --agent orchestrator`. The
fleet projects it to Claude only. It dispatches work and follows PRs and CI. It
edits no product code and dispatches no subagents.

The bot selects scope, worker and verification by risk. Use independent gatekeeper/cross-model review for large changes, security/permissions or model uncertainty; do not rerun a passing check or require multiple re-gates.

### Review by risk
The diff sets the tier. The author does not: a human change and a model change with the same diff get the same tier. One hit on a higher signal sets the higher tier.

| Tier | Signals |
| --- | --- |
| Low | No Medium or High signal, including local changes with clear behavior and docs, tests, comments or translations alone. |
| Medium | Cross-module behavior changes; public API changes; more than 10 non-generated implementation files; shared runtime changes; authentication-adjacent changes; or unresolved behavior uncertainty. |
| High | Credentials, permissions or sandbox grants; hooks and the mutation guard; deletion paths; release, publish, update or install scripts; `deploy/sql/`; code that writes to GitHub; or a change across more than one capability boundary in `.archcontext/model/`. |

Review follows the `repo-harness-issue-flow` skill, [references/acceptor.md](../../assets/skills/repo-harness-issue-flow/references/acceptor.md). The tier selects the depth: no independent review for Low, one fresh-context review for Medium, and the gatekeeper plus one cross-model review for High, one round each. The Acceptor SOP owns the round, findings and publish steps.

Rules for every tier:
- The reviewer reads the current diff only. A defect in code the diff did not touch is a non-blocking note; open an issue for it, do not add a finding.
- From the second round, the reviewer reads only the hunks that changed after the previous round. The three-round limit stays.
- When an independent review ran, the PR description lists each finding with its disposition: fixed, or closed with the reason.
- A low tier adds no review. A new test file or a rebase does not raise the tier.
- Changing implementation and test assertions together does not raise the tier. Within the tier's existing review, check whether assertions preserve the intended behavior and whether removed or weakened coverage has a valid requirement-based reason. At Low, the author performs this check in self-review. Record the reason for each assertion change in the PR; never change assertions only to make a test pass. Do not dispatch a separate test-review gate.
- A parent, coordinator or merge session reuses recorded acceptance when the reviewed diff, relevant base context, verification inputs and environment still match, and the review meets the current tier. The PR records the reviewed revision or diff, commands, results and finding dispositions. A change of session or reviewer is not a reason to repeat acceptance.
- After a change, verify the affected behavior and review the changed hunks with their affected context. Retain valid evidence for unchanged scope; add only missing tier coverage. A rebase alone does not require a new full review, but changed base behavior or conflict resolution can invalidate affected evidence. Reuse never substitutes for required checks on the current head or the current-main merge requirement.
- A downstream repository maps its own release surfaces, for example public API, wire format, DDL/SQL and permissions, to the High tier.

The bot measures progress by side effects only: commits, pushes, evidence events and PR or check changes. It does not resume a worker to check liveness. A worker past its timebox with no new side effect is stalled; stop it or ask the user.
Retry by failure mode. Reduce scope after a limit or out-of-memory stop. Move a tool error to another model. A network drop or an unknown failure gets one retry only for a read-only or idempotent call. For a call that can change remote state, check the original request and the provider receipt first; do not retry an unknown effect. After two failures of one task, stop and ask the user.
Clear conflicts first. Once conflicts are clear, triage review threads and watch CI in parallel. Classify a CI failure before a retry. A suspected flake gets one fresh build; an identical second failure is not a flake. Classify each review comment as fix, dismiss or ask by the review-comment triage reference of the installed `repo-harness-check` skill.
Stop and ask the user when a command or result names `unknown`, `ambiguous`, `pending`, `unproven`, `identity_lost`, `reconciliation_required` or `recovery_required`, or says `inspect the same`, `inspect same`, `never replay`, `do not resend` or `do not launch again`; when a lease directory is empty or malformed; before a third review round; when a review thread concerns security, authentication, data or migrations; or when a written rule conflicts with observed state.

Pending main push CI follows Daily Flow step 5, not the stop-and-ask rule above.

Architecture docs remain references. Update them only when responsibilities or boundaries change; no per-edit drift queue, workstream sync or automatic agent-context block. Ordinary work has no plan/contract/review/notes prerequisite. Record a one-time decision in the issue; PRDs are for real new products.

Park a gate; do not block on it. A gate is a decision that only the human can make. It is one of four kinds: an irreversible action, a product or preference call that no experiment settles, a standing rule that contradicts observed reality, or a dead end that survived a replan. Frontier nudges, retries, CI flake triage, review-thread triage, format fixes and "should I keep going" never reach the human. The GitHub issue and PR are the task authority. When the task has an issue, post a parked gate in the issue status comment (the `repo-harness issue status` format) under a `Gates:` list. When the task has a PR but no issue, park it under a `Gates:` list in the PR description. When the task has neither, park it in the catch-up reply of the current conversation. Give each gate an id, the question, the options, the recommended option, and what happens if no answer arrives by a stated time. Route the remaining work around the gate. The [catch-up reply](#report-sop) lists open gates first. A reply to a gate is a human comment on the same issue. The Bot reads that comment back before it acts on it.

For a multi-PR coordination run, the issue and its PRs are the coordination state. The issue body lists the execution steps. A run log, when kept, is an append-only list of events. Derive an owner summary from the run log, or write the summary once at closeout. Approval text goes in the PR description, not in a separate file.
