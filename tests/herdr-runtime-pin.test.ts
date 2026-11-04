import { renderHerdrSkill } from "../src/cli/commands/herdr-skill-render.mjs";
import { describe, expect, test, spyOn } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { run, withTempRepo } from "./helpers/repo-fixture";
import { configureRequiredHerdrSkill } from "../src/cli/commands/herdr-skill";
import { ensureHerdrCore } from "../src/cli/commands/global-runtime";
import { startFakeHcRelease } from "./helpers/fake-hc";
import { HC_MIN_VERSION } from "../src/core/operator/herdr-pin";

/**
 * The package file `src/core/operator/herdr-core-pin.json` is the single herdr
 * runtime pin. These are drift checks for its readers: CI and the readiness
 * script must derive the floor, URL, and checksum from that file instead of
 * restating them.
 */
const ROOT = join(import.meta.dir, "..");
const PIN_FILE = "src/core/operator/herdr-core-pin.json";
const CI_PATH = join(ROOT, ".github/workflows/ci.yml");
const SCRIPT_PATH = join(ROOT, "scripts/check-agent-tooling.sh");

function readPin() {
  return JSON.parse(readFileSync(join(ROOT, PIN_FILE), "utf8"));
}

function herdrInstallStep() {
  const action = Bun.YAML.parse(readFileSync(join(ROOT, '.github/actions/install-pinned-herdr-core/action.yml'), 'utf8')) as {
    runs: { using: string; steps: Array<{ shell: string; run: string }> };
  };
  expect(action.runs.using).toBe('composite');
  expect(action.runs.steps).toHaveLength(1);
  expect(action.runs.steps[0]!.shell).toBe('bash');
  return action.runs.steps[0]!.run;

}

