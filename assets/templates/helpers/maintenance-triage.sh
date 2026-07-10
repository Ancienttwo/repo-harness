#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/maintenance-triage.sh [--json]
USAGE_EOF
}

output_mode="text"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      output_mode="json"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "tasks/lessons.md" ]]; then
  if [[ "$output_mode" == "json" ]]; then
    printf '{"guard":[],"eval":[],"skill_proposal":[]}\n'
  else
    echo "[Maintenance] No tasks/lessons.md found."
  fi
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[Maintenance] jq is required for maintenance triage." >&2
  exit 1
fi

lessons_json="$(
  awk '
    BEGIN {
      count = 0
      theme = ""
      prevention = ""
      trigger = ""
      current_field = ""
    }
    function escape_json(value) {
      gsub(/\\/, "\\\\", value)
      gsub(/"/, "\\\"", value)
      gsub(/\t/, "\\t", value)
      gsub(/\r/, "\\r", value)
      return value
    }
    function emit() {
      if (theme == "" && prevention == "") {
        return
      }
      count++
      printf "%s{\"theme\":\"%s\",\"prevention\":\"%s\",\"trigger\":\"%s\"}", (count > 1 ? "," : ""), escape_json(theme), escape_json(prevention), escape_json(trigger)
      theme = ""
      prevention = ""
      trigger = ""
      current_field = ""
    }
    /^- Date:/ {
      emit()
      next
    }
    /^- Mistake pattern:/ {
      theme = $0
      sub(/^- Mistake pattern:[[:space:]]*/, "", theme)
      current_field = "theme"
      next
    }
    /^- Prevention rule:/ {
      prevention = $0
      sub(/^- Prevention rule:[[:space:]]*/, "", prevention)
      current_field = "prevention"
      next
    }
    /^- Triggered by correction:/ {
      trigger = $0
      sub(/^- Triggered by correction:[[:space:]]*/, "", trigger)
      current_field = "trigger"
      next
    }
    /^- [A-Za-z]/ {
      current_field = ""
      next
    }
    {
      if (current_field == "theme" && $0 != "") {
        theme = theme "\\n" $0
      } else if (current_field == "prevention" && $0 != "") {
        prevention = prevention "\\n" $0
      } else if (current_field == "trigger" && $0 != "") {
        trigger = trigger "\\n" $0
      }
    }
    END {
      emit()
    }
  ' tasks/lessons.md
)"

if [[ -z "$lessons_json" ]]; then
  if [[ "$output_mode" == "json" ]]; then
    printf '{"guard":[],"eval":[],"skill_proposal":[]}\n'
  else
    echo "[Maintenance] No repeated lessons to triage."
  fi
  exit 0
fi

triage_json="$(
  jq -nc --argjson items "[${lessons_json}]" '
    def keyify:
      ascii_downcase | gsub("[^a-z0-9]+"; "-") | gsub("^-+|-+$"; "");
    def candidate_type(theme; count):
      if count >= 3 and (theme | test("guard|contract|plan|todo|sync|handoff|policy|workflow"; "i")) then "guard"
      elif count >= 2 and (theme | test("test|verify|eval|review|qa|assert"; "i")) then "eval"
      elif count >= 3 then "skill_proposal"
      else empty
      end;
    reduce $items[] as $item (
      {grouped:{}};
      .grouped[$item.theme|keyify] += [$item]
    )
    | .grouped
    | to_entries
    | map({
        key: .key,
        theme: (.value[0].theme // .key),
        count: (.value | length),
        candidate: candidate_type((.value[0].theme // .key); (.value | length))
      })
    | reduce .[] as $entry (
        {guard:[], eval:[], skill_proposal:[]};
        if ($entry.candidate // "") != "" then
          .[$entry.candidate] += [{
            key: $entry.key,
            theme: $entry.theme,
            count: $entry.count
          }]
        else .
        end
      )
  '
)"

if [[ "$output_mode" == "json" ]]; then
  printf '%s\n' "$triage_json"
  exit 0
fi

echo "[Maintenance] Guard candidates:"
jq -r '.guard[]? | "- \(.theme) (\(.count))"' <<< "$triage_json"
echo "[Maintenance] Eval candidates:"
jq -r '.eval[]? | "- \(.theme) (\(.count))"' <<< "$triage_json"
echo "[Maintenance] Skill proposal candidates:"
jq -r '.skill_proposal[]? | "- \(.theme) (\(.count))"' <<< "$triage_json"
