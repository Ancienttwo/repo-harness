# Agentic development flow

- Default task worktrees use `/tmp/<repo>-wt-<slug>` on POSIX. Native Windows uses `os.tmpdir()` as the root. The stored default is `{{system_tmp}}/{{repo}}-wt-{{slug}}`. Runtime code resolves the temp token. Explicit stored templates stay unchanged. Commit or push work before a reboot or age-based tmp cleanup, such as `systemd-tmpfiles`. These cleaners can remove checkouts. Missing entries are pruned. The sweep saves missing registration identities before global prune. Later batches finish deferred branch cleanup. Unmerged branches remain.
- Closeout removes a merged, clean checkout and its branch. It releases only that checkout's own canonical marker after merge proof under the topology lock. The sweep keeps dirty, locked, marked or leased worktrees. It keeps branch reflogs without a commit-creation message and missing or unreadable reflogs. Fast-forward, target-only automatic merges, reset and rebase-finish messages do not count. Dispatch must establish an unmerged commit or keep the worktree dirty, marked or leased. A merged, clean, unowned branch with its own commits can be swept.
- `start` recovers only a real target directory registered by this clone on the expected branch, under the topology lock, with no lock or other owner. Recovery requires a current-user-owned checkout directory without group or other write access, a regular owned Git pointer, its matching admin backpointer, and the original directory identity saved by start. Git metadata can be group-writable but must not be other-writable. Start still creates a checkout when uid is unavailable; recovery then refuses. Exact removal retires the identity after Git readback. Missing identity or a replacement directory blocks recovery. Files, symlinks, unregistered paths and other branches are refused. Cleanup refuses a registered worktree whose branch is missing. MCP cleanup also refuses active markers and retained native verification evidence. Sweep reports name processed paths. Deferred entries are reported as counts. `kept` excludes deferred entries. A command timeout sends SIGTERM to the direct child only. A grandchild can briefly extend the deadline. No detached cleanup process starts. Herdr notifications accept registered default task worktrees and paths inside them. Other temporary paths and `rh-herdr-` labels stay filtered.

