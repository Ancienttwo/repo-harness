import { renderHerdrSkill } from "../src/cli/commands/herdr-skill-render.mjs";
import { defaultPolicy } from "../src/effects/adoption/standard-plan";
import { describe, expect, test, spyOn } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { run, withTempRepo } from "./helpers/repo-fixture";
import { configureRequiredHerdrSkill } from "../src/cli/commands/herdr-skill";

/**
 * `.ai/harness/policy.json#external_tooling.herdr` is the single herdr runtime
 * pin. These are drift checks for its readers: CI, the readiness script, and the
 * downstream policy seed must derive the floor, URL, and checksum from that key
 * instead of restating them.
 */
const ROOT = join(import.meta.dir, "..");
const POLICY_PATH = join(ROOT, ".ai/harness/policy.json");
const CI_PATH = join(ROOT, ".github/workflows/ci.yml");
const SCRIPT_PATH = join(ROOT, "scripts/check-agent-tooling.sh");
const SEED_PATHS = [
  join(ROOT, "scripts/lib/project-init-lib.sh"),
];

function readPolicy() {
  return JSON.parse(readFileSync(POLICY_PATH, "utf8"));
}

function herdrInstallStep(actionName = 'install-pinned-herdr') {
  const action = Bun.YAML.parse(readFileSync(join(ROOT, `.github/actions/${actionName}/action.yml`), 'utf8')) as {
    runs: { using: string; steps: Array<{ shell: string; run: string }> };
  };
  expect(action.runs.using).toBe('composite');
  expect(action.runs.steps).toHaveLength(1);
  expect(action.runs.steps[0]!.shell).toBe('bash');
  return action.runs.steps[0]!.run;

}

