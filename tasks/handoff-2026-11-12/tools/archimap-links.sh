#!/bin/bash
# Read-only: module documents on origin/main against the module links of archimap.html.
cd "${REPO_HARNESS_CHECKOUT:-$HOME/Projects/repo-harness}" || exit 1
work="$(mktemp -d /tmp/repo-harness-advisor/probe/archimap-links.XXXXXX)"
git show origin/main:docs/architecture/archimap.html > "$work/archimap.html"
git ls-tree -r --name-only origin/main docs/architecture/modules | sed 's#^docs/architecture/##' | sort -u > "$work/files.txt"
grep -o 'href="modules/[^"#]*' "$work/archimap.html" | sed 's/^href="//' | sort -u > "$work/links.txt"
echo "module files: $(wc -l < "$work/files.txt" | tr -d ' ')  archimap module links: $(wc -l < "$work/links.txt" | tr -d ' ')"
echo "--- files with no link in archimap.html:"
comm -23 "$work/files.txt" "$work/links.txt" | head -30
echo "--- links to a missing file:"
comm -13 "$work/files.txt" "$work/links.txt" | head -30
echo "--- base marker context:"
grep -n -o '.\{90\}eef4d81f.\{60\}' "$work/archimap.html" | head -3
echo "--- commits on main since the base that touch .archcontext/model:"
base="$(git rev-parse --verify -q eef4d81f^{commit})" && git log --oneline "${base}..origin/main" -- .archcontext/model | wc -l
echo "--- size: $(wc -c < "$work/archimap.html") bytes, $(wc -l < "$work/archimap.html") lines"
