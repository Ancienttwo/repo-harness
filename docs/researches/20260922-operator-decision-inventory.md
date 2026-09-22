# Formal Human Decision inventory in the operator board

The homepage reads canonical open Decision requests through collaboration protocol 3. The existing GET accepts an optional `decision_after` storage-key cursor; the envelope echoes it, and its Decision source has an independent observed/unavailable status. Source and browser cut over together. Organization and Work Exchange remain usable when Decision records cannot be read.

## Authority and consistency

`readOpenDecisionInventory` in `src/effects/engineers/verified-context-store.ts` enumerates the existing Git-common-directory Decision store. It validates canonical current, request and event records, including UUID storage keys, digests, state, predecessor and answer linkage. Closed records are checked before filtering. There is no store creation, lock, transition, Binding mutation, provider invocation or acknowledgment. An absent store is an observed empty inventory; corrupt, unsafe or concurrently changed records refuse the source.

Enumeration is capped at 20,000 directory keys. Each page scans at most 200 records, returns 50 open requests by default (maximum 100 internally), reads at most 8 MiB, limits individual files to 128 KiB, and has a two-second deadline. Output, scan and byte limits can return explicit partial coverage after progress. The cursor is the last fully validated key; each next page replaces the previous one. Deadline/no-progress failures and excessive directory counts are unavailable. Final current rereads have reserved byte capacity, and the directory inventory is reread before returning. These are bounded concurrent-writer consistency checks, not a claim of filesystem-wide atomicity against a hostile writer.

`src/core/operator/decision-inventory.ts` is a browser-safe transport projection and decoder. Canonical digest validation remains in the store. The browser receives original question text, Decision references and recorded Task/Binding fences, without filesystem paths or provider coordinates. A recorded fence does not assert present execution eligibility.

## Browser lifetime

The server single-flight identity includes repository and cursor under its existing shared worker budget. Both worker and HTTP response paths bind the echoed query. Unknown, malformed and duplicate selectors fail before reading. The browser binds decoded responses, aborts superseded reads, resets pagination on repository change and refresh, and preserves pagination across Task detail selection. Questions render as text. Partial pages never become a repository-wide pending count. No browser approval action is introduced.

## Verification and delivery boundary

Existing store tests cover open/answered/cancelled fixtures, pagination, closed-record validation, missing store without writes, malformed/misfiled/unsafe records, concurrent answer/directory changes, and scan/byte/deadline limits. Existing transport/UI/HTTP suites cover strict wire identity, source isolation, query coalescing, late pages, page replacement, refresh, Task selection and plain-text rendering.

A read-only production-bundle fixture was inspected at 1280×900 English and 390×844 Chinese. Wide and narrow page widths matched the viewport; question HTML remained text with no image element; source disclosure and paging controls measured 44 px high. Next page replaced the original question and refresh returned to the first page. Repository switching immediately cleared the previous question. The fixture returned 405 for non-GET methods and wrote no real Decision records.

Final local verification passed307 tests with1702 assertions, typecheck, browser build and all nine required integrity checks. Local evidence is recorded in `.ai/harness/runs/akn05-decisions/`. Current CodeGraph proof, canonical verification, one independent semantic acceptance and the stage PR remain pending. This slice does not establish Planning graph completion, browser answer transitions, native execution admission, installation or main merge.
