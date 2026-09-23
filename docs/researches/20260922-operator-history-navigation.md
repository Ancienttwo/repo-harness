# Operator historical Task navigation

AKN-06e connects the bounded AKN-06d history reader to the existing context HTTP route and browser Task selection. This is a candidate implementation; architecture proof and semantic acceptance remain outstanding.

## Ownership and request path

The URL is navigation preference, not write authorization. `repository` plus the persisted schema2 `task` ID selects a current card when present. Explicit `view=history` selects historical evidence and may bind `task_revision`. Unknown or duplicate keys, arbitrary paths and Git refs are rejected. Startup and `popstate` restore the exact scope; removing a repository does not silently switch the selected identity to another repository.

The existing `/api/v1/fleet/tasks/:repository/:task/context?view=history` route applies the same Host, Origin, method and request validation as current context. A separate typed worker invokes `readOperatorTaskHistory`; the existing bounded Task reader pool owns deadline, cancellation and slot retirement. It adds no writer or route authority. Source identity is selected only by the registered repository and server-owned target commit, under the first-parent, byte and blob limits documented in `20260922-operator-task-history.md`.

Current cards retain DetailPane and its existing revision/draft guards. If a selected card disappears, its exact ID and observed revision remain selected and only historical evidence is shown. Explicit history also stays read-only when a current card exists. The historical region displays original goal, acceptance, recorded status, observation time, coverage and exact source commit/path/hash. It never constructs a current card, Composer, Claim, TaskDiff or readiness result. Refresh uses the existing completion-based observation hook, abort and generation fences. The heading receives focus; Escape closes the region without interrupting IME composition.

## Browser boundary

The canonical server projection owns revision derivation. The shared response decoder validates structure, exact repository/Task identity and an explicitly requested revision. It does not derive semantic identity in the browser. Production browser testing exposed a Node `crypto.createHash` dependency through the initial decoder revision recomputation: valid HTTP history was incorrectly displayed as unavailable. Removing that duplicate derivation made the same production page display its canonical source. Server-side canonical identity derivation remains unchanged.

## Observed verification

The production browser fixture used a disposable Git repository with a schema2 Sprint committed and then removed. Its archived exact-ID URL displayed “Archived navigation proof”, recorded status `[x]`, acceptance “Read original source”, and source commit `1ecd5be58e40de89a92654cd136f24c730a02994` from `plans/sprints/original.sprint.md` at target commit `31f44ceec90c768400f6fbefb4318f447c49cf46`. Clicking a current card changed the URL to repository plus Task ID and opened current Task details. Back restored the explicit history URL and historical heading, with zero Composer buttons. The temporary tab and server were closed after verification.

Real HTTP tests separately exercise the actual history worker, source coordinates, no-write comparison, invalid selectors, Host/Origin/method guards and shared-pool retirement. DOM tests cover missing and explicit historic tasks, removed repositories, late responses, draft preservation, invalid links and current detail behavior. The contract names the five existing test suites, typecheck, production build and nine repository integrity checks; candidate results live in the matching review artifact.

This fixture is not installed-package or native execution proof. H0 runtime admission, actual steer adoption, installed journey and remaining OB-06 evidence invalidation still require their own acceptance. At higher load the finite shared reader pool and existing history budgets refuse excess work; no unbounded history scan is introduced.
