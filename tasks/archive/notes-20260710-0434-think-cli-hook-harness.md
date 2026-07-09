> **Archived**: 2026-07-10 04:34
> **Related Plan**: plans/archive/plan-20260710-0230-think-cli-hook-harness.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260710-0434

# Implementation Notes: think-cli-hook-harness

> **Status**: Complete
> **Plan**: plans/plan-20260710-0230-think-cli-hook-harness.md
> **Contract**: tasks/contracts/20260710-0230-think-cli-hook-harness.contract.md
> **Review**: tasks/reviews/20260710-0230-think-cli-hook-harness.review.md
> **Last Updated**: 2026-07-10 04:00
> **Lifecycle**: notes

## Design Decisions

- Keep `process.execPath` as the authoritative Bun executable; change only its cwd from `os.tmpdir()` to the package root derived from `import.meta.url`.
- Treat Codex `0.144.0` as the minimum for these generated GPT-5.6 profiles. This is based on a same-machine A/B: PATH Codex `0.143.0` returns a server error requiring a newer Codex, while `~/.local/bin/codex` `0.144.0` completes Sol and Terra probes. Doctor reports the PATH authority and does not select or install an alternate binary.
- Keep the new host readiness signal target-aware at the aggregated setup layer: raw `doctor` remains host-neutral inventory, while `setup check --target claude` omits `codex-cli-version` so a Codex-only prerequisite cannot put a Claude-only audit into `attention`.
- Per user direction, remove the obsolete Homebrew `0.143.0` installation instead of preserving a multi-version fallback. The existing standalone `0.144.0` is the sole target; no PATH shim or compatibility selector is added.
- Treat the Codex executable embedded in the signed ChatGPT app as app-owned runtime, not a second independently managed CLI. It remains untouched; a clean login shell resolves only `~/.local/bin/codex` `0.144.0`.
- Keep prompt intent local and deterministic. The new signal is the explicit phrase `直接修改`, not generic `修改`, so consultation/refinement prompts retain current behavior.
- Treat the GPT-5.6 migration as tier-aware: Sol + `xhigh` for judgment roles, Terra + the prior `medium` effort for the fast execution role.
- Do not transplant Responses API request fields into Codex agent TOML or hook scripts. Codex 0.144 accepts the model IDs but its config reference exposes effort only through `xhigh`.

## Deviations From Plan Or Spec

- `brew uninstall --cask codex` auto-removed the pre-existing Homebrew `ripgrep` formula. It was immediately restored at the same `15.1.0` version so the Codex cleanup did not remove an unrelated user tool.
- The contract's concrete host probes are recorded under the review's `Manual checks`; its machine-verifiable `manual_checks` list uses the verifier-supported `Evaluator review file recommends pass` gate. This preserves every acceptance observation without declaring unsupported prose checks as executable criteria.

## Tradeoffs Considered

| Option | Decision | Reason |
|---|---|---|
| Restore `npm view` | Rejected | The current runtime is Bun-owned and the absolute Bun executable is already the authority boundary. |
| Create a temporary package manifest | Rejected | A read-only diagnostic should not write temp package state when the installed package root already exists. |
| Use a GPT-5.6 call for hook intent | Rejected | Adds network/auth/latency and makes a deterministic enforcement path unavailable offline. |
| Keep Terra `high` | Rejected | No representative eval justified raising the prior GPT-5.5 `medium` effort; official migration guidance says preserve the baseline first. |
| Keep both Codex installations | Rejected | The old PATH-preferred Homebrew copy makes GPT-5.6 profiles fail and creates authority ambiguity. |

## Open Questions

- None.

## Evidence Links

- Official GPT-5.6 guidance: `https://developers.openai.com/api/docs/guides/latest-model.md`
- Official Codex custom agents: `https://developers.openai.com/codex/subagents#custom-agents`
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Out of scope / Future work

- Machine-wide skills/plugins triggered Codex's 2% skill-description budget warning during the live model probes. That user-level inventory is not owned by this contract.
- Broader prompt compression needs representative workflow evals before removing durable instructions.
- The bounded deterministic `直接修改` classifier still cannot exhaust every natural-language negation without turning into an unbounded language parser. External acceptance left one P2 advisory for variants such as `直接修改这样做不太合适吧` and `直接修改 README 是错误的`; the covered imperative, question, quoted-payload, contraction, and explicit-negation cases remain pinned by tests.

## Claude Plan Comparison