describe("herdr runtime pin has one source of truth", () => {
  test("the pin parses and its release URL embeds the pinned version", () => {
    const herdr = readPolicy().external_tooling?.herdr;
    expect(herdr).toBeDefined();
    expect(herdr.min_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(herdr.min_version).toBe("0.9.5");
    for (const platform of ['linux-x86_64', 'macos-aarch64', 'macos-x86_64']) {
      const asset = herdr.release_assets?.[platform];
      expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset?.url).toContain(`/v${herdr.min_version}/herdr-${platform}`);
    }
  });

  test("the CI install step reads the pin instead of restating it", () => {
    const workflow = Bun.YAML.parse(readFileSync(CI_PATH, 'utf8')) as {
      jobs: Record<string, { steps: Array<{ name?: string; uses?: string }> }>;
    };
    for (const job of ['verify', 'test']) {
      expect(workflow.jobs[job]!.steps.some(step => step.name === 'Install pinned Herdr runtime'
        && step.uses === './.github/actions/install-pinned-herdr')).toBe(true);
    }
    const step = herdrInstallStep();
    expect(step).toContain(".ai/harness/policy.json");
    expect(step).toContain(".external_tooling.herdr.min_version");
    expect(step).toContain("sha256sum --check");
    expect(step).toContain('"$bin/herdr" --version');
    expect(step).toContain('shasum -a 256 --check');
    expect(step).toContain('GITHUB_PATH');
    const nativeSteps = workflow.jobs['native-oar']!.steps as Array<{ name?: string; uses?: string; if?: string }>;
    const install = nativeSteps.findIndex(step => step.uses === './.github/actions/install-pinned-herdr');
    const native = nativeSteps.findIndex(step => step.name === 'Run native OAR acceptance tests');
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(native);
    expect(nativeSteps[install]!.if).toBeUndefined();
    // No hardcoded version, release tag, or checksum may survive in the step.
    expect(step).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(step).not.toMatch(/[0-9a-f]{64}/);
  });

  test("the herdr-core pin names an official release asset for each CI runner platform", () => {
    const core = readPolicy().external_tooling?.herdr_core;
    expect(core.min_version).toBe("0.1.17");
    for (const platform of ['linux-x86_64', 'macos-aarch64', 'macos-x86_64']) {
      const asset = core.release_assets?.[platform];
      expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset?.url).toBe(`https://releases.herdr.dev/core/${core.min_version}/herdr-core-${platform}.tar.gz`);
    }
  });

  test("each job that installs classic herdr also installs the pinned hc before its tests", () => {
    const workflow = Bun.YAML.parse(readFileSync(CI_PATH, 'utf8')) as {
      jobs: Record<string, { steps: Array<{ name?: string; uses?: string; if?: string; run?: string }> }>;
    };
    for (const job of ['native-oar', 'verify', 'test']) {
      const steps = workflow.jobs[job]!.steps;
      const classic = steps.findIndex(step => step.uses === './.github/actions/install-pinned-herdr');
      const core = steps.findIndex(step => step.name === 'Install pinned herdr-core runtime'
        && step.uses === './.github/actions/install-pinned-herdr-core');
      expect(classic, job).toBeGreaterThan(-1);
      expect(core, job).toBe(classic + 1);
      expect(steps[core]!.if, job).toBeUndefined();
    }
    const step = herdrInstallStep('install-pinned-herdr-core');
    expect(step).toContain(".external_tooling.herdr_core.min_version");
    expect(step).toContain(".external_tooling.herdr_core.release_assets[$asset]");
    expect(step).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(step).not.toMatch(/[0-9a-f]{64}/);
  });

  test.each([
    ["the pinned digest", true],
    ["a wrong digest", false],
  ])("the herdr-core install with %s", (_label, digestMatches) => withTempRepo('hc-install', root => {
    const version = readPolicy().external_tooling.herdr_core.min_version;
    mkdirSync(join(root, 'pkg'));
    writeFileSync(join(root, 'pkg/herdr-core'), `#!/bin/sh\necho "hc ${version}"\n`, { mode: 0o755 });
    expect(run('tar', ['-czf', 'asset.tar.gz', '-C', 'pkg', 'herdr-core'], root).status).toBe(0);
    const digest = new Bun.CryptoHasher('sha256').update(readFileSync(join(root, 'asset.tar.gz'))).digest('hex');
    const asset = { url: `file://${join(root, 'asset.tar.gz')}`, sha256: digestMatches ? digest : '0'.repeat(64) };
    const release_assets = Object.fromEntries(['linux-x86_64', 'macos-aarch64', 'macos-x86_64'].map(platform => [platform, asset]));
    mkdirSync(join(root, '.ai/harness'), { recursive: true });
    writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ external_tooling: { herdr_core: { min_version: version, release_assets } } }));
    mkdirSync(join(root, 'runner'));
    const result = run('bash', ['-c', herdrInstallStep('install-pinned-herdr-core')], root, {
      RUNNER_TEMP: join(root, 'runner'), GITHUB_PATH: join(root, 'github-path'),
    });
    expect(result.status, result.stderr).toBe(digestMatches ? 0 : 1);
    expect(existsSync(join(root, 'runner/herdr-core-bin/hc'))).toBe(digestMatches);
    expect(existsSync(join(root, 'github-path'))).toBe(digestMatches);
    if (digestMatches) expect(result.stdout).toContain(`hc ${version}`);
  }));

  test("check-agent-tooling.sh carries no hand-coded herdr version floor", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    expect(script).toContain('".ai/harness/policy.json#external_tooling.herdr"');
    expect(script).toContain('".ai/harness/policy.json#external_tooling.herdr_core"');
    expect(script).toContain("external_tooling?.[key]?.min_version");
    expect(script).toContain('"herdr", HERDR_PIN_KEY,');
    expect(script).toContain('"herdr_core", HERDR_CORE_PIN_KEY,');
    const herdrLines = script.split("\n").filter((line) => /herdr/i.test(line));
    expect(herdrLines.length).toBeGreaterThan(0);
    // The shared pin reader and floor check carry no "herdr" text, so scan their whole bodies.
    for (const name of ["pinnedMinVersion", "pinnedRuntimeCapability"]) {
      const start = script.indexOf(`\nfunction ${name}(`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      herdrLines.push(...script.slice(start, script.indexOf("\n}\n", start)).split("\n"));
    }
    for (const line of herdrLines) {
      expect(line).not.toMatch(/\d+\.\d+\.\d+/);
      expect(line).not.toMatch(/minor\s*[<>]=?\s*\d|\[2\]\)\s*[<>]/);
    }
  });

  test.each(["herdr", "herdr_core"])("the downstream policy seed projects the same %s pin", key => {
    const pin = readPolicy().external_tooling[key];
    expect(pin).toBeDefined();
    expect((defaultPolicy("minimal-agentic", "en").external_tooling as Record<string, unknown>)[key]).toEqual(pin);
    for (const seedPath of SEED_PATHS) {
      const seed = readFileSync(seedPath, "utf8");
      const start = seed.indexOf(`    "${key}": {`);
      expect(start, seedPath).toBeGreaterThanOrEqual(0);
      // The block ends at the first closing brace at its own indent, with or without a trailing comma.
      const block = seed.slice(start, start + seed.slice(start).search(/\n    }/) + "\n    }".length);
      expect(JSON.parse(`{${block}}`), seedPath).toEqual({ [key]: pin });
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
    expect(configureRequiredHerdrSkill("both", env).status).toBe("failed");
    expect(readFileSync(claudeSkill, "utf8")).toBe("# user change\n");
    expect(readFileSync(join(home, ".codex", "skills", "herdr", "SKILL.md"), "utf8")).toBe(renderHerdrSkill(afterCleanupFailure));
    expect(existsSync(join(home, ".codex", "skills", "herdr", ".repo-harness-owner.json"))).toBe(true);
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

import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
