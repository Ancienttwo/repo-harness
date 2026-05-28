# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:

## Entries
- Date: 2026-05-28
- Triggered by correction: after structured plan capture was fixed, plain “开发新功能” prompts still only emitted BDD guidance and did not create a file-backed plan
- Mistake pattern: treating new-feature prose as advisory-only because it lacked `$think` or an approved-plan body
- Prevention rule: ordinary feature-building prompts should create Draft `plans/` artifacts, but must not project `tasks/todo.md` until a concrete plan is approved
- Where to apply next time: `prompt-guard.sh` plan-start classifiers and hook runtime tests

- Date: 2026-05-27
- Triggered by correction: structured prompt capture appeared to keep using old hook behavior during feature-development prompts
- Mistake pattern: setting `HOOK_REPO_ROOT` without making it the process cwd, then relying on repo-relative helper paths inside hook scripts
- Prevention rule: shared hook dispatchers must `cd` into the resolved repo root before executing hook implementations; tests should invoke dispatch from a different cwd
- Where to apply next time: `.ai/hooks/run-hook.sh`, generated hook assets, and any adapter that calls repo-local helper scripts by relative path

- Date: 2026-05-27
- Triggered by correction: a generated plan pasted as pure Markdown should be executable without a magic `PLEASE IMPLEMENT THIS PLAN:` prefix, while a question about whether it triggers must stay read-only
- Mistake pattern: treating only command-prefixed plans as approved-plan capture candidates and ignoring the plan-shaped Markdown contract users already paste between tools
- Prevention rule: distinguish pure plan-shaped Markdown from meta trigger questions by first nonblank line and section structure; capture the former, never execute the latter
- Where to apply next time: `prompt-guard.sh` intent classifiers and hook runtime tests

- Date: 2026-05-27
- Triggered by correction: an older Draft plan was treated as a global implementation lock even though independent tasks should route through new plans or contract worktrees
- Mistake pattern: using `get_active_plan` fallback-to-latest as ownership truth for every new planning prompt
- Prevention rule: explicit planning prompts must be able to create an independent `plans/plan-*.md`; approval prompts with a full plan body should capture/project that exact body instead of relying on stale active-plan inference
- Where to apply next time: `prompt-guard.sh`, `ensure-task-workflow.sh`, and approval/capture tests

- Date: 2026-05-27
- Triggered by correction: `$think`/plan-start hook did not create a Draft plan when the hook prompt also contained expanded skill instructions with `fix`, `bug`, or `error` wording
- Mistake pattern: running semantic intent greps over the entire host prompt, including injected skill/context blocks, instead of the user's original request text
- Prevention rule: hook intent classifiers must strip injected context blocks before matching plan, implementation, done, or Waza route intent
- Where to apply next time: `prompt-guard.sh`, generated hook assets, and any future host adapter that receives expanded tool/skill context

- Date: 2026-04-19
- Triggered by correction: repo-local hook defaults had drifted back toward generating `.claude/hooks` shims even though the adapter already dispatches directly into `.ai/hooks/run-hook.sh`
- Mistake pattern: preserving a second repo-local hook path after the authoritative hook layer is already clear
- Prevention rule: for repo-local scaffolding, keep `.ai/hooks/` as the only generated hook implementation layer and reserve `.claude/*` for adapter config plus explicit user-owned overrides only
- Where to apply next time: project bootstrap, migration scripts, hook docs, parity tests, and any cleanup that claims to remove compatibility debt

- Date: 2026-04-08
- Triggered by correction: workflow helper inventories and required-path checks had started drifting across multiple shell scripts
- Mistake pattern: repeating contract-critical lists in more than one place
- Prevention rule: promote helper/file/dir inventories into `assets/workflow-contract.v1.json`, then make scripts and tests consume that contract
- Where to apply next time: any new repo-local workflow artifact, helper script, or migration rule

- Date: 2026-04-08
- Triggered by correction: inspection and migration logic missed initialized repos with bundled Skill Factory assets and partial repos with an old `tasks/todo.md`
- Mistake pattern: classifying repo mode from optional feature presence instead of the primary workflow surface, and only testing clean-slate migrations
- Prevention rule: make repo-state routing prefer core workflow surfaces over optional sidecars, and keep fixture coverage for partially migrated repos with legacy content already in canonical paths
- Where to apply next time: any new repo classifier, migration path, or self-hosted routing script
