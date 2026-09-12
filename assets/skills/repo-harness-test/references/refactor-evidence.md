# Test-refactor evidence techniques

`docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards`
owns coverage selection and artifact requirements; the contract's Verification
Plan selects executions. The recipes below support different evidence needs.
They do not require every refactor to run all recipes or create a notes file.

## Compare discovered test names

Bun's JUnit reporter exposes `<testcase name=...>` values. For a move or split
that retains test names, compare their multiset over the corresponding affected
files before and after. This detects discovery loss; equal names do not prove
that assertions, fixtures, or behavior stayed intact. Read the assertion diff
and map any deleted assertions to retained coverage separately.

```bash
bun test --reporter=junit --reporter-outfile=/tmp/before.xml --timeout 180000 <baseline-files>
grep -o '<testcase name="[^"]*"' /tmp/before.xml | sort > /tmp/before.names
```

Capture the candidate over its corresponding files into `/tmp/after.xml`, then
extract `/tmp/after.names` with the same command:

```bash
diff /tmp/before.names /tmp/after.names
wc -l /tmp/before.names /tmp/after.names
```

`sort` without `-u` preserves multiplicity: duplicate display names can be
legitimate, and deduplicating them would hide a lost occurrence. Account for
renamed or parameterized cases when interpreting a delta. PR #420 used this
method to check discovery while splitting `tests/helper-scripts.test.ts`.

## Check an isolation boundary

When a change affects process-global fixtures or cross-file dependencies, the
existing runner can compare isolated files with a shared Bun process:

```bash
BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=4 BUN_TEST_FILES="<files>" \
  bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests' > /tmp/iso.log 2>&1
bun test --timeout 180000 <files> > /tmp/shared.log 2>&1
```

CI uses the isolated shape (`.github/workflows/ci.yml:92-95`). A difference
between these runs is a diagnostic lead: investigate shared state, ordering,
or contention before assigning a cause. Select this comparison when that
boundary is relevant; do not add two runs solely to fill an evidence template.

## Measure a performance claim

For a claimed speed improvement, paired runs of the affected files on the same
machine can compare duration with matching runtime, flags, and fixture inputs.
The completed CI log recipe in `references/running.md` provides another view
when hosted cost is the question. These are measurement options, not a
requirement to rerun CI or collect both sources for every refactor.

Separate fixture construction, subprocess time, and intentional waiting when
attributing a measured change. Deduplicating wrapper source alone demonstrates
a maintenance change, not a runtime reduction.

## Record the evidence selected for the task

Use the existing task artifact selected by policy. Link execution results with
their subject and environment, explain discovery or assertion changes, and
include measured durations when making a speed claim. Artifact admission and
completion remain owned by the canonical policy and contract.
