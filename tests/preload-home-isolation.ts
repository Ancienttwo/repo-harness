/**
 * Test processes and inherited child environments must start in /tmp.
 * Bun caches homedir and the default child environment at process startup.
 * The CI runner supplies safe startup values. Direct bun test calls must too.
 * Mutable tool roots must also stay under /tmp. OS account APIs are unchanged.
 */
import { linkSync, mkdirSync, mkdtempSync, realpathSync, readdirSync, rmSync, watch, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { temporaryPath, unsafeTestToolRoot } from "../scripts/lib/test-home-isolation.mjs";

const requestedTmpRoot = resolve("/tmp");
mkdirSync(requestedTmpRoot, { recursive: true });
const temporaryRoot = realpathSync(requestedTmpRoot);

function existingTemporaryDirectory(value: string | undefined, allowRoot = false): string | null {
  const path = temporaryPath(value, true);
  return path === temporaryRoot && !allowRoot ? null : path;
}

const startupHome = existingTemporaryDirectory(homedir());
const startupTmp = existingTemporaryDirectory(tmpdir(), true);
function refuseStartup(unsafeRoot?: string | null): never {
  throw new Error("Unsafe Bun test startup environment"
    + (unsafeRoot ? ": unsafe " + unsafeRoot : "")
    + ". Run bun run test:files <affected tests> --timeout 60000 --max-concurrency 1.");
}
const unsafeRoot = unsafeTestToolRoot(process.env);
if (!startupHome || !startupTmp || unsafeRoot) refuseStartup(unsafeRoot);

// Windows native APIs can use USERPROFILE/TEMP while HOME/TMPDIR differ.
// Inspect Bun's actual default child environment, not a late process.env copy.
// The probe loads no .env file and reports only the unsafe variable name.
const policyModule = new URL("../scripts/lib/test-home-isolation.mjs", import.meta.url).href;
const startupProbe = Bun.spawnSync([process.execPath, "--no-env-file", "-e",
  "const {temporaryPath,unsafeTestToolRoot}=await import(" + JSON.stringify(policyModule) + ");"
  + "const bad=['HOME','TMPDIR'].find(name=>process.env[name]!==undefined&&"
  + "(!temporaryPath(process.env[name],true)||(name==='HOME'&&temporaryPath(process.env[name],true)===temporaryPath('/tmp',true))))"
  + ";console.log(bad??unsafeTestToolRoot(process.env)??'');",
], { stdout: "pipe", stderr: "pipe" });
if (startupProbe.exitCode !== 0) refuseStartup("child environment probe");
const unsafeCachedRoot = startupProbe.stdout.toString().trim();
if (unsafeCachedRoot) refuseStartup(unsafeCachedRoot);

// Validate before allocation, so refused starts leave no new test directories.
process.env.HOME = existingTemporaryDirectory(process.env.HOME)
  ?? realpathSync(mkdtempSync(join(temporaryRoot, "repo-harness-test-home-")));
process.env.TMPDIR = existingTemporaryDirectory(process.env.TMPDIR, true)
  ?? realpathSync(mkdtempSync(join(temporaryRoot, "repo-harness-test-tmp-")));
if (process.platform === "win32") {
  process.env.USERPROFILE = process.env.HOME;
  process.env.TEMP = process.env.TMPDIR;
  process.env.TMP = process.env.TMPDIR;
}

// Publish a complete minimal Git identity once. Never copy host dotfiles.
const gitConfig = join(process.env.HOME, ".gitconfig");
if (!temporaryPath(gitConfig)) {
  throw new Error("Unsafe Bun test startup environment: .gitconfig is a symlink. Run bun run test:files <affected tests>.");
}
const gitSeed = mkdtempSync(join(process.env.HOME, ".gitconfig-seed-"));
try {
  const seedFile = join(gitSeed, "config");
  writeFileSync(seedFile, "[user]\n\tname = Harness Tests\n\temail = harness-tests@example.invalid\n[maintenance]\n\tauto = false\n", { mode: 0o600, flag: "wx" });
  try {
    linkSync(seedFile, gitConfig);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
} finally {
  rmSync(gitSeed, { recursive: true, force: true });
}

if (!process.env.REPO_HARNESS_HOME) {
  process.env.REPO_HARNESS_HOME = mkdtempSync(join(process.env.TMPDIR, "repo-harness-test-home-"));
}

// Watch only direct system-tmp task names. Test worktrees belong below their
// own disposable roots. Never delete a leaked or concurrently created path.
const taskName = /.+-wt-.+/;
const existingTaskNames = new Set(readdirSync(temporaryRoot).filter(name => taskName.test(name)));
const newTaskNames = new Set<string>();
const taskWatch = watch(temporaryRoot, (_event, name) => {
  if (name && taskName.test(String(name)) && !existingTaskNames.has(String(name))) newTaskNames.add(String(name));
});
taskWatch.unref();
process.on("exit", () => {
  taskWatch.close();
  for (const name of readdirSync(temporaryRoot)) if (taskName.test(name) && !existingTaskNames.has(name)) newTaskNames.add(name);
  if (newTaskNames.size) {
    console.error('test created worktree paths outside its disposable root: ' + [...newTaskNames].map(name => join(temporaryRoot, name)).join(', '));
    process.exitCode = 1;
  }
});