- Adopted its sandboxed smoke-matrix idea. The CLI status/security/migrate/adopt paths, actual Fable fleet generation, tarball install, prompt guard, and UserPromptSubmit/SessionStart/Stop routes were exercised outside the tracked worktree.
- Adopted the Codex half of the host-version check after live evidence established a concrete floor: PATH Codex `0.143.0` rejects Sol/Terra; the installed standalone Codex `0.144.0` accepts both. The Claude half remains deferred because no repo capability currently needs a new minimum and the proposal supplied no authoritative threshold.
- Deferred Claude `SubagentStart`/`SubagentStop`. Official Claude docs confirm both events and their protocols, but the repo currently treats those routes as Codex-only in registry, installer self-healing tests, runtime stdout handling, and research docs. That is an architecture change, not a small template flip.
- Rejected “missing `features.hooks` should warn.” Official Codex config docs state `features.hooks` is stable and defaults to `true`; only an explicit false value would be actionable, and current adapter/trust/readiness checks already cover the active path.
- Deferred `statusMessage`. The typed installer owns generated adapters, so editing only `codex.hooks.template.json` would not update the live installation path.

## Smoke Evidence

- `doctor --json`: exit 1 only because the linked worktree has no user-created CodeGraph index; `cli-update` itself is `ok` with `current=0.9.1; latest=0.9.1`.
- `status --json`, `security scan --json --strict`, `migrate --json`, scratch `adopt --dry-run --json`, scratch `install-agent-fleet.sh`, and tarball install: exit 0.
- Scratch fleet output: deep-reasoner/gatekeeper `gpt-5.6-sol` + `xhigh`; fast-worker `gpt-5.6-terra` + `medium`.
- Scratch prompt guard normal/unavailable paths and `UserPromptSubmit`, `SessionStart`, `Stop` dispatcher routes: exit 0.
- Claude-plan update-check command without `--check-updates`: exit 1 with update checks disabled and unrelated readiness blockers; the corrected explicit-flag form is the authoritative follow-up probe.
- Corrected `update --check --check-updates` reaches `doctor.cli-update=ok`; the command still exits 1 for the linked worktree's intentionally absent CodeGraph index and unrelated user-level readiness actions.
- PATH Codex `0.143.0` rejects `gpt-5.6-sol`, `gpt-5.6-terra`, and the family alias; explicit standalone Codex `0.144.0` completes both concrete model probes. The alias is not used because it is unsupported with this ChatGPT-account path.
- Homebrew Codex `0.143.0` is uninstalled. A clean login shell now reports only `/Users/kito/.local/bin/codex` at `0.144.0`; the current Codex desktop process still exposes its signed app-bundled `0.144.0-alpha.4` runtime at the end of its inherited PATH, but that binary is neither modified nor an independent installation authority.
- Homebrew `ripgrep` `15.1.0` was restored after cask cleanup auto-removed it; a clean login shell resolves `/opt/homebrew/bin/rg`.
- Focused doctor/init-hook/prompt/fleet suite: 75 pass, 0 fail. Final prompt classifier and decision-engine regression suite: 19 pass, 0 fail, 159 assertions.
- Full suite on the final static snapshot: 1108 pass, 1 platform skip, 0 fail, 11392 assertions across 97 files (`518.38s`, exit 0).
- Required gates passed: typecheck, hook projection, deploy SQL order, architecture advisory (`blocking=0`), task sync, project-state inspection, migration dry-run, tarball install smoke, and strict workflow validation.
- Hook diet remains 11/11 dispatches; the final phase probes max at 24.38 ms (`state-snapshot`) and 32.30 ms (`prompt-guard-decision`) against the 250 ms budget.
- Waza `$check` specialist passes found two P2s before closeout: trailing negation/question text bypassed the new imperative classifier, and the Codex-only version warning leaked into Claude-only setup checks. Both were fixed and regression-tested. Claude external acceptance then found apostrophe-pair stripping and additional question variants; those concrete cases were fixed, while one broader natural-language-negation advisory remains documented rather than growing an unbounded synonym parser.

## Minimal Change Accounting

- New dependencies: none.
- New workflow files: only the contract, review, and notes required by the approved work-package lifecycle.
- New code abstractions: no extension point or wrapper; the doctor adds one existing-style check, and the prompt classifier adds one bounded helper for the new imperative.
- Removed host surface: the incompatible Homebrew Codex `0.143.0`; no fallback selector or compatibility layer was added.

## Promotion Candidates

- None; the decisions are task-local and reversible.
