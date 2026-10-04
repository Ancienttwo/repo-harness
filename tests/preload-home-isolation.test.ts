import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const TMP_ROOT = realpathSync(resolve("/tmp"));
const PRELOAD = join(import.meta.dir, "preload-home-isolation.ts");

function isTemporary(path: string): boolean {
  const suffix = relative(TMP_ROOT, realpathSync(path));
  return suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(".." + sep));
}

function fixture() {
  const home = mkdtempSync(join(TMP_ROOT, "home-iso-fixture-"));
  const temp = mkdtempSync(join(TMP_ROOT, "tmp-iso-fixture-"));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: temp, TEMP: temp, TMP: temp };
  let unsafeRoot: string | undefined;
  return {
    home, temp, env,
    unsafe: () => unsafeRoot ??= mkdtempSync(join(ROOT, ".home-iso-unsafe-")),
    close: () => {
      rmSync(home, { recursive: true, force: true });
      rmSync(temp, { recursive: true, force: true });
      if (unsafeRoot) rmSync(unsafeRoot, { recursive: true, force: true });
    },
  };
}

const inspection = '({home:process.env.HOME,osHome:require("node:os").homedir(),tmp:require("node:os").tmpdir()})';

// Independent cases cover each ambient authority that can bypass HOME.
const toolFamilies = [
  ["Bun", ["BUN_INSTALL", "BUN_INSTALL_CACHE_DIR"]],
  ["Codex", ["CODEX_HOME", "CODEX_SKILLS_ROOT"]],
  ["Claude", ["CLAUDE_CONFIG_DIR", "CLAUDE_SKILLS_ROOT"]],
  ["XDG", ["XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_RUNTIME_DIR", "XDG_CONFIG_DIRS", "XDG_DATA_DIRS"]],
  ["Git command settings", ["GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]],
  ["Git", ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG", "GIT_TEMPLATE_DIR", "GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_OBJECT_DIRECTORY"]],
  ["Windows and temp aliases", ["USERPROFILE", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH"]],
  ["package tools", ["NPM_CONFIG_USERCONFIG", "npm_config_userconfig", "NPM_CONFIG_GLOBALCONFIG", "npm_config_globalconfig", "NPM_CONFIG_CACHE", "npm_config_cache", "NPM_CONFIG_PREFIX", "npm_config_prefix", "PNPM_HOME", "YARN_CACHE_FOLDER", "CARGO_HOME", "RUSTUP_HOME"]],
  ["credentials", ["GNUPGHOME", "DOCKER_CONFIG", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AZURE_CONFIG_DIR", "KUBECONFIG"]],
  ["shell config", ["BASH_ENV", "ENV", "ZDOTDIR"]],
  ["other tool state", ["ORACLE_HOME_DIR", "HERDR_CONFIG_PATH", "REPO_HARNESS_BRAIN_ROOT", "REPO_HARNESS_MCP_WORKTREE_ROOT"]],
  ["registry", ["REPO_HARNESS_HOME"]],
  ["mixed-case roots", ["Bun_Install", "Codex_Home", "Xdg_Config_Home", "Git_Config_Global", "repo_harness_home"]],
] as const;

describe("test HOME and TMPDIR isolation", () => {
  test("keeps process and native HOME/TMPDIR under /tmp, away from the account home", () => {
    const account = spawnSync("node", ["-e", 'console.log(require("node:os").userInfo().homedir)'], {
      env: { ...process.env }, encoding: "utf8",
    });
    expect(account.status).toBe(0);
    const realHome = account.stdout.trim();
    expect(isTemporary(process.env.HOME!)).toBe(true);
    expect(isTemporary(homedir())).toBe(true);
    expect(isTemporary(tmpdir())).toBe(true);
    expect(realpathSync(process.env.HOME!)).not.toBe(realHome);
    expect(realpathSync(homedir())).not.toBe(realHome);
  });

  test("bare Bun and Node children inherit temporary startup directories", () => {
    const bun = Bun.spawnSync([process.execPath, "-e", "console.log(JSON.stringify(" + inspection + "))"], { stdout: "pipe", stderr: "pipe" });
    const node = spawnSync("node", ["-e", "console.log(JSON.stringify(" + inspection + "))"], { encoding: "utf8" });
    expect(bun.exitCode).toBe(0);
    expect(node.status).toBe(0);
    for (const output of [bun.stdout.toString(), node.stdout]) {
      const value = JSON.parse(output) as { home: string; osHome: string; tmp: string };
      expect(isTemporary(value.home)).toBe(true);
      expect(isTemporary(value.osHome)).toBe(true);
      expect(isTemporary(value.tmp)).toBe(true);
    }
  });

  test("preserves an existing temporary HOME, Git config, and explicit registry home", () => {
    const f = fixture();
    try {
      const config = "[user]\n\tname = Provided Identity\n\temail = provided@example.invalid\n";
      writeFileSync(join(f.home, ".gitconfig"), config);
      const registry = join(f.temp, "explicit-registry");
      const code = "await import(" + JSON.stringify(PRELOAD) + "); console.log(JSON.stringify({home:process.env.HOME,registry:process.env.REPO_HARNESS_HOME}));";
      const result = Bun.spawnSync([process.execPath, "-e", code], { env: { ...f.env, REPO_HARNESS_HOME: registry }, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout.toString())).toEqual({ home: realpathSync(f.home), registry });
      expect(readFileSync(join(f.home, ".gitconfig"), "utf8")).toBe(config);
    } finally { f.close(); }
  });

  test("replaces a changed HOME symlink without following its outside target", () => {
    const f = fixture();
    let replacement: string | undefined;
    try {
      const link = join(f.home, "outside-link");
      symlinkSync(f.unsafe(), link, process.platform === "win32" ? "junction" : "dir");
      const code = 'require("node:os").homedir(); process.env.HOME=' + JSON.stringify(link) + "; await import(" + JSON.stringify(PRELOAD) + "); console.log(process.env.HOME);";
      const result = Bun.spawnSync([process.execPath, "-e", code], { env: f.env, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(0);
      replacement = result.stdout.toString().trim();
      expect(isTemporary(replacement)).toBe(true);
      expect(replacement).not.toBe(link);
      expect(replacement).not.toBe(realpathSync(f.home));
    } finally {
      if (replacement && isTemporary(replacement)) rmSync(replacement, { recursive: true, force: true });
      f.close();
    }
  });

  test("rejects raw parent segments that could hide a symlink", () => {
    const f = fixture();
    let replacement: string | undefined;
    try {
      const collapsed = join(f.home, "dir");
      const target = join(f.temp, "target");
      mkdirSync(collapsed);
      mkdirSync(target);
      const link = join(f.home, "link");
      symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
      const raw = link + sep + ".." + sep + "dir";
      const code = 'require("node:os").homedir(); process.env.HOME=' + JSON.stringify(raw) + "; await import(" + JSON.stringify(PRELOAD) + "); console.log(process.env.HOME);";
      const result = Bun.spawnSync([process.execPath, "-e", code], { env: f.env, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(0);
      replacement = result.stdout.toString().trim();
      expect(isTemporary(replacement)).toBe(true);
      expect(replacement).not.toBe(realpathSync(collapsed));
    } finally {
      if (replacement && isTemporary(replacement)) rmSync(replacement, { recursive: true, force: true });
      f.close();
    }
  });

  test("fails before test code when the startup temp directory is outside /tmp", () => {
    const f = fixture();
    try {
      const code = "await import(" + JSON.stringify(PRELOAD) + "); console.log('TEST_BODY_RAN');";
      const result = Bun.spawnSync([process.execPath, "-e", code], {
        env: { ...f.env, TMPDIR: f.unsafe(), TEMP: f.unsafe(), TMP: f.unsafe() },
        stdout: "pipe", stderr: "pipe",
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("Unsafe Bun test startup environment");
      expect(result.stdout.toString()).not.toContain("TEST_BODY_RAN");
    } finally { f.close(); }
  });

  test.each(["ci-file", "coverage"])("starts %s with safe HOME before Bun loads", (entrypoint) => {
    const f = fixture();
    try {
      const marker = join(f.temp, "observed.json");
      const probe = join(f.temp, "startup.test.ts");
      writeFileSync(probe, 'import {test,expect} from "bun:test"; test("safe startup", async () => { const value=' + inspection + "; await Bun.write(" + JSON.stringify(marker) + ",JSON.stringify(value)); expect(value.home).toBe(value.osHome); });\n");
      const result = entrypoint === "ci-file"
        ? spawnSync("bash", ["-c", 'source "$1"; run_bun_test_file "$2"', "test-home", join(ROOT, "scripts/lib/ci-run-tests.sh"), probe], { cwd: ROOT, env: f.env, encoding: "utf8" })
        : spawnSync(process.execPath, ["run", "test:coverage", probe], { cwd: ROOT, env: f.env, encoding: "utf8" });
      expect(result.status).toBe(0);
      const value = JSON.parse(readFileSync(marker, "utf8")) as { home: string; osHome: string; tmp: string };
      // The entrypoint has already removed these directories after Bun exits.
      for (const path of [value.home, value.osHome, value.tmp]) {
        const suffix = relative(TMP_ROOT, path);
        expect(suffix.length).toBeGreaterThan(0);
        expect(suffix.startsWith(".." + sep) || suffix === ".." || isAbsolute(suffix)).toBe(false);
      }
      expect(value.home).not.toBe(f.home);
    } finally { f.close(); }
  });

  test.each(toolFamilies)("refuses unsafe %s roots before test code", (_family, names) => {
    const f = fixture();
    try {
      for (const name of names) {
        const outside = f.unsafe();
        const value = name.endsWith("_DIRS") || name === "KUBECONFIG"
          ? f.temp + delimiter + outside : outside;
        const code = "await import(" + JSON.stringify(PRELOAD) + "); console.log('TEST_BODY_RAN');";
        const result = Bun.spawnSync([process.execPath, "-e", code], {
          env: { ...f.env, [name]: value }, stdout: "pipe", stderr: "pipe",
        });
        expect(result.exitCode, name).not.toBe(0);
        expect(result.stderr.toString(), name).toContain("Unsafe Bun test startup environment");
        expect(result.stdout.toString(), name).not.toContain("TEST_BODY_RAN");
      }
    } finally { f.close(); }
  });

  test.each(toolFamilies)("clears inherited %s roots before Bun and bare children start", (_family, names) => {
    const f = fixture();
    try {
      const marker = join(f.temp, "roots.json");
      const probe = join(f.temp, "roots.test.ts");
      const selected = JSON.stringify(names);
      writeFileSync(probe, 'import {test,expect} from "bun:test"; test("safe roots", async () => {'
        + 'const child=Bun.spawnSync([process.execPath,"-e","console.log(JSON.stringify(process.env))"],{stdout:"pipe",stderr:"pipe"});'
        + 'expect(child.exitCode).toBe(0); await Bun.write(' + JSON.stringify(marker)
        + ',JSON.stringify({parent:process.env,child:JSON.parse(child.stdout.toString())}));});\n');
      const env: NodeJS.ProcessEnv = { ...f.env };
      for (const name of names) env[name] = f.unsafe();
      // The shell config fixture names only a missing path in this worktree.
      const result = spawnSync("bash", ["--noprofile", "--norc", "-c", 'source "$1"; run_bun_test_file "$2"', "test-home", join(ROOT, "scripts/lib/ci-run-tests.sh"), probe], {
        cwd: ROOT, env, encoding: "utf8",
      });
      expect(result.status, result.stdout + result.stderr + selected).toBe(0);
      const observed = JSON.parse(readFileSync(marker, "utf8")) as { parent: Record<string, string>; child: Record<string, string> };
      for (const name of names) {
        for (const environment of [observed.parent, observed.child]) {
          if (["USERPROFILE", "TEMP", "TMP"].includes(name)) {
            const suffix = relative(TMP_ROOT, environment[name]!);
            expect(isAbsolute(suffix) || suffix === ".." || suffix.startsWith(".." + sep), name).toBe(false);
          } else if (process.platform === "win32" && ["APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH"].includes(name)) {
            const path = name === "HOMEDRIVE" || name === "HOMEPATH"
              ? environment.HOMEDRIVE! + environment.HOMEPATH! : environment[name]!;
            const suffix = relative(TMP_ROOT, path);
            expect(isAbsolute(suffix) || suffix === ".." || suffix.startsWith(".." + sep), name).toBe(false);
            expect(environment[name], name).not.toBe(env[name]);
          } else if (name === "REPO_HARNESS_HOME" && environment === observed.parent) {
            // The repo preload creates its default only after the runner removed the unsafe input.
            expect(environment[name]!.startsWith(environment.TMPDIR! + sep)).toBe(true);
            expect(environment[name]).not.toBe(env[name]);
          } else {
            expect(environment[name], name).toBeUndefined();
          }
        }
      }
    } finally { f.close(); }
  });

  test("preserves safe tool file paths and registry state without reading their contents", () => {
    const f = fixture();
    try {
      const config = join(f.home, "not-yet-created", "gitconfig");
      const registry = join(f.temp, "explicit-registry");
      const code = "await import(" + JSON.stringify(PRELOAD) + "); console.log(JSON.stringify({config:process.env.GIT_CONFIG_GLOBAL,registry:process.env.REPO_HARNESS_HOME}));";
      const result = Bun.spawnSync([process.execPath, "-e", code], {
        env: { ...f.env, GIT_CONFIG_GLOBAL: config, REPO_HARNESS_HOME: registry }, stdout: "pipe", stderr: "pipe",
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout.toString())).toEqual({ config, registry });
    } finally { f.close(); }
  });

  test("accepts TMPDIR=/tmp without a private temp directory for each process", () => {
    const f = fixture();
    try {
      const env: NodeJS.ProcessEnv = { ...f.env, TMPDIR: TMP_ROOT, TEMP: TMP_ROOT, TMP: TMP_ROOT };
      delete env.REPO_HARNESS_HOME;
      const code = "await import(" + JSON.stringify(PRELOAD) + "); console.log(JSON.stringify({tmp:process.env.TMPDIR,registry:process.env.REPO_HARNESS_HOME}));";
      const result = Bun.spawnSync([process.execPath, "-e", code], { env, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(0);
      const value = JSON.parse(result.stdout.toString()) as { tmp: string; registry: string };
      expect(value.tmp).toBe(TMP_ROOT);
      expect(dirname(value.registry)).toBe(TMP_ROOT);
      rmSync(value.registry, { recursive: true, force: true });
    } finally { f.close(); }
  });

  test("runs the named package test instead of the default core selection", () => {
    const f = fixture();
    try {
      const marker = join(f.temp, "selected.json");
      const probe = join(f.temp, "selected.test.ts");
      writeFileSync(probe, 'import {test} from "bun:test"; test("selected",async()=>{await Bun.write(' + JSON.stringify(marker) + ',JSON.stringify(' + inspection + '));});\n');
      const result = spawnSync(process.execPath, ["run", "test", "--", probe], { cwd: ROOT, env: f.env, encoding: "utf8" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const value = JSON.parse(readFileSync(marker, "utf8")) as { home: string; osHome: string };
      expect(value.home).toBe(value.osHome);
      expect(value.home).not.toBe(f.home);
    } finally { f.close(); }
  });

  test("preserves a temporary registry home through the runner and bare child", () => {
    const f = fixture();
    try {
      const registry = join(f.temp, "provided-registry");
      const marker = join(f.temp, "registry.json");
      const probe = join(f.temp, "registry.test.ts");
      writeFileSync(probe, 'import {test,expect} from "bun:test"; test("registry",async()=>{'
        + 'const child=Bun.spawnSync([process.execPath,"-e","console.log(process.env.REPO_HARNESS_HOME)"],{stdout:"pipe",stderr:"pipe"});'
        + 'expect(child.exitCode).toBe(0);await Bun.write(' + JSON.stringify(marker)
        + ',JSON.stringify({parent:process.env.REPO_HARNESS_HOME,child:child.stdout.toString().trim()}));});\n');
      const result = spawnSync("bash", ["-c", 'source "$1"; run_bun_test_file "$2"', "test-home", join(ROOT, "scripts/lib/ci-run-tests.sh"), probe], {
        cwd: ROOT, env: { ...f.env, REPO_HARNESS_HOME: registry }, encoding: "utf8",
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({ parent: registry, child: registry });
    } finally { f.close(); }
  });

  test("keeps a package without a preload safe through the tarball runner path", () => {
    const f = fixture();
    try {
      const marker = join(f.temp, "unpacked.json");
      const probe = join(f.temp, "unpacked.test.ts");
      writeFileSync(probe, 'import {test,expect} from "bun:test";test("unpacked",async()=>{'
        + 'const child=Bun.spawnSync([process.execPath,"-e","console.log(JSON.stringify(process.env))"],{stdout:"pipe",stderr:"pipe"});'
        + 'expect(child.exitCode).toBe(0);await Bun.write(' + JSON.stringify(marker)
        + ',JSON.stringify({paths:' + inspection + ',roots:JSON.parse(child.stdout.toString())}));});\n');
      const result = spawnSync("bash", ["-c", 'source "$1"; BUN_TEST_ISOLATE_FILES=0 run_bun_tests "$2"', "test-home", join(ROOT, "scripts/lib/ci-run-tests.sh"), probe], {
        cwd: f.temp, env: { ...f.env, BUN_INSTALL: f.unsafe(), CODEX_HOME: f.unsafe() }, encoding: "utf8",
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const value = JSON.parse(readFileSync(marker, "utf8")) as { paths: { home: string; osHome: string; tmp: string }; roots: Record<string, string> };
      expect(value.paths.home).toBe(value.paths.osHome);
      expect(value.paths.home).not.toBe(f.home);
      for (const path of [value.paths.home, value.paths.tmp]) {
        const suffix = relative(TMP_ROOT, path);
        expect(isAbsolute(suffix) || suffix === ".." || suffix.startsWith(".." + sep)).toBe(false);
      }
      expect(value.roots.BUN_INSTALL).toBeUndefined();
      expect(value.roots.CODEX_HOME).toBeUndefined();
    } finally { f.close(); }
  });

  test("refuses a Git config symlink before Git can follow it", () => {
    const f = fixture();
    try {
      symlinkSync(f.unsafe(), join(f.home, ".gitconfig"), "file");
      const result = Bun.spawnSync([process.execPath, "-e", "await import(" + JSON.stringify(PRELOAD) + "); console.log('TEST_BODY_RAN');"], {
        env: f.env, stdout: "pipe", stderr: "pipe",
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("Unsafe Bun test startup environment: .gitconfig");
      expect(result.stdout.toString()).not.toContain("TEST_BODY_RAN");
    } finally { f.close(); }
  });

  test("runs the shared library from an installed package path", () => {
    const f = fixture();
    try {
      const library = join(f.temp, "node_modules", "repo-harness", "scripts", "lib");
      mkdirSync(library, { recursive: true });
      for (const file of ["ci-run-tests.sh", "test-home-isolation.mjs"]) {
        writeFileSync(join(library, file), readFileSync(join(ROOT, "scripts/lib", file)));
      }
      const marker = join(f.temp, "installed.json");
      const probe = join(f.temp, "installed.test.ts");
      writeFileSync(probe, 'import {test} from "bun:test";test("installed",async()=>{await Bun.write('
        + JSON.stringify(marker) + ',JSON.stringify(' + inspection + '));});\n');
      const result = spawnSync("bash", ["-c", 'source "$1"; run_bun_test_file "$2"', "test-home", join(library, "ci-run-tests.sh"), probe], {
        cwd: f.temp, env: f.env, encoding: "utf8",
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const value = JSON.parse(readFileSync(marker, "utf8")) as { home: string; osHome: string };
      expect(value.home).toBe(value.osHome);
      expect(value.home).not.toBe(f.home);
    } finally { f.close(); }
  });

  test.each(["HOME", "TMPDIR"])("refuses startup %s outside /tmp despite safe native aliases", (name) => {
    const f = fixture();
    try {
      const result = Bun.spawnSync([process.execPath, "--no-env-file", "-e", "await import(" + JSON.stringify(PRELOAD) + "); console.log('TEST_BODY_RAN');"], {
        env: { ...f.env, [name]: f.unsafe() }, stdout: "pipe", stderr: "pipe",
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("Unsafe Bun test startup environment");
      expect(result.stdout.toString()).not.toContain("TEST_BODY_RAN");
    } finally { f.close(); }
  });

  test("refuses a cached unsafe tool root even when process.env removes it before preload", () => {
    const f = fixture();
    try {
      const result = Bun.spawnSync([process.execPath, "--no-env-file", "-e", "delete process.env.BUN_INSTALL; await import(" + JSON.stringify(PRELOAD) + "); console.log('TEST_BODY_RAN');"], {
        env: { ...f.env, BUN_INSTALL: f.unsafe() }, stdout: "pipe", stderr: "pipe",
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("unsafe BUN_INSTALL");
      expect(result.stdout.toString()).not.toContain("TEST_BODY_RAN");
    } finally { f.close(); }
  });
});
