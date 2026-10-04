# Vault execution

Worker reference. Execute only the Bot-assigned recall or write scope.

## Vault resolution (fail-closed, and the vault itself is optional)

1. Use an explicit `REPO_HARNESS_BRAIN_ROOT` override when set. Otherwise read `brainRoot` from `~/.repo-harness/config.json`.
2. Not configured, or the path does not exist → **stop and say so**. Do not scan the disk to guess a vault, and do not create a vault root on the fly.
3. The project sub-vault is `<brainRoot>/<project-slug>/`; `<project-slug>` is the repo directory name or a name the user gives.

**Having no brainRoot configured is a legitimate steady state, not a defect awaiting repair.** Unconfigured simply means this machine does not use the vault layer: the in-repo artifacts remain a complete, authoritative memory surface, and at closeout the conclusions go into the existing slots such as `tasks/lessons.md` and `docs/researches/`. Do not create a vault just so this skill can run. Only when the user explicitly wants the vault layer enabled, point them at `repo-harness install --brain-root <path>` or `repo-harness update --brain-root <path>`.

The brain CLI does not enforce this skill boundary. `configuredBrainRoot()` uses
`REPO_HARNESS_BRAIN_ROOT`, then user config, then `defaultBrainRootChoice()`.
The default is iCloud `brain` when iCloud is available, otherwise `~/Documents/brain`.
`brain sync` and other write paths can create directories. Do not call them to
guess or create a missing vault for this skill.

## Phase init · create the project sub-vault

Run this only when the sub-vault does not exist or the user explicitly asks:

1. Create `<brainRoot>/<project-slug>/` containing `index.md` plus, as needed, `decisions/`, `patterns/`, `notes/`, `references/`, `runbooks/` (align with the vault's existing categories; do not invent a new taxonomy).
2. `index.md` records a one-line project background, long-lived preferences, a pointer to current progress, and links to each subdirectory; wiki-link it into the vault root `index.md`.
3. **Hard dependency on the official Obsidian skills**: any action that creates or modifies a `.md` file inside the vault must also invoke the official `obsidian-markdown` skill (the authority for frontmatter, wiki-links, callouts, and other formatting); use the official `obsidian-cli` skill for search, open, and task operations against a running vault. This skill only owns judgment and indexing (what to write, when to write it, how to organize it); it does not define a Markdown dialect of its own. If either official skill is missing, report fail-closed instead of degrading to hand-written formatting.

## Phase recall · before the task

1. Read the sub-vault `index.md` first, then `rg` that sub-vault by task keywords (widening to adjacent domains when necessary), and read the full text of at most the 3 most relevant notes.
2. Treat everything recalled as a **lead to re-verify**, never as fact: memory touching files, commands, or versions must be checked against current state before it is used.
3. Sub-vault does not exist → report that there is no memory to recall and ask whether to init; do not skip silently and do not fabricate background.

## Phase persist · after the task

1. Extract candidates: key decisions and their reasons, pitfalls with root cause and fix, reusable approaches and patterns, rejected approaches and why they were rejected, progress milestones.
2. **Exclusion-first write gate (apply this one first)** — any fact already recorded authoritatively by git, a package registry, a code-hosting platform, CI, or any re-runnable command gets only a pointer in the vault, never a restatement. That explicitly excludes: commit SHAs, PR/issue numbers, merge commits, CI run ids, tags, release URLs, sync states such as `main == origin/main == <sha>`, whether a worktree is clean, test pass counts, and the snapshot output of a given command run. These start rotting the moment they are written down, and they already have an authoritative source.
3. **Value gate** — after passing the exclusion rule, an entry must also satisfy all of: it will be used again (either for agent reuse or for the user's own learning is enough); it is not a restatement of something a repo artifact already records (for those, write one wiki-link back to the repo path instead of copying the text); and it is not one-off or transient information.
4. **Sensitivity gate** — scan the content before writing to disk: passwords, API keys, tokens, private keys, and real env values never land in the vault; on a hit, rewrite as a placeholder or drop the entry.
5. **Be wary of absolute paths** — a machine rename, a home-directory move, or a different checkout location silently invalidates a hard-coded path. Whenever a repo-relative path works, or the tool can resolve the root itself, do not write an absolute path.
6. Write into the matching subdirectory and update the sub-vault `index.md`; when a note on the same topic already exists, update that file rather than opening a duplicate page, and correct outdated conclusions directly.

## Directory ownership boundary

Inside a repo-harness-managed repository, the `brain_path` declared in `.ai/harness/brain-manifest.json` is a **machine projection** of `repo-harness brain sync`; hand-written content there is overwritten by the next sync. This skill never writes a path the manifest declares; memory notes land in subdirectories the manifest does not own, such as `notes/` and `decisions/`. Externalizing documents like `docs/reference-configs/` goes through the existing `brain promote`/`sync` channel; this skill does not duplicate that transport.
