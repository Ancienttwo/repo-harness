---
name: obsidian-memory
description: |
  Cross-project long-term memory over an Obsidian brain vault: recall relevant
  notes before a task, and persist distilled conclusions (decisions, pitfalls, solutions,
  progress) back after a task. The vault is an optional aggregation/projection layer —
  repo-local artifacts stay the per-project source of truth, and sync direction is
  repo → brain. Explicitly invoked by the model or operator; never executed from hooks.
  Use when the user asks to recall project memory, persist lessons to Obsidian, initialize
  a project sub-vault, or when closing a significant task whose conclusions are worth keeping.
  Triggers: 检索记忆, 查一下知识库, 沉淀经验, 记到 Obsidian, 更新知识库, 复盘沉淀,
  初始化记忆库, recall project memory, persist lessons, update the brain vault,
  knowledge base brain. Do not use for repo-runtime contracts (tasks/, docs/ stay
  authoritative in-repo), raw conversation archiving, or storing secrets.
---

# obsidian-memory — cross-project long-term memory (Obsidian brain vault)

## Outcome Contract

- Outcome: recall relevant background from the vault before a task; after the task, persist the conclusions that will still be useful later into the matching project sub-vault, and keep the index current.
- Done when: the recalled notes have been folded into the current context as leads (after re-verification against current state), or the added/updated notes are on disk and the sub-vault `index.md` is in sync.
- Authority model (inviolable): the in-repo artifacts (`tasks/`, `docs/`, `MEMORY.md`, the code) are each project's source of truth; the vault is only a cross-project aggregation/projection layer, and the direction is always **repo → brain**. When the vault conflicts with current state, current state wins, and the vault gets corrected on the spot.
- Two readers: the vault is read by agents **and by the user**. A note must be prose a person can read and learn from directly — complete sentences that state the why and the tradeoff, not agent shorthand and not piles of raw logs; `index.md` is the human reading entrypoint.
- Boundary: this skill may only be invoked explicitly by the model or the user. Hooks never execute it — the hook layer may at most emit a `[BrainPromote]`-style advisory string, and never reads or writes vault state.

## Vault resolution (fail-closed, and the vault itself is optional)

1. Read `brainRoot` from `~/.repo-harness/config.json`.
2. Not configured, or the path does not exist → **stop and say so**. Do not scan the disk to guess a vault, and do not create a vault root on the fly.
3. The project sub-vault is `<brainRoot>/<project-slug>/`; `<project-slug>` is the repo directory name or a name the user gives.

**Having no brainRoot configured is a legitimate steady state, not a defect awaiting repair.** Unconfigured simply means this machine does not use the vault layer: the in-repo artifacts remain a complete, authoritative memory surface, and at closeout the conclusions go into the existing slots such as `tasks/lessons.md` and `docs/researches/`. Do not create a vault just so this skill can run. Only when the user explicitly wants the vault layer enabled, point them at `repo-harness install --brain-root <path>` or `repo-harness update --brain-root <path>`.

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

## Division of labor with the existing memory layers

| Layer | Ownership | What it holds |
|-------|-----------|---------------|
| repo `tasks/lessons.md`, `docs/researches/`, `MEMORY.md` | per-project source of truth | rules and knowledge actionable inside the project |
| host auto-memory (Claude Code project memory, Codex chronicle, etc.) | session-level runtime cache | the current turn's context; **must not be cited as fact** — promote anything with lasting value to an authority layer first |
| user-level cross-project preference files | source of truth for cross-project preferences | user habits, cross-project pitfalls, tooling preferences |
| Obsidian vault (this skill) | optional cross-project aggregation projection | distilled decisions/patterns/pitfalls/progress, reusable by humans and by several runtimes |

A given fact is written out in full in exactly one authority layer; every other layer carries a pointer.

## Gotchas

| Situation | Rule |
|-----------|------|
| Wanting to trigger this automatically from a hook | Forbidden; a hook only emits advisory text, and persistence happens when the model invokes this skill explicitly during closeout |
| brainRoot not configured | Legitimate steady state; report and stop — do not guess a path and do not create a vault on the user's behalf |
| Memory contradicts current state | Current state wins; correct or delete the stale note |
| Wanting to write something every single task | Persist only what clears the gates; when there is nothing, say plainly that this round has nothing to persist |
| Wanting to archive a long conversation or code block verbatim | Do not store the original text; store the conclusion plus a link back to the repo |
| Wanting to paste in an acceptance report | CI runs, commits, PRs, and release state get pointers only |
| Configuration knowledge containing sensitive values | Rewrite with `<PLACEHOLDER>` before storing |
| A claim that something "is already wired up" | Grep the target file to verify on the spot; wiring that exists only in a document is not wiring |

## Provenance

- 2026-08-16: landed from the user's "Obsidian as a cross-project AI knowledge-base brain" proposal; review rejected the hook implementation route in favor of a skill plus explicit closeout, aligning with the existing repo-harness `brain-manifest.json` invariant that hooks neither read nor write external vault state.
- 2026-08-18 revision: added the exclusion-first write gate and the manifest directory-ownership boundary, and made the vault layer explicitly optional — with no brainRoot configured the in-repo artifacts stand on their own, and "no vault" is no longer treated as a state awaiting repair.
- Dual-host install: `~/.claude/skills/obsidian-memory/` and `~/.codex/skills/obsidian-memory/` hold identical content, verified with `cmp`.