describe("herdr runtime pin has one source of truth", () => {
  test("the herdr-core pin names an official release asset for each platform of the 0.1.17 manifest", () => {
    const core = readPin();
    expect(core.min_version).toBe("0.1.17");
    for (const platform of ['linux-aarch64', 'linux-x86_64', 'macos-aarch64', 'macos-x86_64', 'windows-x86_64']) {
      const asset = core.release_assets?.[platform];
      expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset?.url).toBe(`https://releases.herdr.dev/core/${core.min_version}/herdr-core-${platform}.${platform.startsWith('windows') ? 'zip' : 'tar.gz'}`);
    }
  });

  test("each CI job installs hc from the pin before its tests", () => {
    const workflow = Bun.YAML.parse(readFileSync(CI_PATH, 'utf8')) as {
      jobs: Record<string, { steps: Array<{ name?: string; uses?: string; if?: string; run?: string }> }>;
    };
    for (const job of ['native-oar', 'verify', 'test']) {
      const steps = workflow.jobs[job]!.steps;
      const core = steps.findIndex(step => step.name === 'Install pinned herdr-core runtime'
        && step.uses === './.github/actions/install-pinned-herdr-core');
      expect(core, job).toBeGreaterThan(-1);
      expect(steps[core]!.if, job).toBeUndefined();
    }
    const nativeSteps = workflow.jobs['native-oar']!.steps;
    const install = nativeSteps.findIndex(step => step.uses === './.github/actions/install-pinned-herdr-core');
    expect(install).toBeLessThan(nativeSteps.findIndex(step => step.name === 'Run native OAR acceptance tests'));
    const step = herdrInstallStep();
    expect(step).toContain(`pin='${PIN_FILE}'`);
    expect(step).toContain("'.min_version'");
    expect(step).toContain("'.release_assets[$asset].url'");
    expect(step).toContain("'.release_assets[$asset].sha256'");
    expect(step).toContain("sha256sum --check");
    expect(step).toContain('shasum -a 256 --check');
    expect(step).toContain('"$bin/hc" --version');
    expect(step).toContain('GITHUB_PATH');
    // No hardcoded version, release tag, or checksum may survive in the step.
    expect(step).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(step).not.toMatch(/[0-9a-f]{64}/);
  });

  test.each([
    ["the pinned digest", true],
    ["a wrong digest", false],
  ])("the herdr-core install with %s", (_label, digestMatches) => withTempRepo('hc-install', root => {
    const version = readPin().min_version;
    mkdirSync(join(root, 'pkg'));
    writeFileSync(join(root, 'pkg/herdr-core'), `#!/bin/sh\necho "hc ${version}"\n`, { mode: 0o755 });
    expect(run('tar', ['-czf', 'asset.tar.gz', '-C', 'pkg', 'herdr-core'], root).status).toBe(0);
    const digest = new Bun.CryptoHasher('sha256').update(readFileSync(join(root, 'asset.tar.gz'))).digest('hex');
    const asset = { url: `file://${join(root, 'asset.tar.gz')}`, sha256: digestMatches ? digest : '0'.repeat(64) };
    const release_assets = Object.fromEntries(['linux-x86_64', 'macos-aarch64', 'macos-x86_64'].map(platform => [platform, asset]));
    mkdirSync(join(root, dirname(PIN_FILE)), { recursive: true });
    writeFileSync(join(root, PIN_FILE), JSON.stringify({ min_version: version, release_assets }));
    mkdirSync(join(root, 'runner'));
    const result = run('bash', ['-c', herdrInstallStep()], root, {
      RUNNER_TEMP: join(root, 'runner'), GITHUB_PATH: join(root, 'github-path'),
    });
    expect(result.status, result.stderr).toBe(digestMatches ? 0 : 1);
    expect(existsSync(join(root, 'runner/herdr-core-bin/hc'))).toBe(digestMatches);
    expect(existsSync(join(root, 'github-path'))).toBe(digestMatches);
    if (digestMatches) expect(result.stdout).toContain(`hc ${version}`);
  }));

  test("check-agent-tooling.sh carries no hand-coded herdr version floor", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    expect(script).toContain(`const HERDR_CORE_PIN_SOURCE = "package:${PIN_FILE}";`);
    expect(script).toContain('require(path.join(PACKAGE_ROOT, "src", "core", "operator", "herdr-core-pin.json"))');
    expect(script).not.toContain(".ai/harness/policy.json#external_tooling.herdr_core");
    const herdrLines = script.split("\n").filter((line) => /herdr/i.test(line));
    expect(herdrLines.length).toBeGreaterThan(0);
    // The floor checks carry no "herdr" text on every line, so scan their whole bodies.
    for (const name of ["versionAtLeast", "herdrCoreCapability"]) {
      const start = script.indexOf(`\nfunction ${name}(`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      herdrLines.push(...script.slice(start, script.indexOf("\n}\n", start)).split("\n"));
    }
    for (const line of herdrLines) {
      expect(line).not.toMatch(/\d+\.\d+\.\d+/);
      expect(line).not.toMatch(/minor\s*[<>]=?\s*\d|\[2\]\)\s*[<>]/);
    }
  });

  test("the browser bundle can read the hc pin check", () => {
    // operator-web builds without Node built-ins, so the hc version check must stay in core.
    const pin = readFileSync(join(ROOT, 'src/core/operator/herdr-pin.ts'), 'utf8');
    expect(pin).not.toMatch(/from '(node:|\.[^']*(effects|operator-web)\b)/);
  });
});

// The first lines of `hc --skill` from the pinned herdr-core 0.1.17 release.
const HC_MANUAL = "# hc manual (herdr-core)\n\nThe current manual for herdr-core's CLI, `hc`. It is not `herdr`, the older\nterminal multiplexer.\n\n"
  + "# hc: programs and agents that stay alive\n\n`$HC_TERMINAL_ID` is your address. Terminals you start are your children.\n";

test("Herdr skill puts the hc manual verbatim under the caller-context policy", () => {
  const rendered = renderHerdrSkill(HC_MANUAL);
  expect(rendered.startsWith("---\nname: herdr\n")).toBe(true);
  expect(rendered).toContain("Missing variables do not prove");
  expect(rendered).toContain("hc ls --json");
  expect(rendered).toContain("Read-only discovery does not require");
  expect(rendered).toContain("If no suitable reviewer exists, start one");
  expect(rendered).not.toContain("HERDR_ENV");
  expect(rendered.endsWith(`(\`hc --skill\`).\n\n${HC_MANUAL}`)).toBe(true);
  expect(() => renderHerdrSkill("---\nname: herdr\n---\nCheck HERDR_ENV before control.\n\n## Learn the current CLI\n")).toThrow("hc --skill did not return the hc manual");
});