## Daily Flow
1. Read the current request and `AGENTS.md`; load architecture or worker techniques only when relevant.
2. Open a branch; isolate a worktree when concurrent edits overlap. Preserve unrelated work.
3. Make small, bounded commits. Ordinary tasks live in the PR description: goal, changes, verification, risk and rollback.
4. Freeze the candidate and verify once: typecheck plus affected tests. Reviewers and closeout consume the same evidence.
5. A model may squash-merge into main only when the current task explicitly authorizes main publication, automatic checks pass, and GitHub has no outstanding change requests or unresolved review threads. An explicit no-merge instruction always wins. Record the GitHub merge SHA and parent SHA. Record `git revert --no-edit <squash-commit>`. Do not create rollback tags.
6. Run the full suite daily, automatically open a repair task on failure, and produce the daily merge/check/rollback report. Run the [Lessons Retro](#lessons-retro) in the same nightly window.
7. Use the [Report SOP](#report-sop) for formal progress, phase and final reports to the user, including the daily user summary. Raw automated CI reports are evidence inputs; they do not replace that summary and do not require this format.

## Report SOP
- Give a Feynman report: explain the work to a reader who does not know this project. Use plain language. Explain the goal, user value, how it works, completed work and remaining gaps. Explain each technical term at first use.
- State the conclusion, changes, reasons, verification and remaining risks. Link each claim to its source or label it as an inference. Use observed results. Name failed, incomplete and omitted checks.
- Include a PlantUML progress diagram. Supply an editable `.puml` file or the complete PlantUML code. Use the same evidence snapshot for the report and diagram. State the snapshot date and relevant revision. Do not invent percentages or dates.
- Keep planned, dispatched, implemented, verified, merged and released states distinct. Mark unknown and failed states as such. A worker report or an Agent `done` signal is not proof of verification, merge or release.
- Render the diagram when a permitted renderer is available. If rendering fails or is unavailable, state the limit and keep the source. Do not upload private material to an external renderer without user authorization.
- Keep the report proportional to the work. Routine confirmations, short updates and tool logs do not require a full report. This SOP adds no approval gate or separate status store. Use existing task, PR and verification sources.

## Lessons Retro
`tasks/lessons.md` is the one lessons ledger. It has the role of a root `LESSONS.md`. Do not add a second lessons file. Generated root `CLAUDE.md` and `AGENTS.md` tell each session to read it. Add that line by hand to an existing root file.

- The ledger keeps one watermark line before the first entry: `reviewed-through: <full commit SHA>`. If the line is missing, the first retro reviews the last 24 hours and adds it.
- Each night, review the default-branch history after the watermark: `git log --first-parent <watermark>..origin/main`. Skip commits that change only `tasks/lessons.md`.
- Look for three signals: a fix that repairs recent work, a change that should not have merged, and verification that was too thin for the changed behavior. A revert or a follow-up hotfix is evidence.
- Add at most one entry for each theme on one day. Keep the fields that `repo-harness run maintenance-triage` reads. `- Date:` starts each entry:

```markdown
- Date: <YYYY-MM-DD>
- Mistake pattern: <stable theme key>
- Prevention rule: <rule>
- Why: <what failed and what it cost>
- Triggered by correction: <commit SHA, PR or issue>
- Seen: <N>×
```

- For a repeat, copy the `Mistake pattern` text exactly. Maintenance triage groups entries by that text. `Seen` counts the entries with that text, this entry included. Do not edit `Seen` on older entries.
- At `Seen: 3×`, the lesson occurred on three different days. Promote its prevention rule into root `AGENTS.md` and root `CLAUDE.md` in the same PR. Add `- Promoted: <PR>` to that entry.
- Each retro advances the watermark to the last reviewed commit, also when it finds no lesson. If an earlier retro PR is still open, update that PR. Do not open a second retro PR.
- Every change to `tasks/lessons.md` goes through a PR and merges only after GO. GO is an explicit go-ahead from the repository owner (Aimpact for repo-harness) for one reviewed head SHA. Task-level publication authorization does not replace it. Merge with `gh pr merge <pr> --squash --match-head-commit <reviewed-sha>`. Lessons are not task notes. Ordinary tasks still write notes only for non-obvious decisions. A correction in a task can add an entry; that entry follows the same PR and GO rule.

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

The bot selects scope, worker and verification by risk. Use independent gatekeeper/cross-model review for large changes, security/permissions or model uncertainty; do not rerun a passing check or require multiple re-gates.
A worker gets Goal, Scope, Verify, Rollback and a timebox, then loads concrete techniques on demand. Do not put routing catalogs or every technology guide in its brief.

A coding session that spawns sub-agents is their parent. Investigate first, then split work by write ownership. Give each parallel writer its own worktree from a clean source. Implementation sub-agents edit only their scope. They do not run build, typecheck or tests. They commit early in their own worktree and return early. In a shared checkout they do not commit; the parent commits. An evidence role whose task is a named check, such as a root-cause reproduction or an evaluation profile, still runs that check and does not commit. The brief's Verify section names the checks that the parent runs after integration. The parent owns task management, conflict resolution, build, typecheck, tests and integration. After integration, the parent removes each sub-agent worktree and branch whose commits are in the task branch and whose checkout is clean. It also removes the intermediate build output and temporary files that the work created. Other deletion still needs the user.

The bot measures progress by side effects only: commits, pushes, evidence events and PR or check changes. It does not resume a worker to check liveness. A worker past its timebox with no new side effect is stalled; stop it or ask the user.
Retry by failure mode. Reduce scope after a limit or out-of-memory stop. Move a tool error to another model. A network drop or an unknown failure gets one retry only for a read-only or idempotent call. For a call that can change remote state, check the original request and the provider receipt first; do not retry an unknown effect. After two failures of one task, stop and ask the user.
Clear PR blockers in this order: conflicts, review threads, then CI. Classify a CI failure before a retry. A suspected flake gets one fresh build; an identical second failure is not a flake.
Stop and ask the user when a command reports `reconciliation_required`, `task_agent_delivery_unknown`, `launch-unknown`, `cleanup_pending`, `liveness_unproven` or `publication_recovery_required`; when a result reports `side_effects=unknown`; when a lease directory is empty or malformed; before a third review round; when a review thread concerns security, authentication, data or migrations; or when a written rule conflicts with observed state.

Architecture docs remain references. Update them only when responsibilities or boundaries change; no per-edit drift queue, workstream sync or automatic agent-context block. Ordinary work has no plan/contract/review/notes or promote/archive prerequisite. Notes are optional for non-obvious decisions; PRDs are for real new products.
