---
name: repo-harness-advisor
description: Start the advisor seat of the current repository beside its live orchestrator seat in the project Herdr space, from repo-harness seats argv. Refuses without a live orchestrator or with a live advisor.
when_to_use: "repo-harness-advisor"
disable-model-invocation: true
---

# repo-harness-advisor

Bot entrypoint. Explicit invoke only. It starts one process. `repo-harness seats argv`
holds the model, the effort, the tool limits, the env, the labels and the brief; this
skill copies none of them. The role rules stay in `repo-harness-issue-flow`.

A running session cannot get tool limits or env after its start, so this skill never
turns the current session into the seat. It always starts a new terminal.

## Steps

Run each step from the project checkout. Stop at the first failure and report its
command and output. A missing `hc` or `herdr-app` stops with
`herdr-core is not available`; there is no tmux fallback.

1. Repository and space: steps 1 and 2 of `repo-harness-orchestrator` give `$id`,
   `$name`, `$folder` and `<space>`. A space that does not resolve stops the skill.
2. Duplicate check, local terminals only:
   `hc ls --json --label repo-harness.seat=advisor --label "repo-harness.repository=$id" | jq -r '[.terminals[] | select(.address | contains("/") | not) | .address]'`.
   A non-empty list: stop with `refused: repository <id> already has a live advisor seat at <address>`.
3. Orchestrator: the same query with `repo-harness.seat=orchestrator` must give exactly
   one address. Zero: stop with `refused: repository <id> has no live orchestrator seat; the advisor serves only the orchestrator`.
   More than one: stop and name them.
4. Orchestrator pane: in `herdr-app ls`, find the tab whose `terminals` hold that
   address, and read its `pane`. The tab must be in `<space>`; otherwise stop with
   `refused: the orchestrator seat <address> is not in space <space>`.
5. Start:
   - The tab has fewer than 3 terminals:
     `herdr-app do pane.split --direction right --pane <pane> --argv "$(repo-harness seats argv advisor --repository-id "$id")"`.
   - The tab is full:
     `herdr-app do tab.new --space <space> --name "$(repo-harness seats argv advisor --repository-id "$id" --json | jq -r .tab)" --folder "$folder" --argv "$(repo-harness seats argv advisor --repository-id "$id")"`.
   Never split down. A failed `seats argv` stops before the Herdr command.
6. Report the new terminal address from the command output, or from the step 2 query
   when the output names none. Report `source:` and each `limit` line of `seats argv` stderr.
