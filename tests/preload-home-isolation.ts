/**
 * Test processes and inherited child environments must start in /tmp.
 * Bun caches homedir and the default child environment at process startup.
 * The CI runner supplies safe startup values. Direct bun test calls must too.
 * OS account authority and explicit alternate tool roots are not rewritten.
 */
import { linkSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const requestedTmpRoot = resolve("/tmp");
mkdirSync(requestedTmpRoot, { recursive: true });
const temporaryRoot = realpathSync(requestedTmpRoot);

// Reject symlink descendants before resolving them into an outside folder.
// /tmp itself is a trusted OS alias.
function existingTemporaryDirectory(value: string | undefined, allowRoot = false): string | null {
  if (!value || !isAbsolute(value)) return null;
  if (value.split(/[\\/]/).some((component) => component === "." || component === "..")) return null;
  const absolute = resolve(value);
  for (const root of [requestedTmpRoot, temporaryRoot]) {
    const suffix = relative(root, absolute);
    if (suffix === "" && allowRoot) return temporaryRoot;
    if (!suffix || suffix === ".." || suffix.startsWith(".." + sep) || isAbsolute(suffix)) continue;
    let current = temporaryRoot;
    try {
      for (const component of suffix.split(sep)) {
        current = join(current, component);
        const entry = lstatSync(current);
        if (entry.isSymbolicLink() || !entry.isDirectory()) return null;
      }
      return realpathSync(current);
    } catch {
      return null;
    }
  }
  return null;
}

const startupHome = existingTemporaryDirectory(homedir());
const startupTmp = existingTemporaryDirectory(tmpdir(), true);
process.env.HOME = existingTemporaryDirectory(process.env.HOME)
  ?? realpathSync(mkdtempSync(join(temporaryRoot, "repo-harness-test-home-")));
process.env.TMPDIR = existingTemporaryDirectory(process.env.TMPDIR)
  ?? realpathSync(mkdtempSync(join(temporaryRoot, "repo-harness-test-tmp-")));
if (process.platform === "win32") {
  process.env.USERPROFILE = process.env.HOME;
  process.env.TEMP = process.env.TMPDIR;
  process.env.TMP = process.env.TMPDIR;
}

if (!startupHome || !startupTmp) {
  throw new Error("Unsafe Bun test startup environment. Start tests with HOME=$(mktemp -d /tmp/home-iso.XXXXXX) TMPDIR=/tmp, or use bun run test.");
}

// Publish a complete minimal Git identity once. Never copy host dotfiles.
const gitSeed = mkdtempSync(join(process.env.HOME, ".gitconfig-seed-"));
try {
  const seedFile = join(gitSeed, "config");
  writeFileSync(seedFile, "[user]\n\tname = Harness Tests\n\temail = harness-tests@example.invalid\n[maintenance]\n\tauto = false\n", { mode: 0o600, flag: "wx" });
  try {
    linkSync(seedFile, join(process.env.HOME, ".gitconfig"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
} finally {
  rmSync(gitSeed, { recursive: true, force: true });
}

if (!process.env.REPO_HARNESS_HOME) {
  process.env.REPO_HARNESS_HOME = mkdtempSync(join(process.env.TMPDIR, "repo-harness-test-home-"));
}
