# Known gaps

This file holds review data. It is not a fleet role.

The gatekeeper and any code review read this file before review. Find the row for the PR's producer. Run its named checks in addition to the review that the diff's tier selects.

A row adds checks. It never raises or lowers the review tier. A finding from a named check is a normal finding under the current tier. A clean named check does not make a PASS. A row never blocks a merge by itself.

## Producer

The producer is the model or harness in the `Agent:` line of the issue claim for the PR's branch. That claim is the only producer authority. Do not use the commit author, the GitHub account, the PR author, the reviewer or the session record.

Use the model when the claim names it. Otherwise use the harness kind, for example `DeepSeek Harness`, `Claude Code`, `Codex` or `Pi`. Do not make a row for a session id or a writer id. When the claim names no producer, the producer is unknown: run no row checks and add no finding.

## Table

| Producer | Named review check | Evidence (PR/SHA, date) | Last seen | Better since |
| --- | --- | --- | --- | --- |
| DeepSeek Harness | 1. Trace each GitHub write path to the one registry grant resolver. Require an explicit `read_write` row; `allowedRoots` alone is not a grant.<br>2. For a failed or rerun required check, keep every failed child of a summary job. Revalidate a rerun only with test-level evidence that executed the original failed test ids. | #1240 (2026-10-31): `review_publish` accepted `allowedRoots` as write authority (P1).<br>#1255 (2026-10-31): the evidence did not keep a summary job's failed children and accepted job scope as revalidation. | 2026-10-31 | #1252 (2026-10-31), #1271 (2026-10-31) |

## Row rules

- A row needs at least two PRs or SHAs with dates. One PR is not a row.
- Each named check is observable: a command, a grep, a file read or a trace. "Be careful" is not a check.
- `Last seen` is the date of the newest evidence that the gap occurred. A row with no new evidence for 30 days is removed. The Lessons Retro removes it.
- `Better since` is optional. It lists PRs or SHAs where the gap did not recur, or a fix removed it. It does not move `Last seen`.
- The Lessons Retro adds evidence from an entry whose `Missed by` is `independent-review` and whose producer is known. The Lessons Retro section of the development flow owns that feed.
- Models stay advisory. The table never requires a model or a second model family. A repository with one model family keeps the rows for that family. An unavailable model's row adds no executable check and blocks nothing.
- This table is per repository. A downstream repository keeps its own rows. This repository's rows are not policy for another repository.
