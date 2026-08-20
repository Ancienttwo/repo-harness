> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# README Bilingual Workflow Notes

- Updated `README.md` so the GitHub landing page now explains the product boundary, the three-layer operating model, and the full repo-harness workflow before install instructions.
- Added `README.zh-CN.md` as the GitHub Chinese entrypoint with the same product mechanics, complete workflow diagram, install path, hook authority map, and maintainer verification surface.
- Corrected the Mermaid workflow scope from installation/adoption to the actual task lifecycle: plan, contract projection, worktree checkout, guarded implementation, verification, review, external acceptance, finish, merge, and cleanup.
- Added the README/documentation update to the unpublished `repo-harness@0.1.2` changelog because npm currently has only `repo-harness@0.1.1`; the next publish should use the already-prepared `0.1.2` package line instead of skipping to `0.1.3`.
- Tradeoff: English remains the canonical dense release and maintainer reference; the Chinese README mirrors the user-facing workflow and links back to English instead of duplicating every low-level reference paragraph.
