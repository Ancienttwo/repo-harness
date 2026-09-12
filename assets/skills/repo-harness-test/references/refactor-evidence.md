# Evidence a test refactor owes

Moving, splitting, merging, or deleting tests changes the oracle. Policy
requires mapping a deleted test's assertions to retained coverage and reporting
discovery and preservation
(`docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards`).
These three artifacts are what that looks like in this repository, and they are
fixed sections in the task's `tasks/notes/<plan-stem>.notes.md`.

## 1. Test-name multiset, before and after

Bun's JUnit reporter names every case, so a refactor that preserves behavior
preserves the multiset of `<testcase name=...>` values over the affected set.

Capture the baseline on the unmodified tree, the candidate after the change,
over the same file set:

```bash
bun test --reporter=junit --reporter-outfile=/tmp/before.xml --timeout 180000 <files>
grep -o '<testcase name="[^"]*"' /tmp/before.xml | sort > /tmp/before.names
```

Repeat into `/tmp/after.{xml,names}` and diff:

```bash
diff /tmp/before.names /tmp/after.names && echo "identical name multiset"
wc -l /tmp/before.names /tmp/after.names
```

Use `sort` without `-u`: a duplicate name is itself a finding. Record the case
and file counts in the notes. PR #420 is the worked example: splitting a
7257-line file into twenty-two script-owned files, with 155 relocated cases, is
recorded as "470 cases across 42 files with an identical set of test names".

A name that must change (a renamed boundary, a parameterized input) is listed
explicitly in the notes with its before/after pair. An unexplained delta means
a case was lost.

## 2. Isolation cross-check

Run the affected set twice: once with every file in its own process, once with
the whole set in a single process.

```bash
BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=4 BUN_TEST_FILES="<files>" \
  bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests' > /tmp/iso.log 2>&1
bun test --timeout 180000 <files> > /tmp/shared.log 2>&1
```

Both must pass. Isolated-only success means the refactor introduced shared
process state; shared-only success means a case depends on another file having
run first. CI runs the isolated shape
(`.github/workflows/ci.yml:92-95`), so isolated failure is the blocking one,
but record both.

## 3. Before/after duration table

A refactor justified by speed states measured numbers, not a claim. Two
sources, both recorded in the notes:

- Local paired measurement: the same files, same machine, same `--timeout`,
  before and after, one line per file.
- CI per-file durations extracted from a completed run on each side, using the
  `gh run view --log` recipe in `references/running.md`.

Separate fixture construction, subprocess time, and intentional waiting when
attributing the change. Deduplicating wrapper source is a maintenance
improvement; fewer actual spawns, copies, or installs is a separate claim that
needs its own measurement.

## What goes in the notes

One section per artifact above, in that order: the name-multiset diff result
with case/file counts and any explained renames; the two isolation runs with
their outcomes; the duration table with its two sources. A refactor reported
without all three is incomplete, whatever the suite says.