test("Herdr skill renderer loads from an npm package path under Node", () => {
  const root = mkdtempSync(join(tmpdir(), "herdr-render-package-"));
  try {
    const packageRoot = join(root, "node_modules", "repo-harness");
    for (const file of ["src/cli/commands/herdr-skill-render.mjs", "assets/reference-configs/herdr-skill-context.md"]) {
      const target = join(packageRoot, file);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, readFileSync(join(ROOT, file)));
    }
    const upstream = HC_MANUAL;
    const result = spawnSync("node", ["-e", "const {renderHerdrSkill}=require(process.argv[1]); process.stdout.write(renderHerdrSkill(process.argv[2]));", join(packageRoot, "src/cli/commands/herdr-skill-render.mjs"), upstream], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(renderHerdrSkill(upstream));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("required Herdr skill comes from the binary, updates owned copies, and preserves unowned copies", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-harness-herdr-skill-"));
  try {
    const home = join(root, "home");
    const bin = join(root, "bin");
    const source = join(root, "skill.md");
    mkdirSync(home);
    mkdirSync(bin);
    const hc = join(bin, "hc");
    writeFileSync(hc, "#!/bin/sh\ncat \"$FIXTURE_SKILL_FILE\"\n");
    chmodSync(hc, 0o755);
    const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH ?? ""}`, FIXTURE_SKILL_FILE: source };
    const first = HC_MANUAL;
    writeFileSync(source, first);
    // A copy that an earlier release installed from classic `herdr --skill` is still owned.
    const classicCopy = join(home, ".claude", "skills", "herdr");
    mkdirSync(classicCopy, { recursive: true });
    writeFileSync(join(classicCopy, "SKILL.md"), "Check HERDR_ENV.\n");
    writeFileSync(join(classicCopy, ".repo-harness-owner.json"), JSON.stringify({ owner: "repo-harness", source: "herdr --skill", sha256: `sha256:${createHash("sha256").update("Check HERDR_ENV.\n").digest("hex")}` }));
    expect(configureRequiredHerdrSkill("both", env).status).toBe("ok");
    for (const host of [".claude", ".codex"]) {
      expect(readFileSync(join(home, host, "skills", "herdr", "SKILL.md"), "utf8")).toBe(renderHerdrSkill(first));
    }
    // A copy equal to the render keeps its ownership even when its marker is stale,
    // but a marker that is not a regular file is never replaced.
    const classicMarker = join(classicCopy, ".repo-harness-owner.json");
    rmSync(classicMarker);
    mkdirSync(classicMarker);
    writeFileSync(join(classicMarker, "keep.txt"), "user\n");
    expect(configureRequiredHerdrSkill("both", env).status).toBe("ok");
    expect(readFileSync(join(classicMarker, "keep.txt"), "utf8")).toBe("user\n");
    rmSync(classicMarker, { recursive: true });
    writeFileSync(classicMarker, JSON.stringify({ owner: "repo-harness", sha256: "sha256:stale" }));
    expect(configureRequiredHerdrSkill("both", env).status).toBe("ok");
    expect(JSON.parse(readFileSync(classicMarker, "utf8")).sha256)
      .toBe(`sha256:${createHash("sha256").update(renderHerdrSkill(first)).digest("hex")}`);

    const shared = join(home, ".agents", "skills", "herdr");
    mkdirSync(shared, { recursive: true });
    for (const file of ["SKILL.md", ".repo-harness-owner.json"]) {
      writeFileSync(join(shared, file), readFileSync(join(home, ".codex", "skills", "herdr", file)));
    }
    const next = `${first}Use hc ls.\n`;
    writeFileSync(source, next);
    expect(configureRequiredHerdrSkill("both", env).status).toBe("ok");
    expect(readFileSync(join(home, ".codex", "skills", "herdr", "SKILL.md"), "utf8")).toBe(renderHerdrSkill(next));
    expect(readFileSync(join(shared, "SKILL.md"), "utf8")).toBe(renderHerdrSkill(next));

    const afterCleanupFailure = `${next}Keep the installed skill.\n`;
    writeFileSync(source, afterCleanupFailure);
    let cleanupCount = 0;
    const cleanup = configureRequiredHerdrSkill("both", env, (path) => {
      cleanupCount += 1;
      if (cleanupCount === 2) throw new Error("fixture cleanup failure");
      rmSync(path, { recursive: true, force: true });
    });
    expect(cleanup.status).toBe("ok");
    expect(cleanup.detail).toContain("backup cleanup pending");
    for (const host of [".claude", ".codex"]) {
      expect(readFileSync(join(home, host, "skills", "herdr", "SKILL.md"), "utf8")).toBe(renderHerdrSkill(afterCleanupFailure));
    }

    writeFileSync(join(shared, "SKILL.md"), "# shared user change\n");
    writeFileSync(source, `${afterCleanupFailure}New command.\n`);
    expect(configureRequiredHerdrSkill("claude", env).status).toBe("ok");
    expect(readFileSync(join(shared, "SKILL.md"), "utf8")).toBe("# shared user change\n");
    expect(configureRequiredHerdrSkill("both", env).status).toBe("failed");
    expect(readFileSync(join(shared, "SKILL.md"), "utf8")).toBe("# shared user change\n");
    expect(readFileSync(join(home, ".codex", "skills", "herdr", "SKILL.md"), "utf8")).toBe(renderHerdrSkill(afterCleanupFailure));
    writeFileSync(join(shared, "SKILL.md"), renderHerdrSkill(afterCleanupFailure));

    const claudeSkill = join(home, ".claude", "skills", "herdr", "SKILL.md");
    writeFileSync(claudeSkill, "# user change\n");
    writeFileSync(source, `${afterCleanupFailure}One more rule.\n`);
    const refusal = configureRequiredHerdrSkill("both", env);
    expect(refusal.status).toBe("failed");
    expect(refusal.detail).toBe(`refusing to replace unowned or changed Herdr skill: ${join(home, ".claude", "skills", "herdr")}; `
      + `to keep it and install a fresh owned copy, move it out of ${join(home, ".claude", "skills")} `
      + `(for example: mv "${join(home, ".claude", "skills", "herdr")}" "${join(home, ".claude", "herdr-skill.moved")}"), `
      + "then run `repo-harness update` again");
    expect(readFileSync(claudeSkill, "utf8")).toBe("# user change\n");
    expect(readFileSync(join(home, ".codex", "skills", "herdr", "SKILL.md"), "utf8")).toBe(renderHerdrSkill(afterCleanupFailure));
    expect(existsSync(join(home, ".codex", "skills", "herdr", ".repo-harness-owner.json"))).toBe(true);

    writeFileSync(hc, "#!/bin/sh\nkill -TERM $$\n");
    expect(configureRequiredHerdrSkill("both", env).detail).toBe("hc --skill failed: signal SIGTERM");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("required Herdr skill rejects a symlinked host parent before writing a new skills directory", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-harness-herdr-parent-"));
  try {
    const home = join(root, "home");
    const outside = join(root, "outside");
    const bin = join(root, "bin");
    mkdirSync(home);
    mkdirSync(outside);
    mkdirSync(bin);
    symlinkSync(outside, join(home, ".codex"), "dir");
    const source = join(root, "skill.md");
    writeFileSync(source, HC_MANUAL);
    const hc = join(bin, "hc");
    writeFileSync(hc, "#!/bin/sh\ncat \"$FIXTURE_SKILL_FILE\"\n");
    chmodSync(hc, 0o755);
    const result = configureRequiredHerdrSkill("codex", {
      ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH ?? ""}`, FIXTURE_SKILL_FILE: source,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toContain("non-canonical host skill root");
    expect(existsSync(join(outside, "skills"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.each(["claude", "codex"] as const)("%s skill cleanup recovers old stages and reports unsafe or recent entries", host => {
  const root = mkdtempSync(join(tmpdir(), "repo-harness-herdr-stages-"));
  try {
    const home = join(root, "home");
    const bin = join(root, "bin");
    mkdirSync(home); mkdirSync(bin);
    const upstream = HC_MANUAL;
    const content = renderHerdrSkill(upstream);
    const source = join(root, "skill.md");
    writeFileSync(source, upstream);
    writeFileSync(join(bin, "hc"), '#!/bin/sh\ncat "$FIXTURE_SKILL_FILE"\n');
    chmodSync(join(bin, "hc"), 0o755);
    const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH ?? ""}`, FIXTURE_SKILL_FILE: source };
    expect(configureRequiredHerdrSkill(host, env).status).toBe("ok");
    const skills = join(home, `.${host}`, "skills");
    const destination = join(skills, "herdr");
    const marker = readFileSync(join(destination, ".repo-harness-owner.json"), "utf8");
    const old = new Date(Date.now() - 20 * 60 * 1_000);
    const stage = (name: string, files: Record<string, string> = {}, stale = true) => {
      const path = join(skills, name);
      mkdirSync(path);
      for (const [name, text] of Object.entries(files)) writeFileSync(join(path, name), text);
      if (stale) utimesSync(path, old, old);
      return path;
    };
    // This is the on-disk state after destination -> backup and before stage -> destination.
    const backup = join(skills, ".herdr-stage-abc123-backup");
    renameSync(destination, backup); utimesSync(backup, old, old);
    const empty = stage(".herdr-stage-empty1");
    const partial = stage(".herdr-stage-part12", { "SKILL.md": content });
    const noPrefix = stage(".herdr-stage-nopre1", { "SKILL.md": "# unrelated skill\n" });
    const complete = stage(".herdr-stage-full12", { "SKILL.md": content, ".repo-harness-owner.json": marker });
    const fresh = stage(".herdr-stage-fresh1", {}, false);
    const extra = stage(".herdr-stage-extra1-backup", { "SKILL.md": content, ".repo-harness-owner.json": marker, "keep": "user file" });
    const foreign = stage(".herdr-stage-other1-backup", { "SKILL.md": content, ".repo-harness-owner.json": marker.replace("repo-harness", "foreign") });
    const invalid = stage(".herdr-stage-bad123", { "SKILL.md": content, ".repo-harness-owner.json": "{}" });
    const markerOnly = stage(".herdr-stage-mark12", { ".repo-harness-owner.json": marker });
    const target = join(root, "keep"); mkdirSync(target); writeFileSync(join(target, "keep"), "keep");
    const link = join(skills, ".herdr-stage-link12"); symlinkSync(target, link, "dir");
    const childLink = stage(".herdr-stage-child1");
    symlinkSync(source, join(childLink, "SKILL.md")); utimesSync(childLink, old, old);
    const nested = stage(".herdr-stage-dir123");
    mkdirSync(join(nested, "SKILL.md")); utimesSync(nested, old, old);
    const unrelated = [stage(".herdr-stage-x"), stage("herdr-old"), stage("other-skill"), stage(".herdr-stage-abc123-backup-extra")];
    const result = configureRequiredHerdrSkill(host, env);
    expect(result.status).toBe("ok");
    expect(existsSync(noPrefix)).toBe(true);
    expect(result.detail).toContain(`stage cleanup skipped: ${noPrefix}: stage contents not proved`);
    expect(readFileSync(join(noPrefix, "SKILL.md"), "utf8")).toBe("# unrelated skill\n");
    expect(readFileSync(join(destination, "SKILL.md"), "utf8")).toBe(content);
    for (const path of [backup, empty, partial, complete]) {
      expect(existsSync(path)).toBe(false);
      expect(result.detail).toContain(`stage cleanup removed: ${path}`);
    }
    for (const path of [fresh, extra, foreign, invalid, markerOnly, link, childLink, nested]) {
      expect(lstatSync(path)).toBeDefined();
      expect(result.detail).toContain(`stage cleanup skipped: ${path}`);
    }
    expect(readFileSync(join(target, "keep"), "utf8")).toBe("keep");
    expect(readFileSync(source, "utf8")).toBe(upstream);
    for (const path of unrelated) {
      expect(existsSync(path)).toBe(true);
      expect(result.detail).not.toContain(path);
    }
    // Already-current installs also clean old stages. Cleanup errors remain advisory.
    const pending = stage(".herdr-stage-fail12");
    const advisory = configureRequiredHerdrSkill(host, env, () => { throw new Error("fixture cleanup failure"); });
    expect(advisory.status).toBe("ok");
    expect(advisory.detail).toContain(`stage cleanup pending: ${pending}: fixture cleanup failure`);
    expect(existsSync(pending)).toBe(true);
    const current = configureRequiredHerdrSkill(host, env);
    expect(current.status).toBe("ok");
    expect(current.detail).toContain(`stage cleanup removed: ${pending}`);
    expect(existsSync(pending)).toBe(false);
    // A backup made from an old installed directory must still count as recent.
    utimesSync(destination, old, old);
    writeFileSync(source, `${upstream}Updated binary skill.\n`);
    let recentBackup = "";
    let backupMtime = 0;
    const update = configureRequiredHerdrSkill(host, env, path => {
      recentBackup = path;
      backupMtime = lstatSync(path).mtimeMs;
      throw new Error("keep new backup for age check");
    });
    expect(update.status).toBe("ok");
    expect(recentBackup).not.toBe("");
    expect(backupMtime).toBeGreaterThan(Date.now() - 10 * 60 * 1_000);
    expect(update.detail).toContain(`stage cleanup skipped: ${recentBackup}: recent stage`);
    expect(existsSync(recentBackup)).toBe(true);
    expect(readFileSync(join(destination, "SKILL.md"), "utf8")).toBe(`${content}Updated binary skill.\n`);
    const failureStage = stage(".herdr-stage-stop12");
    const movedRoot = join(root, "moved-skills");
    renameSync(skills, movedRoot); symlinkSync(movedRoot, skills, "dir");
    const failed = configureRequiredHerdrSkill(host, env);
    expect(failed.status).toBe("failed");
    expect(failed.detail).toContain("non-canonical host skill root");
    expect(existsSync(failureStage)).toBe(true);
    expect(failed.detail).not.toContain("stage cleanup");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

interface HcStepRow {
  readonly label: string;
  /** The hc version on PATH before the step; null: no hc on PATH. */
  readonly before: string | null;
  readonly platform: string;
  readonly served: "pinned" | "tampered" | "absent" | "wrong-version" | "no-conpty";
  readonly existing?: "herdr-core" | "hc";
  readonly updateFails?: boolean;
  readonly updateLeavesVersion?: boolean;
  readonly installDirOnPath?: boolean;
  /** Windows: the fake powershell.exe fails its user PATH write. */
  readonly userPathFails?: boolean;
  /** Windows: user PATH writes through powershell.exe. */
  readonly userPathCalls?: number;
  readonly status: "ok" | "failed";
  readonly requests: number;
  readonly installed: boolean;
  readonly hcCalls: readonly string[];
  /** Text that the step detail contains; a function gets the install dir. */
  readonly detail?: string | ((installDir: string) => string);
}

const HC_STEP_ROWS: readonly HcStepRow[] = [
  { label: "missing: installs the pinned asset", before: null, platform: "darwin-arm64", served: "pinned", installDirOnPath: true, status: "ok", requests: 1, installed: true, hcCalls: [] },
  { label: "missing: a dir not on PATH installs with a hint", before: null, platform: "darwin-arm64", served: "pinned", status: "ok", requests: 1, installed: true, hcCalls: [], detail: "to PATH to use hc" },
  { label: "missing: a sha256 mismatch installs nothing", before: null, platform: "darwin-arm64", served: "tampered", status: "failed", requests: 1, installed: false, hcCalls: [], detail: "sha256 mismatch" },
  { label: "missing: a failed download installs nothing", before: null, platform: "darwin-arm64", served: "absent", status: "failed", requests: 1, installed: false, hcCalls: [], detail: "download of" },
  { label: "missing: an hc of another version installs nothing", before: null, platform: "darwin-arm64", served: "wrong-version", status: "failed", requests: 1, installed: false, hcCalls: [], detail: "the downloaded hc reports 0.0.1" },
  { label: "missing: an existing herdr-core file is not overwritten", before: null, platform: "darwin-arm64", served: "pinned", existing: "herdr-core", status: "failed", requests: 0, installed: false, hcCalls: [],
    detail: dir => `refusing to overwrite it; add ${dir} to PATH, then rerun repo-harness update` },
  { label: "missing: a dangling hc link is not overwritten", before: null, platform: "darwin-arm64", served: "pinned", existing: "hc", status: "failed", requests: 0, installed: false, hcCalls: [],
    detail: dir => `refusing to overwrite it; add ${dir} to PATH, then rerun repo-harness update` },
  { label: "missing on Windows: installs herdr-core.exe, conpty and the hc.exe hard link, and adds the dir to the user PATH", before: null, platform: "win32-x64", served: "pinned", status: "ok", requests: 1, installed: true, hcCalls: [],
    userPathCalls: 1, detail: "to the user PATH: new terminals have hc; this run uses it for its later steps" },
  { label: "missing on Windows: a failed user PATH write fails the step", before: null, platform: "win32-x64", served: "pinned", userPathFails: true, status: "failed", requests: 1, installed: true, hcCalls: [],
    userPathCalls: 1, detail: "to the user PATH failed: registry access denied" },
  { label: "missing on Windows: a zip without conpty installs nothing", before: null, platform: "win32-x64", served: "no-conpty", status: "failed", requests: 1, installed: false, hcCalls: [], userPathCalls: 0, detail: "holds no complete hc (missing conpty, conpty/conpty.dll)" },
  { label: "missing: no pin target for the platform", before: null, platform: "win32-arm64", served: "pinned", status: "failed", requests: 0, installed: false, hcCalls: [],
    detail: `no herdr-core release asset for win32-arm64; install hc >=${HC_MIN_VERSION} manually (Herdr.app or a herdr-core release), then run repo-harness update` },
  { label: "below the floor: hc update --version", before: "0.1.15", platform: "darwin-arm64", served: "pinned", status: "ok", requests: 0, installed: false,
    hcCalls: ["--version", `update --version ${HC_MIN_VERSION}`, "--version"], detail: `hc client 0.1.15 was below the repo-harness floor ${HC_MIN_VERSION}; hc update --version ${HC_MIN_VERSION} updated it to ${HC_MIN_VERSION}` },
  { label: "below the floor: a failed hc update stops", before: "0.1.15", platform: "darwin-arm64", served: "pinned", updateFails: true, status: "failed", requests: 0, installed: false,
    hcCalls: ["--version", `update --version ${HC_MIN_VERSION}`], detail: `hc client 0.1.15 is below the repo-harness floor ${HC_MIN_VERSION}; hc update --version ${HC_MIN_VERSION} failed: hc: managed install; update it with its package manager` },
  { label: "below the floor: hc update leaves the client below the floor", before: "0.1.15", platform: "darwin-arm64", served: "pinned", updateLeavesVersion: true, status: "failed", requests: 0, installed: false,
    hcCalls: ["--version", `update --version ${HC_MIN_VERSION}`, "--version"], detail: `hc update --version ${HC_MIN_VERSION} left hc client 0.1.15 below the repo-harness floor ${HC_MIN_VERSION}` },
  { label: "at the floor: no change", before: HC_MIN_VERSION, platform: "darwin-arm64", served: "pinned", status: "ok", requests: 0, installed: false, hcCalls: ["--version"] },
  { label: "above the floor: no change", before: "99.0.0", platform: "darwin-arm64", served: "pinned", status: "ok", requests: 0, installed: false, hcCalls: ["--version"] },
];

test.each(HC_STEP_ROWS.map(row => [row.label, row] as const))("herdr-core install step, %s", async (_label, row) => {
  const root = mkdtempSync(join(tmpdir(), "repo-harness-hc-step-"));
  const windows = row.platform.startsWith("win32");
  const release = join(root, "release"), pkg = join(root, "pkg"), home = join(root, "home"), fakeBin = join(root, "bin");
  const localAppData = join(root, "LocalAppData"), systemRoot = join(root, "Windows");
  const installDir = windows ? join(localAppData, "Programs", "herdr-core") : join(home, ".local", "bin");
  for (const dir of [release, pkg, fakeBin, installDir, join(systemRoot, "System32")]) mkdirSync(dir, { recursive: true });
  const server = startFakeHcRelease(root, release);
  try {
    // The official archive layout. The Windows zip is a tar.gz here: the fake tar.exe is the host tar.
    const binary = windows ? "herdr-core.exe" : "herdr-core";
    writeFileSync(join(pkg, binary), `#!/bin/sh\necho "hc ${row.served === "wrong-version" ? "0.0.1" : HC_MIN_VERSION}"\n`, { mode: 0o755 });
    if (windows && row.served !== "no-conpty") { mkdirSync(join(pkg, "conpty")); writeFileSync(join(pkg, "conpty", "conpty.dll"), "dll\n"); }
    writeFileSync(join(systemRoot, "System32", "tar.exe"), '#!/bin/sh\nexec tar "$@"\n', { mode: 0o755 });
    // A fake powershell.exe: it logs the encoded command and prints what the registry script prints.
    mkdirSync(join(systemRoot, "System32", "WindowsPowerShell", "v1.0"), { recursive: true });
    writeFileSync(join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), `#!/bin/sh\nprintf '%s\\n' "$4" >> "${root}/powershell.log"\n`
      + (row.userPathFails ? "echo 'registry access denied' >&2; exit 1\n" : "echo added\n"), { mode: 0o755 });
    expect(spawnSync("tar", ["-czf", join(root, "asset"), "-C", pkg, "."]).status).toBe(0);
    const archive = readFileSync(join(root, "asset"));
    const assetFile = windows ? "herdr-core-windows-x86_64.zip" : "herdr-core-macos-aarch64.tar.gz";
    if (row.served !== "absent") writeFileSync(join(release, assetFile), row.served === "tampered" ? Buffer.concat([archive, Buffer.from("x")]) : archive);
    // Neither entry is an hc on PATH: a user file named herdr-core, and a link to a removed binary.
    if (row.existing === "herdr-core") writeFileSync(join(installDir, "herdr-core"), "user file\n");
    if (row.existing === "hc") symlinkSync("removed-herdr-core", join(installDir, "hc"));
    // A fake hc: it logs each call; `update --version X` sets its version to X.
    if (row.before !== null) {
      writeFileSync(join(root, "hc-version"), row.before);
      writeFileSync(join(fakeBin, "hc"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${root}/hc-argv.log"\n`
        + `if [ "$1" = update ]; then ${row.updateFails ? `echo 'hc: managed install; update it with its package manager' >&2; exit 1` : row.updateLeavesVersion ? 'exit 0' : `printf '%s' "$3" > "${root}/hc-version"; exit 0`}; fi\n`
        + `printf 'hc %s\\n' "$(cat "${root}/hc-version")"\n`, { mode: 0o755 });
    }
    const port = await server.port;
    const sha256 = createHash("sha256").update(archive).digest("hex");
    const { step, pathEntry } = ensureHerdrCore({
      cwd: root, command: "update", platform: row.platform, minVersion: HC_MIN_VERSION,
      assets: Object.fromEntries(["macos-aarch64", "windows-x86_64"].map(name => [name, { url: `http://127.0.0.1:${port}/${assetFile}`, sha256 }])),
      env: { HOME: home, LOCALAPPDATA: localAppData, SystemRoot: systemRoot, PATH: `${row.installDirOnPath ? `${installDir}:` : ""}${fakeBin}:/usr/bin:/bin` },
    });
    expect(step.status, step.detail).toBe(row.status);
    if (row.detail !== undefined) expect(step.detail).toContain(typeof row.detail === "string" ? row.detail : row.detail(installDir));
    if (row.installDirOnPath) expect(step.detail).not.toContain("to PATH");
    expect(pathEntry).toBe(row.status === "ok" && row.installed && !row.installDirOnPath ? installDir : null);
    expect(server.requests()).toHaveLength(row.requests);
    expect(existsSync(join(root, "hc-argv.log")) ? readFileSync(join(root, "hc-argv.log"), "utf8").split("\n").filter(Boolean) : []).toEqual([...row.hcCalls]);
    const userPathCommands = existsSync(join(root, "powershell.log")) ? readFileSync(join(root, "powershell.log"), "utf8").split("\n").filter(Boolean) : [];
    expect(userPathCommands).toHaveLength(row.userPathCalls ?? 0);
    for (const command of userPathCommands) {
      const script = Buffer.from(command, "base64").toString("utf16le");
      expect(script).toContain(`$dir = '${installDir}'`);
      expect(script).toContain("DoNotExpandEnvironmentNames");
    }
    if (row.existing === "herdr-core") expect(readFileSync(join(installDir, "herdr-core"), "utf8")).toBe("user file\n");
    if (row.existing === "hc") expect(readlinkSync(join(installDir, "hc"))).toBe("removed-herdr-core");
    if (!row.installed) {
      if (row.existing === undefined) expect(readdirSync(installDir)).toEqual([]);
    } else if (windows) {
      expect(readdirSync(installDir).sort()).toEqual(["conpty", "hc.exe", "herdr-core.exe"]);
      expect(existsSync(join(installDir, "conpty", "conpty.dll"))).toBe(true);
      expect(lstatSync(join(installDir, "hc.exe")).ino).toBe(lstatSync(join(installDir, "herdr-core.exe")).ino);
    } else {
      expect(readdirSync(installDir).sort()).toEqual(["hc", "herdr-core"]);
      expect(readlinkSync(join(installDir, "hc"))).toBe("herdr-core");
      expect(spawnSync(join(installDir, "hc"), ["--version"], { encoding: "utf8" }).stdout).toBe(`hc ${HC_MIN_VERSION}\n`);
    }
  } finally {
    server.stop();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, symlinkSync, utimesSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
