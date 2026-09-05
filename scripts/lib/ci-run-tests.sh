#!/usr/bin/env bash
# Sourceable CI test-loop library. Sourcing must have no side effects so the
# loop can be exercised directly without running the whole gate.

run_bun_test_file() {
  local file="$1"
  echo "[ci] test $file"
  bun test --timeout "${BUN_TEST_TIMEOUT_MS:-60000}" --max-concurrency "${BUN_TEST_MAX_CONCURRENCY:-4}" "$file"
}

run_bun_tests() {
  if [[ "${BUN_TEST_ISOLATE_FILES:-0}" != "1" ]]; then
    bun test --timeout "${BUN_TEST_TIMEOUT_MS:-60000}" --max-concurrency "${BUN_TEST_MAX_CONCURRENCY:-4}"
    return
  fi

  local found=0
  local failed_count=0
  local failed_list=""
  local file
  local status

  # Isolate mode keeps running every selected file after a failure so one early
  # red file cannot hide the rest of the suite from the gate's log.
  if [[ -n "${BUN_TEST_FILES:-}" ]]; then
    for file in $BUN_TEST_FILES; do
      found=1
      status=0
      run_bun_test_file "$file" || status=$?
      if [[ "$status" != "0" ]]; then
        failed_count=$((failed_count + 1))
        failed_list+="  $file (exit $status)"$'\n'
      fi
    done
  else
    while IFS= read -r file; do
      found=1
      status=0
      run_bun_test_file "$file" || status=$?
      if [[ "$status" != "0" ]]; then
        failed_count=$((failed_count + 1))
        failed_list+="  $file (exit $status)"$'\n'
      fi
    done < <(find tests -type f -name '*.test.ts' | LC_ALL=C sort)
  fi

  if [[ "$found" != "1" ]]; then
    echo "[ci] no test files matched" >&2
    return 1
  fi

  if [[ "$failed_count" -gt 0 ]]; then
    echo "[ci] failed test files ($failed_count):" >&2
    printf '%s' "$failed_list" >&2
    return 1
  fi
}
