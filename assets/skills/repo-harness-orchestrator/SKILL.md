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

## Run

Run the script below as one Bash command from the project checkout. Set `SPACE` to the
space id when the user named one (`--space <id>`); otherwise leave it empty. Every
probe is its own checked step: a failed or unparsable probe stops the script, and is
never read as "no seat" or "no space". A non-zero exit starts nothing; report its
stderr. A missing `hc` or `herdr-app` stops the script; there is no tmux fallback.

```bash
SPACE=''
stop() { printf 'repo-harness-orchestrator: %s\n' "$1" >&2; exit 1; }
for tool in gh git jq hc herdr-app repo-harness; do command -v "$tool" >/dev/null || stop "$tool is not available"; done

# 1. Repository: gh reads the git remote of the cwd, so each project has its own seats.
repo=$(gh api 'repos/{owner}/{repo}') || stop 'gh cannot read the repository of the cwd git remote'
id=$(printf '%s' "$repo" | jq -er '.id | numbers') || stop 'the repository has no numeric id'
name=$(printf '%s' "$repo" | jq -er '.name | strings') || stop 'the repository has no name'
common=$(git rev-parse --path-format=absolute --git-common-dir) || stop 'the cwd is not in a git checkout'
folder=$(dirname "$common")

# 2. Space: the named id, else the one local space named after the repository. Never the selected space.
layout=$(herdr-app ls) || stop 'herdr-app ls failed'
spaces=$(printf '%s' "$layout" | jq -ec --arg n "$name" --arg s "$SPACE" '.spaces | arrays
  | [.[] | select((.id | contains("/") | not) and (if $s == "" then .name == $n else .id == $s end)) | .id]') || stop 'herdr-app ls has no space list'
[ "$(printf '%s' "$spaces" | jq length)" = 1 ] || stop "space does not resolve for $name: $spaces; invoke again with --space <id>"
space=$(printf '%s' "$spaces" | jq -r '.[0]')

# 3. Duplicate check, local terminals only.
seats=$(hc ls --json --label repo-harness.seat=orchestrator --label "repo-harness.repository=$id") || stop 'hc ls failed'
live=$(printf '%s' "$seats" | jq -ec '.terminals | arrays | [.[] | .address | select(contains("/") | not)]') || stop 'hc ls has no terminal list'
[ "$live" = '[]' ] || stop "refused: repository $id already has a live orchestrator seat at $(printf '%s' "$live" | jq -r 'join(", ")')"

# 4. Launch: seats argv first, checked, then Herdr with the checked values.
launch=$(repo-harness seats argv orchestrator --repository-id "$id" --json) || stop 'repo-harness seats argv orchestrator failed'
argv=$(printf '%s' "$launch" | jq -ec '.argv | select(type == "array" and length > 0 and all(.[]; type == "string"))') || stop 'seats argv gave no argv'
tab=$(printf '%s' "$launch" | jq -er '.tab | strings | select(. != "")') || stop 'seats argv gave no tab name'
herdr-app do tab.new --space "$space" --name "$tab" --folder "$folder" --argv "$argv" || stop 'herdr-app tab.new failed'
```

Then report the new terminal address from the `tab.new` output. When the output names
none, run the step 3 probe again: the argv labels its own terminal before the agent
starts. Report the `limits` of the `seats argv` JSON.

The advisor starts next with `repo-harness-advisor`.
