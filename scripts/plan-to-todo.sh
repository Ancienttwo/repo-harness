#!/bin/bash
set -euo pipefail
# Optional planning references never project execution or approval artifacts.
[[ "$#" -eq 2 && "$1" == '--plan' ]] || { echo 'Usage: repo-harness run plan-to-todo --plan <plans/path>' >&2; exit 2; }
repo="${REPO_HARNESS_TARGET_REPO_ROOT:-$(git rev-parse --show-toplevel)}"
cd "$repo"
bun - "$2" <<'JS'
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
const input = process.argv[2];
const root = realpathSync(process.cwd());
const path = resolve(root, input);
const rel = relative(root, path);
if (isAbsolute(input) || !rel.startsWith(`plans${sep}`) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) throw new Error('Plan must be a contained regular plans file with no symlink ancestors');
process.stdout.write(readFileSync(path));
JS
echo '[planning] use Goal/Scope/Verify/Rollback in the delegation brief or PR description; no execution artifacts were created' >&2
