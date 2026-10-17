# Product Mode: Goal

Use when the user requests a bounded native `/goal` session in Codex or Claude.
This mode prepares the prompt. The host owns continuation. The GitHub issue and
PR own task identity, claim, status and dependencies. Read `../SKILL.md` and the
repo-local `AGENTS.md` or `CLAUDE.md` first.

## Protocol

1. Read the current GitHub issue before using a planning artifact to prepare
   execution. Read its state, assignees, all comments and linked PRs through
   gh or the GitHub API. Paginate comments. Check active claims and handoff notes.
2. Follow the repository's issue-claim rules. Reuse the task owner's active
   claim. Take over another owner's work only after an explicit handoff or
   user instruction. A planning document cannot release a claim.
3. Require a detailed issue brief with the goal, scope, non-goals, acceptance
   checks, dependencies and a stop or rollback condition. Read linked PRDs under
   `plans/prds/*.prd.md`, historical Sprint files under `plans/sprints/*.sprint.md`
   and other supplied documents as planning references. They do not own task
   identity, execution permission or completion status.
4. Map any requested work from a historical Sprint to the current GitHub issue.
   Use the issue URL and its accepted scope in the goal prompt. If an issue does
   not exist, prepare issue drafts through the backlog mode within the user's
   write scope. Do not start implementation from the historical row.
5. Build one bounded goal from the issue brief. Verify named repository paths,
   concrete acceptance checks and the stop condition. Record the linked PR when
   one exists. Do not mint task IDs, contracts, offers or leases.
6. Re-read the issue and claim state before execution and on resume. Follow the
   repository's claim, verification and publication rules. The prepared prompt
   does not grant approval, a new claim or broader scope.
7. Carry only delegation authority already granted by the user or repository
   rules. For independent workstreams, limit Codex delegation to 3 subagents,
   depth 1 and separate write ownership. Sequential work needs no subagent.

## Goal Prompt Shape

```text
/goal
Goal: <one bounded outcome from the issue>
Issue: <GitHub issue URL>
PR: <linked PR URL, or none yet>
Claim: <current owner or explicit handoff, with its comment URL>
Authority: the current GitHub issue and PR
Planning references: <optional PRD, historical Sprint or source document>
Scope: <included files and modules>
Non-goals: <explicit exclusions>
Preflight: re-read the issue, all claim comments and linked PRs before execution and on resume; follow the repository's issue-claim rules
Acceptance checks: <commands or observable outcomes from the issue brief>
Stop condition: <verified completion or evidence of a blocker or ownership conflict>
Delegation: use only existing authorization; max 3 Codex subagents, depth 1, independent workstreams and separate write ownership
Reporting: use the user's language unless repo-local instructions require otherwise; record the revision, changed files, checks and remaining blockers in the issue or PR
```

## Failure Modes

- If the issue is missing or cannot be read, stop before execution. Request the
  issue or prepare a planning draft within the user's scope. Do not infer claim
  state from local files or chat history.
- If another owner has an active claim, coordinate with that owner. Do not start
  duplicate work without an explicit handoff or user instruction.
- If the issue and planning references disagree, report the conflict. Preserve
  the current issue scope until the owner resolves it.
- If the brief lacks scope or objective acceptance checks, prepare the missing
  details for review before starting the Goal session.
- If the issue is closed or the linked PR already delivered the requested work,
  report that result instead of opening a second execution path.

## Boundaries

- Prepare an execution Goal only for a current issue with a valid claim and
  sufficient requirements. Product planning alone does not start execution.
- Preserve host-native `/goal` ownership. Codex or Claude owns continuation;
  repo-harness prepares context and verification requirements.
- Preserve existing user approval. Follow `../SKILL.md` and the repository's
  current execution rules. The prompt cannot approve or publish its own work.
