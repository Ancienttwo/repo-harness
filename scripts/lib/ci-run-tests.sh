#!/usr/bin/env bash
# Sourceable CI test-loop library. Sourcing must have no side effects so the
# loop can be exercised directly without running the whole gate.

run_bun_test_file() {
  local file="$1"
  echo "[ci] test $file"
  bun test --timeout "${BUN_TEST_TIMEOUT_MS:-60000}" --max-concurrency "${BUN_TEST_MAX_CONCURRENCY:-4}" "$file"
}

# Bounded job pool for isolate mode. Only the parent prints, replaying each
# worker's captured log the moment that worker finishes, so a file's header and
# its bun output stay contiguous in the merged CI log without any lock.
# Written for bash 3.2: no `wait -n`, no associative arrays, no GNU-only flags.
#
# stdout carries the replayed logs, so the failure list travels back through the
# caller's `failed_list` variable instead.
_ci_run_bun_test_pool() {
  local jobs="$1"
  shift
  local files=("$@")
  local total="${#files[@]}"

  local tmpdir
  if ! tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/rh-ci-jobs.XXXXXX" 2>/dev/null)"; then
    echo "[ci] job pool could not create a temporary directory" >&2
    return 1
  fi
  # A sourced library must not steal the caller's EXIT handler, so the previous
  # one is restored once the pool is done with its scratch directory.
  local previous_exit_trap
  previous_exit_trap="$(trap -p EXIT)"
  trap 'rm -rf "$tmpdir"' EXIT INT TERM
  if ! : >"$tmpdir/.probe" 2>/dev/null; then
    echo "[ci] job pool temporary directory is not writable: $tmpdir" >&2
    rm -rf "$tmpdir"
    trap - EXIT INT TERM
    [[ -n "$previous_exit_trap" ]] && eval "$previous_exit_trap"
    return 1
  fi

  local -a slot_pid slot_file slot_log slot_status
  local slot
  for ((slot = 0; slot < jobs; slot++)); do
    slot_pid[$slot]=""
    slot_file[$slot]=""
    slot_log[$slot]=""
    slot_status[$slot]=""
  done

  local next=0
  local running=0
  local unsorted=""
  local pool_error=0
  local file log status_file pid status progressed

  while [[ "$next" -lt "$total" || "$running" -gt 0 ]]; do
    for ((slot = 0; slot < jobs; slot++)); do
      [[ "$next" -lt "$total" ]] || break
      [[ -z "${slot_pid[$slot]}" ]] || continue
      file="${files[$next]}"
      log="$tmpdir/$next.log"
      status_file="$tmpdir/$next.status"
      # The worker records its own exit code through a rename so the parent can
      # never observe a half-written status, and `set -e` in the caller cannot
      # abort the worker before that record exists.
      (
        status=0
        run_bun_test_file "$file" >"$log" 2>&1 || status=$?
        printf '%s\n' "$status" >"$status_file.partial"
        mv "$status_file.partial" "$status_file"
      ) &
      pid=$!
      if [[ -z "$pid" ]]; then
        echo "[ci] job pool could not spawn a worker for $file" >&2
        pool_error=1
        unsorted+="  $file (exit 1)"$'\n'
        next=$((next + 1))
        continue
      fi
      slot_pid[$slot]="$pid"
      slot_file[$slot]="$file"
      slot_log[$slot]="$log"
      slot_status[$slot]="$status_file"
      next=$((next + 1))
      running=$((running + 1))
    done

    progressed=0
    for ((slot = 0; slot < jobs; slot++)); do
      pid="${slot_pid[$slot]}"
      [[ -n "$pid" ]] || continue
      status_file="${slot_status[$slot]}"
      file="${slot_file[$slot]}"
      log="${slot_log[$slot]}"
      if [[ -f "$status_file" ]]; then
        wait "$pid" 2>/dev/null || true
        status="$(cat "$status_file")"
      elif kill -0 "$pid" 2>/dev/null; then
        continue
      else
        status=0
        wait "$pid" 2>/dev/null || status=$?
        if [[ -f "$status_file" ]]; then
          status="$(cat "$status_file")"
        else
          # The worker died without recording an exit code: the file's result is
          # unknown, so the pool fails closed instead of counting it as a pass.
          echo "[ci] job pool lost the worker for $file" >&2
          pool_error=1
          [[ "$status" != "0" ]] || status=1
        fi
      fi
      if [[ -f "$log" ]]; then
        cat "$log"
      fi
      if [[ "$status" != "0" ]]; then
        unsorted+="  $file (exit $status)"$'\n'
      fi
      slot_pid[$slot]=""
      slot_file[$slot]=""
      slot_log[$slot]=""
      slot_status[$slot]=""
      running=$((running - 1))
      progressed=1
    done

    if [[ "$progressed" == "0" && "$running" -gt 0 ]]; then
      sleep 0.05
    fi
  done

  # Completion order is a race, so the summary is sorted by file path to keep
  # the gate's failure block reproducible across runs.
  if [[ -n "$unsorted" ]]; then
    failed_list="$(printf '%s' "$unsorted" | LC_ALL=C sort)"$'\n'
  fi

  rm -rf "$tmpdir"
  trap - EXIT INT TERM
  [[ -n "$previous_exit_trap" ]] && eval "$previous_exit_trap"
  return "$pool_error"
}

run_bun_tests() {
  if [[ "${BUN_TEST_ISOLATE_FILES:-0}" != "1" ]]; then
    bun test --timeout "${BUN_TEST_TIMEOUT_MS:-60000}" --max-concurrency "${BUN_TEST_MAX_CONCURRENCY:-4}"
    return
  fi

  local jobs="${BUN_TEST_JOBS:-1}"
  case "$jobs" in
    '' | *[!0-9]* | 0*)
      echo "[ci] BUN_TEST_JOBS must be a positive integer (got '$jobs')" >&2
      return 1
      ;;
  esac

  local files=()
  local file
  local status
  local failed_list=""
  local pool_status=0

  if [[ -n "${BUN_TEST_FILES:-}" ]]; then
    for file in $BUN_TEST_FILES; do
      files[${#files[@]}]="$file"
    done
  else
    while IFS= read -r file; do
      files[${#files[@]}]="$file"
    done < <(find tests -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | LC_ALL=C sort)
  fi

  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "[ci] no test files matched" >&2
    return 1
  fi

  # Isolate mode keeps running every selected file after a failure so one early
  # red file cannot hide the rest of the suite from the gate's log.
  if [[ "$jobs" -eq 1 ]]; then
    for file in "${files[@]}"; do
      status=0
      run_bun_test_file "$file" || status=$?
      if [[ "$status" != "0" ]]; then
        failed_list+="  $file (exit $status)"$'\n'
      fi
    done
  else
    _ci_run_bun_test_pool "$jobs" "${files[@]}" || pool_status=$?
  fi

  local failed_count=0
  if [[ -n "$failed_list" ]]; then
    failed_count="$(printf '%s' "$failed_list" | awk 'END { print NR }')"
  fi

  if [[ "$failed_count" -gt 0 ]]; then
    echo "[ci] failed test files ($failed_count):" >&2
    printf '%s' "$failed_list" >&2
    return 1
  fi

  if [[ "$pool_status" != "0" ]]; then
    echo "[ci] job pool failed before every selected file reported" >&2
    return 1
  fi
}
