# Writing the test side of a contract

The rules for what a `Verification Plan` may contain are policy
(`docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards`).
This file records the shapes and paths that are specific to this repository.

## Check shape

`src/core/evidence/verification-plan.ts` is the validator. `protocol` is `1`;
`kind` is `"command"` or `"package_test"`; a `package_test` check carries
`path` and must not carry `command`. Every check also declares `id`, `cwd`,
`phase` (`preflight` | `verification`), `cost` (`normal` | `expensive`),
`evidence_policy` (`current_exact` | `baseline_with_delta`), `necessity`, and
`inputs.env`. Unknown fields fail closed.

List named test paths, not globs and not a command that re-derives a set:

```json
{"id":"t-skill-surface","kind":"package_test","path":"tests/skill-surface/catalog.test.ts",
 "cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact",
 "necessity":"manifest-derived surface inventory","inputs":{"env":[]}}
```

The full suite appears at most once, only as `cost: "expensive"`, and only with
a `necessity` naming the uncovered integration risk or the explicit gate that
requires it. A diff's size, a new test file, or an evidence cache miss is not a
reason. Declare each execution once: do not list a leaf check that an aggregate
script such as `bun run check:ci` already runs.

## Bind the task-sync digest

The digest must be computed against the same boundary CI will use, or it goes
stale the moment `main` moves:

```bash
REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base \
  bash scripts/check-task-sync.sh
```

`REPO_HARNESS_DIFF_MODE` accepts `merge-base` (pull requests) or `direct`
(push-parent); it defaults to `direct`. Rebind after every rebase onto a moved
`main`.

## Which lane the change will get

`scripts/select-ci-coverage.ts#isDocumentationPath` is the whole documentation
allowlist:

- `README.md`
- `docs/architecture/.projection-manifest.json`
- anything under `tasks/`, `plans/`, or `.ai/harness/handoff/`
- any `.md` under `docs/`, **except** anything under `docs/reference-configs/`

Every other path keeps full coverage, including `src/`, `tests/`, `scripts/`,
`assets/`, `.github/`, `.archcontext/`, `.ai/harness/policy.json`, and
`docs/reference-configs/`. One unclassified path in the diff is enough to force
`full`, so a mixed documentation-and-code change gets the full suite.

## Documentation-consumer tests are a derived list

`scripts/ci-documentation-consumers.ts` scans the test sources for reads that
resolve to a tracked repository document, using bounded lexical path flow.
`tests/ci-documentation-consumers.test.ts:45-48` then asserts that the
`Check documentation consumers` step in `.github/workflows/ci.yml` selects
exactly that discovered projection through `BUN_TEST_FILES`.

So a new test that reads a real document from the checkout (rather than from a
temporary fixture it wrote itself) changes the projection, and the workflow's
list has to be updated in the same change. Run
`bun test tests/ci-documentation-consumers.test.ts --timeout 60000` to see the
expected list; a case that reads only fixture-written files is excluded by
design and needs no workflow entry.
