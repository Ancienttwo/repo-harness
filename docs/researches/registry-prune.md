# Removing stale repository registrations

The Kanban enumerates the account registry, including unavailable repositories.
It must not silently hide missing authority. Deleting a test repository or
worktree does not itself unregister its path.

Preview explicitly:

```sh
repo-harness fleet prune
```

The JSON contains `registry_revision`, `candidates`, `skipped` and
`remaining_count`. Each candidate has a `reason`:

| Reason | Condition |
| --- | --- |
| `path_missing` | `lstat` returns `ENOENT` |
| `not_primary_checkout` | the path is a linked worktree: the realpaths of `git rev-parse --git-dir` and `--git-common-dir` differ |

Existing primary checkouts, non-git directories, files, other `lstat` errors
and failed git probes (`git_probe_failed`) remain registered and appear in
`skipped`. Check that missing paths are obsolete rather than temporarily
unmounted or moved.

Apply using the revision from that preview:

```sh
repo-harness fleet prune --apply --expected-revision sha256:REPLACE_WITH_PREVIEW_DIGEST
```

Use `--repo-id <id...>` on preview and apply to select specific registrations.
Apply rejects changed registry bytes or unknown IDs, rechecks paths while
holding the existing registry mutation lock, and atomically removes only the
selected candidate entries. It increments authorizationRevision once for an actual
change; a no-op preserves the registry bytes and revision. The returned
`registry_revision` identifies the input snapshot; preview again after a change.

Registry writes accept only primary checkouts, so `init` or MCP setup in a
linked worktree reports the primary checkout path and adds no row. To register
adopted primary checkouts that predate the registry, list them explicitly:

```sh
repo-harness fleet register /path/to/repo-a /path/to/repo-b
```

Each path is checked and written on its own with source `manual`. The JSON
lists `registered`, `already_registered` (left unchanged) and `rejected` with a
per-path `reason`: `missing`, `unreadable`, `not_adopted`,
`not_primary_checkout` or `git_probe_failed`. The exit code is 1 when any path
is rejected. The command never scans directories.

`fleet prune` removes registry rows only. It neither deletes repository files
nor writes a backup. Cleanup is never automatic on startup or board refresh.
An unavailable board in a directory that still exists requires separate
diagnosis and must not be removed by treating every UI error as stale state.

Historical init test leaks have a producer-side guard in
`tests/cli/init.test.ts` (`npx cache sources keep process.env as the constructed
command env base`). The current `initCommandEnv` preserves caller isolation.
This command handles old residue and repositories removed after valid
registration without introducing test-name heuristics into product logic.
