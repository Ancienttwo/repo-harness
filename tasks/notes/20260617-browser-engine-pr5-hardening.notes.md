# Browser Engine PR5 Hardening Notes

## Context

PR #5 adds the experimental ChatGPT browser engine, including CLI session storage, Oracle/native providers, MCP opt-in tools, docs, and a Codex skill.

## Decisions

- Oracle stdout is treated as model-visible text, not a trusted artifact manifest. The wrapper still records stdout, conversation URL, and provider session id, but it ignores `Artifact:` / `Output:` / `Session file:` paths until a structured provider-owned manifest exists.
- Browser input files now reuse MCP path containment logic so allowed-path symlinks cannot escape the repository.
- `writeOutput` is validated before provider execution. CLI output paths are repo-relative by default, absolute output requires `--allow-absolute-output`, and overwrites require `--overwrite-output`. MCP browser tools use a narrower workflow-artifact write policy and never accept absolute paths.
- Follow-up sessions keep `sourceSessionId` as the repo-harness local session id, but Oracle receives only `providerSessionId` from the stored upstream provider metadata.
- Native provider remains experimental. It fails closed for `--model` and `--thinking`, waits for stable assistant text before returning `completed`, and no longer scans `ps` output to kill Chrome by profile path.
- PR #5 now has a minimal GitHub Actions CI gate that delegates to `bun run check:ci`, so the hosted check uses the same install/typecheck/test/workflow/migration/package-smoke path as local release-style validation.
- Hosted CI configures a deterministic git identity and runs the full Bun suite with `BUN_TEST_MAX_CONCURRENCY=1` / `BUN_TEST_TIMEOUT_MS=180000`. The workflow/helper tests create temporary git repos, worktrees, locks, and migration commits; repo release notes already use this serial full-suite mode for final gates.
- Hosted CI pins Bun to `1.3.10`, matching the local verified runtime. `bun-version: latest` resolved to Bun 1.3.14 on GitHub Actions and produced helper-script false failures outside the browser-engine surface. The `codex/**` push trigger remains intentional while this PR introduces the workflow file; until it lands on `main`, branch push checks are the authoritative PR5 gate.
- Hosted CI installs `jq` explicitly because workflow policy parsing controls contract-worktree startup; relying on runner-image preinstalls makes the gate non-portable. Linux validation also fixed `workflow_with_lock` stale-lock mtime detection by preferring GNU `stat -c '%Y'` before the BSD fallback.
- Hosted CI runs Bun test files in isolated processes via `BUN_TEST_ISOLATE_FILES=1`. The default local gate still runs one full `bun test`, while the hosted PR gate trades runtime for repeatability after full-suite GitHub runs exposed state leakage between historical workflow-helper tests outside the browser-engine surface.
- Contract verification now runs `commands_succeed` in a non-login Bash with `BASH_ENV` unset. Hosted runners can carry shell profile state that should not influence machine-verifiable contract criteria.
- `tests/contract-run.test.ts` now prints verifier stdout, stderr, structured report, review, and artifact content only on failure so hosted CI can expose the exact failed contract criterion instead of a bare status mismatch.
- `verify-contract.sh` parses the `Review File` header with literal blockquote matching (`^>`) and shell string slicing instead of awk `match(...)`. Hosted CI exposed that the old parser could drop a backtick-wrapped review path and then falsely fail `qa_scores` and manual pass checks.
- After merging the latest `origin/main`, the helper workflow fixture now seeds the required reference-config and deploy surface before testing stale resume detection, then uses fixed `touch -t` mtimes instead of `sleep 1`. This keeps that unit focused on resume freshness instead of failing early on main's broader workflow-shape gate or drifting across macOS/Linux timestamp behavior.
- `check-task-workflow.sh` now treats `stat` output as valid only when it is numeric and tries GNU `stat -c` before BSD `stat -f`. Linux hosted runs exposed that GNU `stat -f '%m'` exits 0 with filesystem metadata, which skipped resume freshness failures.
- Contract and sprint helper parsers now use literal `^>` blockquote matching for `Task Profile`, `Updated`, and `Source Plan` headers. Hosted GNU awk treats `\>` as a word-boundary operator, so the escaped form failed open in some workflow-helper cases.

## Verification Focus

- `tests/cli/chatgpt-browser.test.ts` covers symlink escape denial, unsafe output denial, stdout artifact path ignoring, provider session follow-up wiring, native model-selection failure, and invalid session id rejection.
- `tests/cli/mcp-tools.test.ts` covers MCP browser `writeOutput` path policy.
