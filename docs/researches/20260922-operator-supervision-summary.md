# Repository automation supervision homepage

AKN-05a consumes the AKN-04d2 repository observation from the production browser. `AutomationSummary.tsx` owns the abortable read and original-record presentation; `App.tsx` supplies the selected repository and explicit refresh generation. The existing `repository-snapshot.ts` decoder validates the complete protocol2 envelope and exact repository identity before React sees evidence.

## Observation and authority

Policy, stored grants, budget projections, controller heads and Campaign group decisions retain their own source status and observation time. Each run/group retains its own operation, decision, timestamp and evidence digests. The UI does not choose a synthetic global latest decision or translate the native controller `operator` owner into `user`. Grant expiry/scope are stored facts, not current authorization. Budget metric values are displayed without recomputation; stale projections are explicitly labelled.

Native execution remains unavailable because the source has no native admission authority or turn reference. A controller record containing `executing` or `dispatch_started` cannot remove that warning. Missing and unavailable sources are distinct, and no failed source becomes an empty success.

## Request lifetime

Repository selection and explicit refresh supersede the current AbortController. Completion is accepted only when the request has not been aborted, even if an injected/native transport ignores cancellation. Render-time scope comparison hides old-repository evidence before the replacement effect runs. Same-repository previous evidence remains available during loading/failure with an explicit historical warning. A generation regression within the same service epoch is rejected; a new service epoch may begin at generation1. Decode failures and network failures render a portable error without exposing private diagnostics.

The summary consumes original automation only. Existing Fleet still owns the existing task worklist and Composer fence until AKN-05b performs the navigation/context cutover. There is no second Task authority, new write, local store, periodic polling or runtime installation. The component never writes draft storage, constructs a Task message, changes Claim fences or clears ACK state.

## Scope and remaining work

This is the first AKN-05 UI slice, not full AKN-05 acceptance. The next bounded slice replaces worklist navigation with Planning / Delivery / Organization-Attention and integrates scoped task context/activity, while testing draft/IME/ACK behaviour and healthy-target write admission together. AKN-06 owns automatic refresh and freshness policy. Native autonomy still requires the separate H0 gate and real Host canary.

## Verification

Existing homepage and interaction suites cover original evidence, bilingual copy, independent missing/unavailable sources, old budget projections, repository-switch cancellation, late completion, superseding refresh, same-epoch regression, new-epoch reset and private-error redaction. Existing collaboration, TaskDiff and message/draft/focus tests are retained. The one initial test failure selected the first generic alert after the new independent alert was added; its assertion now searches alert content for the original malformed-Fleet error, preserving the same oracle.

A GET-only built fixture server on 127.0.0.1:43925 supplied the existing production bundle. Browser inspection covered English/Chinese and 1280px/390px viewports, original controller/budget records and expanded evidence. Page width equalled viewport width at both sizes; narrow summary controls measured 45px or 66px. No real Task write route was enabled. This is local UI evidence, not an installed runtime or native execution canary.

Final targeted verification: 125 tests passed, 0 failed, 700 assertions across the four owning UI suites. Typecheck, production browser build and all nine root integrity commands passed. Architecture proof and semantic acceptance remain separate gates.
