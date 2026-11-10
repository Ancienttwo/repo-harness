---
name: repo-harness-orchestrator
description: Start the orchestrator seat of the current repository in a new Herdr tab of the project space, from repo-harness seats argv. Refuses when the repository already has a live orchestrator seat.
when_to_use: "repo-harness-orchestrator"
disable-model-invocation: true
---

# repo-harness-orchestrator

Bot entrypoint. Explicit invoke only. It starts one process. `repo-harness seats argv`
holds the model, the effort, the tool limits, the env, the labels and the brief; this
skill copies none of them. The role rules stay in `repo-harness-issue-flow`.

A running session cannot get tool limits or env after its start, so this skill never
turns the current session into the seat. It always starts a new terminal.

## Steps

Run each step from the project checkout. Stop at the first failure and report its
command and output. Do not retry with another runtime: a missing `hc` or `herdr-app`
stops with `herdr-core is not available`; there is no tmux fallback.

1. Repository: `id=$(gh api 'repos/{owner}/{repo}' --jq .id)` and
   `name=$(gh api 'repos/{owner}/{repo}' --jq .name)`. `gh` reads the git remote of
   the cwd, so each project gets its own seats. The folder is the primary checkout:
   `folder=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")`.
2. Space: when the user named a space id (`--space <id>`), it must be the `id` of a
   local space in `herdr-app ls` (no `<machine>/` prefix). Otherwise take the local
   space whose `name` is `$name`:
   `herdr-app ls | jq -r --arg n "$name" '[.spaces[] | select((.id | contains("/") | not) and .name == $n) | .id]'`.
   Zero or more than one id: stop with `space does not resolve for <name>: <ids>; invoke again with --space <id>`.
   Never use the selected space.
3. Duplicate check, local terminals only:
   `hc ls --json --label repo-harness.seat=orchestrator --label "repo-harness.repository=$id" | jq -r '[.terminals[] | select(.address | contains("/") | not) | .address]'`.
   A non-empty list: stop with `refused: repository <id> already has a live orchestrator seat at <address>`.
4. Start:
   `herdr-app do tab.new --space <space> --name "$(repo-harness seats argv orchestrator --repository-id "$id" --json | jq -r .tab)" --folder "$folder" --argv "$(repo-harness seats argv orchestrator --repository-id "$id")"`.
   A failed `seats argv` (stderr JSON with `ok: false`) stops before `tab.new`.
5. Report the new terminal address from the command output. When the output names
   none, run the step 3 query again: the argv labels its own terminal before the agent
   starts. Report `source:` and each `limit` line of `seats argv` stderr.

The advisor starts next with `repo-harness-advisor`.
