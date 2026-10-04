import { lstatSync, mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { delimiter, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

// Mutable tool roots can bypass HOME. Keep one policy for the runner and preload.
const TEST_TOOL_ROOTS = [
  "BUN_INSTALL", "BUN_INSTALL_CACHE_DIR", "CODEX_HOME", "CODEX_SKILLS_ROOT",
  "CLAUDE_CONFIG_DIR", "CLAUDE_SKILLS_ROOT", "ORACLE_HOME_DIR", "HERDR_CONFIG_PATH",
  "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG", "GIT_TEMPLATE_DIR",
  "GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_OBJECT_DIRECTORY",
  "USERPROFILE", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH",
  "NPM_CONFIG_USERCONFIG", "NPM_CONFIG_CACHE",
  "NPM_CONFIG_PREFIX", "NPM_CONFIG_GLOBALCONFIG",
  "PNPM_HOME", "YARN_CACHE_FOLDER",
  "CARGO_HOME", "RUSTUP_HOME", "GNUPGHOME", "DOCKER_CONFIG",
  "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AZURE_CONFIG_DIR", "KUBECONFIG",
  "BASH_ENV", "ENV", "ZDOTDIR",
  "REPO_HARNESS_BRAIN_ROOT", "REPO_HARNESS_MCP_WORKTREE_ROOT",
];

function isTestToolRoot(name) {
  const key = name.toUpperCase();
  return TEST_TOOL_ROOTS.includes(key) || key.startsWith("XDG_");
}

// Git's command-scope settings can name include files. Refuse this ambient input.
function isGitConfigInjection(name) {
  const key = name.toUpperCase();
  return key === "GIT_CONFIG_COUNT" || key === "GIT_CONFIG_PARAMETERS"
    || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key);
}

export function temporaryPath(value, directory = false) {
  if (!value || !isAbsolute(value)) return null;
  if (value.split(/[\\/]/).some((part) => part === "." || part === "..")) return null;
  const root = resolve("/tmp");
  const canonical = realpathSync(root);
  for (const alias of [root, canonical]) {
    const suffix = relative(alias, resolve(value));
    if (suffix === "") return canonical;
    if (suffix === ".." || suffix.startsWith(".." + sep) || isAbsolute(suffix)) continue;
    let current = canonical;
    const parts = suffix.split(sep);
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      try {
        const entry = lstatSync(current);
        if (entry.isSymbolicLink()) return null;
        if ((directory || index < parts.length - 1) && !entry.isDirectory()) return null;
      } catch (error) {
        if (error.code !== "ENOENT" || directory) return null;
        // A tool may create its config later. Validate every existing ancestor.
        return join(current, ...parts.slice(index + 1));
      }
    }
    return realpathSync(current);
  }
  return null;
}

export function unsafeTestToolRoot(env) {
  // Windows exposes HOME as a drive/path pair too. Validate the combined path.
  if (process.platform === "win32" && (env.HOMEDRIVE !== undefined || env.HOMEPATH !== undefined)) {
    if (!env.HOMEDRIVE || !env.HOMEPATH || !temporaryPath(env.HOMEDRIVE + env.HOMEPATH)) {
      return "HOMEDRIVE/HOMEPATH";
    }
  }
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const key = name.toUpperCase();
    if (process.platform === "win32" && (key === "HOMEDRIVE" || key === "HOMEPATH")) continue;
    if (isGitConfigInjection(name)) return name;
    if (!isTestToolRoot(name) && key !== "REPO_HARNESS_HOME") continue;
    const paths = key === "KUBECONFIG" || key.endsWith("_DIRS") ? value.split(delimiter) : [value];
    if (paths.some((path) => !temporaryPath(path))) return name;
  }
  return null;
}

export function createTemporaryTestEnvironment(inherited) {
  const root = resolve("/tmp");
  mkdirSync(root, { recursive: true });
  const canonical = realpathSync(root);
  const home = mkdtempSync(join(canonical, "rh-test-home-"));
  const temp = mkdtempSync(join(canonical, "rh-test-tmp-"));
  const env = { ...inherited };
  const registryName = Object.keys(inherited).find((name) =>
    (process.platform === "win32" ? name.toUpperCase() : name) === "REPO_HARNESS_HOME");
  const registry = registryName === undefined ? undefined : inherited[registryName];
  for (const name of Object.keys(env)) {
    if (isTestToolRoot(name) || isGitConfigInjection(name)
      || ["HOME", "TMPDIR", "REPO_HARNESS_HOME"].includes(name.toUpperCase())) delete env[name];
  }
  if (registry !== undefined && temporaryPath(registry)) {
    env.REPO_HARNESS_HOME = registry;
  }
  Object.assign(env, { HOME: home, USERPROFILE: home, TMPDIR: temp, TEMP: temp, TMP: temp });
  if (process.platform === "win32") {
    const driveRoot = parse(home).root;
    Object.assign(env, {
      HOMEDRIVE: driveRoot.slice(0, -1), HOMEPATH: home.slice(driveRoot.length - 1),
      APPDATA: join(home, "AppData", "Roaming"), LOCALAPPDATA: join(home, "AppData", "Local"),
    });
  }
  return { env, home, temp };
}
