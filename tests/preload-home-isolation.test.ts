import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

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
  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: temp, TEMP: temp, TMP: temp };
  return { home, temp, env, close: () => { rmSync(home, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true }); } };
}

const inspection = '({home:process.env.HOME,osHome:require("node:os").homedir(),tmp:require("node:os").tmpdir()})';

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
      symlinkSync(join(ROOT, "not-a-test-home"), link, process.platform === "win32" ? "junction" : "dir");
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
        env: { ...f.env, TMPDIR: join(ROOT, "not-a-test-temp"), TEMP: join(ROOT, "not-a-test-temp"), TMP: join(ROOT, "not-a-test-temp") },
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
});
