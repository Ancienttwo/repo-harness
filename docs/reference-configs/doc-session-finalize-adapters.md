# Finalization adapters

This slice stacks on the independent #1023 core in PR #1163. It adds no route,
worker, host control, resume behavior or frontend. It does not replace the core's
journal or the shared write-run audit.

## Integration exports

`createDocSessionGithubAdapters(env, runner?, now?)` in
`src/effects/operator/doc-session-finalize-github.ts` supplies three dependency
fields for `DocSessionFinalizeDependencies`:

- `publication_target`: inspect the worktree's real Git fetch and push URLs.
  Require one unambiguous GitHub remote and the same repository at both URLs.
  Read the provider's canonical repository identity, default branch and push
  permission. Refuse archived, disabled, redirected or mismatched repositories.
- `find_draft_pr`: query the exact head in all PR states and across all bases.
  Require one open Draft PR with the exact repository IDs, head SHA, head branch,
  base branch and URL. A closed, merged, non-Draft or incompatible PR refuses.
  Malformed, ambiguous, incomplete or unavailable responses never mean absent.
- `create_draft_pr`: recheck provider identity/permission and existing PRs before
  one POST. Send user text as raw gh fields and draft as a typed boolean. A
  preflight failure before POST is `not_created`; any error or invalid response
  after POST is `unknown`. The adapter never retries a POST.

The default transport is the existing `runGithubCommand` / `GithubCommandRunner`
from `src/effects/github/issues.ts`. There is no new HTTP client, token lookup or
credential copy. Every provider request pins `--hostname github.com`. The runner
uses the operator worker's existing gh context; `env` selects only the Git
observation environment. Injecting a runner is an internal integration/test seam,
not request input. One provider call has a shared 15-second / 2-MiB budget.

The core owns publication authorization, intent/result audit and durable replay.
Only use these callbacks through the finalization operations and shared write
run. Do not expose the provider callbacks directly as unaudited routes.

`createDocSessionScopeValidator(authority)` in
`src/effects/operator/doc-session-finalize-scope.ts` supplies `validate_changes`.
It composes `normalizeDocsPath`, `docsHostProtectedProjection` and
`readArchitectureHandEdits`. Out-of-scope paths return 422 `path_outside_scope`;
protected targets or affected manually edited regions return 422
`generated_region`. Both include safe relative paths. Policy/provider failures
return 503 `scope_validation_unavailable`.

## Remaining host policy handoff

The scope factory **requires** `authority.is_writable_path`. It has no permissive
default. In this base, the host's instruction/config directory and file patterns
are private `FORBIDDEN_WRITE_FILES` / `FORBIDDEN_WRITE_DIRECTORIES` constants in
`src/effects/review/docs-host-isolation.ts`. This slice does not copy their regexes
or edit that shared file. The host owner must expose the canonical predicate and
use the same authority in the OS profile before production composition.

Pass the existing architecture provider options, including the operator env,
through `authority.architecture`. The factory never skips a failed hand-edits
check or installs, restarts or changes the architecture provider.

The integration task still owns `with_quiesced_session`, the bounded write worker,
CLI/routes, response composition, architecture registration and native acceptance.
Use the core's shared `docs_session:<sid>` target and keep messages/resume excluded
until finalization ends. See [core contract](doc-session-finalize.md) for audit
recovery and request_id semantics.

## Verification boundary

Tests inspect real temporary Git remote configuration. They simulate the GitHub
command boundary and architecture process envelope. No test invokes the real
provider runner, creates a customer PR or uses model credentials. Scope tests use
a fixture-only writable-path predicate; they do not verify the production host
policy. Native occupancy, live host behavior and cross-model High review remain
separate gates. Cloud `/proc` uncertainty remains fail-closed in the core.

API references: [GitHub pull requests](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28)
and [gh api](https://cli.github.com/manual/gh_api).
