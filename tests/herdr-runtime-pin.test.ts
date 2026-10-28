import { renderHerdrSkill } from "../src/cli/commands/herdr-skill-render.mjs";
import { defaultPolicy } from "../src/effects/adoption/standard-plan";
import { describe, expect, test, spyOn } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { configureRequiredHerdrSkill } from "../src/cli/commands/herdr-skill";
import { HERDR_OBSERVATION_PROTOCOL, HERDR_OBSERVATION_REVISION, HERDR_OBSERVATION_VERSION } from "../src/core/operator/herdr-pin";

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

function herdrInstallStep() {
  const action = Bun.YAML.parse(readFileSync(join(ROOT, '.github/actions/install-pinned-herdr/action.yml'), 'utf8')) as {
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

  test("check-agent-tooling.sh carries no hand-coded herdr version floor", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    expect(script).toContain('".ai/harness/policy.json#external_tooling.herdr"');
    expect(script).toContain("external_tooling?.herdr?.min_version");
    const herdrLines = script.split("\n").filter((line) => /herdr/i.test(line));
    expect(herdrLines.length).toBeGreaterThan(0);
    for (const line of herdrLines) {
      expect(line).not.toMatch(/\d+\.\d+\.\d+/);
      expect(line).not.toMatch(/minor\s*[<>]=?\s*\d|\[2\]\)\s*[<>]/);
    }
  });

  test("the downstream policy seed projects the same pin", () => {
    const herdr = readPolicy().external_tooling.herdr;
    expect((defaultPolicy("minimal-agentic", "en").external_tooling as Record<string, unknown>).herdr).toEqual(herdr);
    const expected = JSON.stringify(herdr, null, 2)
      .split("\n")
      .map((line) => line.trim());
    for (const seedPath of SEED_PATHS) {
      const seed = readFileSync(seedPath, "utf8");
      const start = seed.indexOf('    "herdr": {');
      expect(start, seedPath).toBeGreaterThanOrEqual(0);
      const block = seed
        .slice(start, seed.indexOf("\n    }\n", start) + "\n    }".length)
        .split("\n")
        .map((line) => line.trim());
      expect(block.slice(1), seedPath).toEqual(expected.slice(1));
    }
  });

  test("the install floor equals the observation pin, because observation matches the version exactly", () => {
    // A lower floor would let setup install a server that observation then rejects.
    expect(readPolicy().external_tooling.herdr.min_version).toBe(HERDR_OBSERVATION_VERSION);
  });

  test("the runtime status doc restates the pin it describes", () => {
    const doc = readFileSync(join(ROOT, 'docs/kanban-runtime-status.md'), 'utf8');
    expect(doc).toContain(`requires reported version ${HERDR_OBSERVATION_VERSION} and protocol ${HERDR_OBSERVATION_PROTOCOL}`);
    expect(doc).toContain(`requires exactly ${HERDR_OBSERVATION_VERSION} and protocol ${HERDR_OBSERVATION_PROTOCOL}`);
    expect(doc).toContain(`upstream v${HERDR_OBSERVATION_VERSION} \`${HERDR_OBSERVATION_REVISION}\``);
  });

  test("the browser bundle reads the pin instead of restating it", () => {
    // operator-web builds without Node built-ins, so the pin must stay in core.
    const pin = readFileSync(join(ROOT, 'src/core/operator/herdr-pin.ts'), 'utf8');
    expect(pin).not.toMatch(/from '(node:|\.[^']*(effects|operator-web)\b)/);
    // The fixture's expected pin is what went stale before, so it must derive.
    // Reported client and server versions stay literals: they are scenario data.
    const fixture = readFileSync(join(ROOT, 'src/operator-web/fixtures/bots.ts'), 'utf8');
    const expected = fixture.split('\n').find(line => line.startsWith('const EXPECTED = '));
    expect(expected).toBeDefined();
    expect(expected).toContain('HERDR_OBSERVATION_VERSION');
    expect(expected).toContain('HERDR_OBSERVATION_PROTOCOL');
    expect(expected).toContain('HERDR_OBSERVATION_REVISION');
    expect(fixture).not.toMatch(/[0-9a-f]{40}/);
  });
});

test("Herdr skill replaces the environment-only gate and preserves binary command instructions", () => {
  const upstream = "---\nname: herdr\ndescription: Requires HERDR_ENV=1.\n---\n# Herdr\nIf the check fails, say that you are not running inside Herdr and stop.\n\n## Learn the current CLI\nUse the binary help.\n";
  const rendered = renderHerdrSkill(upstream);
  expect(rendered).not.toContain("say that you are not running inside Herdr and stop");
  expect(rendered).not.toContain("Requires HERDR_ENV=1.");
  expect(rendered).toContain("Missing variables do not prove");
  expect(rendered).toContain("herdr --session <owned-session>");
  expect(rendered).toContain("Read-only discovery does not require");
  expect(rendered).toContain("If no suitable reviewer exists, create a new pane");
  expect(rendered.endsWith("## Learn the current CLI\nUse the binary help.\n")).toBe(true);
  expect(() => renderHerdrSkill("---\nname: herdr\n---\nChanged upstream layout\n")).toThrow();
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
    const upstream = "---\nname: herdr\n---\n\n## Learn the current CLI\nPackage CLI instructions.\n";
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
    const herdr = join(bin, "herdr");
    writeFileSync(herdr, "#!/bin/sh\ncat \"$FIXTURE_SKILL_FILE\"\n");
    chmodSync(herdr, 0o755);
    const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH ?? ""}`, FIXTURE_SKILL_FILE: source };
    const first = "---\nname: herdr\n---\nCheck HERDR_ENV before control.\n\n## Learn the current CLI\n";
    writeFileSync(source, first);
    expect(configureRequiredHerdrSkill("both", env).status).toBe("ok");
    for (const host of [".claude", ".codex"]) {
      expect(readFileSync(join(home, host, "skills", "herdr", "SKILL.md"), "utf8")).toBe(renderHerdrSkill(first));
    }

    const shared = join(home, ".agents", "skills", "herdr");
    mkdirSync(shared, { recursive: true });
    for (const file of ["SKILL.md", ".repo-harness-owner.json"]) {
      writeFileSync(join(shared, file), readFileSync(join(home, ".codex", "skills", "herdr", file)));
    }
    const next = `${first}Use herdr agent list.\n`;
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
    writeFileSync(source, "---\nname: herdr\n---\nCheck HERDR_ENV before control.\n\n## Learn the current CLI\n");
    const herdr = join(bin, "herdr");
    writeFileSync(herdr, "#!/bin/sh\ncat \"$FIXTURE_SKILL_FILE\"\n");
    chmodSync(herdr, 0o755);
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
    const upstream = "---\nname: herdr\n---\nCheck HERDR_ENV before control.\n\n## Learn the current CLI\n";
    const content = renderHerdrSkill(upstream);
    const source = join(root, "skill.md");
    writeFileSync(source, upstream);
    writeFileSync(join(bin, "herdr"), '#!/bin/sh\ncat "$FIXTURE_SKILL_FILE"\n');
    chmodSync(join(bin, "herdr"), 0o755);
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

// These fixtures replace only external I/O. They run the shipped command and plugin.
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { askMasked } from '../src/cli/commands/herdr';
import { labelDecision } from '../src/effects/terminal/herdr-decision';
import { acquireExclusiveDirectoryLock } from '../src/effects/locking/exclusive-directory-lock';
import { currentProcessStartTime } from '../src/effects/locking/process-start-time';

function notifyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'rh-herdr-notify-'));
  // Use an existing non-temporary directory as read-only event context.
  const workspace = dirname(realpathSync('/tmp'));
  const home = join(root, 'home');
  const config = join(root, 'config');
  const state = join(root, 'state');
  const bin = join(root, 'bin');
  for (const dir of [home, config, state, bin]) mkdirSync(dir);
  const tail = join(root, 'tail.txt');
  writeFileSync(tail, 'Result: complete.', { encoding: 'utf8', mode: 0o600 });
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), REPO_HARNESS_HOME: join(home, '.repo-harness'),
    PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    FIXTURE_CONFIG: config, FIXTURE_CALLS: join(root, 'calls.jsonl'), FIXTURE_TAIL_FILE: tail };
  for (const key of Object.keys(env)) if (key.startsWith('HERDR_') || /^(WEBHOOK_|SLACK_|DISCORD_|TELEGRAM_)/.test(key)) delete (env as NodeJS.ProcessEnv)[key];
  const shim = join(bin, 'herdr');
  writeFileSync(shim, `#!${process.execPath}\nimport {appendFileSync,mkdirSync,readFileSync} from 'node:fs';\nconst args=process.argv.slice(2);\nappendFileSync(process.env.FIXTURE_CALLS,JSON.stringify({args,secret:process.env.WEBHOOK_KEY??null})+'\\n');\nif(process.env.FIXTURE_FAIL&&process.env.FIXTURE_FAIL===args[3]) { console.error('private '+process.env.FIXTURE_PRIVATE);process.exit(1); }\nif(args[0]==='pane'&&args[1]==='read') { if(process.env.FIXTURE_PANE_FAIL)process.exit(1); console.log(readFileSync(process.env.FIXTURE_TAIL_FILE,'utf8')); }\nif(args[3]==='config-dir'||(args[0]==='plugin'&&args[1]==='config-dir')) { mkdirSync(process.env.FIXTURE_CONFIG,{recursive:true}); console.log(process.env.FIXTURE_CONFIG); }\nif(args[3]==='list') console.log(process.env.FIXTURE_LIST_OUTPUT??JSON.stringify({id:'cli:plugin',result:{type:'plugin_list',plugins:JSON.parse(process.env.FIXTURE_PLUGINS??'[]')}}));\n`);
  chmodSync(shim, 0o755);
  const run = (args: string[] = [], extra: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath,
    [join(ROOT, 'src/cli/index.ts'), 'herdr', 'notify', 'install', '--session', 'notify-test', '--non-interactive', ...args],
    { env: { ...env, ...extra }, encoding: 'utf8', timeout: 20_000 });
  // The record the operator readers take the Herdr session from.
  const record = join(home, '.repo-harness', 'herdr', 'notify-install.json');
  return { root, workspace, home, config, state, env, run, record, cleanup: () => {
    rmSync(root, { recursive: true, force: true });
  } };
}

const botFlags = ['--webhook-url', 'https://bot.example/routine', '--webhook-key', 'fixture-secret-key'];

describe('Herdr notify install', () => {
  test.each(['0.1.0', '0.2.0'])('a foreign local plugin at %s requires manual unlink before installation', version => {
    const fixture = notifyFixture();
    try {
      const foreign = join(fixture.home, 'foreign-plugin'); mkdirSync(foreign);
      writeFileSync(join(foreign, 'herdr-plugin.toml'), `version = "${version}"\n`);
      writeFileSync(join(fixture.config, '.env'), 'keep config');
      const result = fixture.run(botFlags, { FIXTURE_PLUGINS: JSON.stringify([
        { plugin_id: 'aimpact.webhook-notify', version, plugin_root: foreign, source: { kind: 'local' } },
      ]) });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('another source');
      expect(result.stderr).toContain('herdr --session notify-test plugin unlink aimpact.webhook-notify');
      expect(result.stderr).toContain('repo-harness herdr notify install --session notify-test');
      expect(result.stdout + result.stderr).not.toContain('fixture-secret-key');
      expect(readFileSync(join(fixture.config, '.env'), 'utf8')).toBe('keep config');
      expect(readFileSync(join(foreign, 'herdr-plugin.toml'), 'utf8')).toBe(`version = "${version}"\n`);
      expect(existsSync(join(fixture.config, 'source'))).toBe(false);
      const calls = readFileSync(fixture.env.FIXTURE_CALLS, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls.map(call => call.args[3])).toEqual(['list', 'config-dir']);
    } finally { fixture.cleanup(); }
  });

  test('a foreign managed plugin stops before the config directory is created', () => {
    const fixture = notifyFixture();
    try {
      rmSync(fixture.config, { recursive: true });
      const result = fixture.run(botFlags, { FIXTURE_PLUGINS: JSON.stringify([
        { plugin_id: 'aimpact.webhook-notify', version: '0.2.0', plugin_root: join(fixture.home, 'managed-plugin'), source: { kind: 'github' } },
      ]) });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('another source');
      expect(existsSync(fixture.config)).toBe(false);
      const calls = readFileSync(fixture.env.FIXTURE_CALLS, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls.map(call => call.args[3])).toEqual(['list']);
    } finally { fixture.cleanup(); }
  });

  test('an older installer-owned local plugin is updated in place', () => {
    const fixture = notifyFixture();
    try {
      const source = join(fixture.config, 'source'); mkdirSync(source);
      writeFileSync(join(source, 'herdr-plugin.toml'), 'version = "0.1.0"\n');
      const result = fixture.run(botFlags, { FIXTURE_PLUGINS: JSON.stringify([
        { plugin_id: 'aimpact.webhook-notify', version: '0.1.0', plugin_root: source, source: { kind: 'local' } },
      ]) });
      expect(result.status).toBe(0);
      expect(readFileSync(join(source, 'herdr-plugin.toml'), 'utf8')).toBe(readFileSync(join(ROOT, 'assets/herdr/webhook-notify/herdr-plugin.toml'), 'utf8'));
    } finally { fixture.cleanup(); }
  });

  test.each(['private-invalid-json', '{}', '{"result":{"type":"plugin_list","plugins":{}}}',
    '{"result":{"type":"plugin_list","plugins":[{}]}}'])('invalid plugin inventory fails closed: %s', inventory => {
    const fixture = notifyFixture();
    try {
      rmSync(fixture.config, { recursive: true });
      const result = fixture.run(botFlags, { FIXTURE_LIST_OUTPUT: inventory });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('No files were changed');
      expect(existsSync(fixture.config)).toBe(false);
      expect(result.stdout + result.stderr).not.toContain('private-invalid-json');
      expect(existsSync(join(fixture.config, 'source'))).toBe(false);
      expect(existsSync(join(fixture.config, '.env'))).toBe(false);
    } finally { fixture.cleanup(); }
  });

  test('CLI links a durable source, writes private config, and enables it without leaking credentials', async () => {
    const fixture = notifyFixture();
    try {
      const result = fixture.run([...botFlags, '--slack-webhook-url', 'https://slack.example/secret',
        '--discord-webhook-url', 'https://discord.example/secret', '--telegram-bot-token', '123:token', '--telegram-chat-id', '-42', '--slack-notify-done']);
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).not.toContain('fixture-secret-key');
      expect(result.stdout + result.stderr).not.toContain('/secret');
      const path = join(fixture.config, '.env');
      expect(statSync(path).mode & 0o777).toBe(0o600);
      const config = parseEnv(readFileSync(path, 'utf8'));
      expect(config.WEBHOOK_KEY).toBe('fixture-secret-key');
      expect(config.NOTIFY_SESSION).toBe('notify-test');
      expect(config.WEBHOOK_NOTIFY_DONE).toBe('0');
      expect(config.SLACK_NOTIFY_DONE).toBe('1');
      expect(config.DISCORD_NOTIFY_DONE).toBe('0');
      expect(config.TELEGRAM_NOTIFY_DONE).toBe('0');
      const calls = readFileSync(fixture.env.FIXTURE_CALLS, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls.map(call => call.args)).toEqual([
        ['--session', 'notify-test', 'plugin', 'list', '--plugin', 'aimpact.webhook-notify', '--json'],
        ['--session', 'notify-test', 'plugin', 'config-dir', 'aimpact.webhook-notify'],
        ['--session', 'notify-test', 'plugin', 'link', join(fixture.config, 'source'), '--disabled'],
        ['--session', 'notify-test', 'plugin', 'enable', 'aimpact.webhook-notify'],
      ]);
      expect(calls.every(call => call.secret === null)).toBe(true);
      // The install record holds exactly the session: no secret, path or time.
      expect(readFileSync(fixture.record, 'utf8')).toBe('{"protocol":1,"kind":"herdr_notify_install","session":"notify-test"}\n');
      expect(statSync(fixture.record).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(fixture.record)).mode & 0o777).toBe(0o700);
      for (const name of ['herdr-plugin.toml', 'notify.mjs', 'worktree-location.mjs']) expect(readFileSync(join(fixture.config, 'source', name), 'utf8')).toBe(readFileSync(join(ROOT, 'assets/herdr/webhook-notify', name), 'utf8'));
      const { notify: installedNotify } = await import(join(fixture.config, 'source/notify.mjs'));
      const delivered: string[] = [];
      await installedNotify({ ...fixture.env, HERDR_SESSION: 'notify-test', HERDR_PLUGIN_CONFIG_DIR: fixture.config,
        HERDR_PLUGIN_STATE_DIR: fixture.state,
        HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane_agent_status_changed', data: { pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: 'done' } }),
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: fixture.workspace }),
      }, async (url: string) => { delivered.push(url); return new Response('{"ok":true}'); });
      expect(delivered).toEqual(['https://slack.example/secret']);
      chmodSync(path, 0o644);
      expect(fixture.run([], { WEBHOOK_URL: 'https://bot.example/routine', WEBHOOK_KEY: 'changed-key' }).status).toBe(0);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(parseEnv(readFileSync(path, 'utf8')).WEBHOOK_KEY).toBe('changed-key');
    } finally { fixture.cleanup(); }
  });

  test('shadow install uses env-only token, installs the projection and rejects future modes', () => {
    const f = notifyFixture();
    try {
      const extra = { CLOUDFLARE_API_TOKEN: 'fixture-clef-token' };
      const args = [...botFlags, '--clef-mode', 'shadow', '--cloudflare-account-id', 'a'.repeat(32)];
      const result = f.run(args, extra);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout + result.stderr).not.toContain('fixture-clef-token');
      expect(parseEnv(readFileSync(join(f.config, '.env'), 'utf8'))).toMatchObject({ CLEF_MODE: 'shadow', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'fixture-clef-token' });
      expect(readFileSync(join(f.config, 'source/pane-status.mjs'), 'utf8')).toBe(readFileSync(join(ROOT, 'src/core/decision/pane-status.mjs'), 'utf8'));
      for (const mode of ['copilot', 'autopilot', 'bad']) expect(f.run([...botFlags, '--clef-mode', mode], extra).status).toBe(1);
      expect(f.run(args).status).toBe(1);
      expect(f.run(botFlags, { ...extra, CLEF_MODE: 'off', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }).status).toBe(0);
      expect(parseEnv(readFileSync(join(f.config, '.env'), 'utf8')).CLOUDFLARE_API_TOKEN).toBe('');
      expect(parseEnv(readFileSync(join(f.config, '.env'), 'utf8')).CLOUDFLARE_ACCOUNT_ID).toBe('');
      expect(parseEnv(readFileSync(join(f.config, '.env'), 'utf8')).CLEF_MODE).toBe('off');
    } finally { f.cleanup(); }
  });

  test('invalid or missing credentials fail before Herdr I/O and do not disclose their values', () => {
    const cases = [[], ['--webhook-url', 'https://bot.example'], [...botFlags, '--telegram-bot-token', '123:token'],
      ['--webhook-url', 'private-invalid-url', '--webhook-key', 'secret'],
      ['--webhook-url', 'http://bot.example', '--webhook-key', 'secret'],
      ['--webhook-url', 'https://bot.example', '--webhook-key', "private'key\nINJECT=1"]];
    for (const args of cases) {
      const fixture = notifyFixture();
      try {
        const result = fixture.run(args);
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).not.toContain('private');
        expect(existsSync(fixture.env.FIXTURE_CALLS)).toBe(false);
        expect(existsSync(join(fixture.config, '.env'))).toBe(false);
      } finally { fixture.cleanup(); }
    }
  });

  test('Herdr failure output stays private and each failed stage stops installation', () => {
    for (const operation of ['list', 'config-dir', 'link', 'enable']) {
      const fixture = notifyFixture();
      try {
        const result = fixture.run(botFlags, { FIXTURE_FAIL: operation, FIXTURE_PRIVATE: 'private-webhook-url' });
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).not.toContain('private-webhook-url');
        const calls = readFileSync(fixture.env.FIXTURE_CALLS, 'utf8').trim().split('\n');
        expect(calls).toHaveLength(['list', 'config-dir', 'link', 'enable'].indexOf(operation) + 1);
        // The record is the last step, so a failed Herdr step, enable included, writes none.
        expect(existsSync(fixture.record)).toBe(false);
      } finally { fixture.cleanup(); }
    }
  });

  test('a failed record write exits 1 with a fixed message and writes through no symlink', () => {
    const fixture = notifyFixture();
    try {
      const elsewhere = join(fixture.root, 'elsewhere'); mkdirSync(elsewhere);
      mkdirSync(join(fixture.home, '.repo-harness'));
      symlinkSync(elsewhere, dirname(fixture.record));
      const result = fixture.run(botFlags);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe('Herdr notify: The plugin is enabled, but the install record was not written. Run: repo-harness herdr notify install --session notify-test\n');
      expect(readdirSync(elsewhere)).toEqual([]);
      expect(readFileSync(fixture.env.FIXTURE_CALLS, 'utf8')).toContain('"enable"');
    } finally { fixture.cleanup(); }
  });

  test('a config symlink cannot overwrite another file or enable the plugin', () => {
    const fixture = notifyFixture();
    try {
      const target = join(fixture.home, 'keep'); writeFileSync(target, 'keep');
      symlinkSync(target, join(fixture.config, '.env'));
      expect(fixture.run(botFlags).status).toBe(1);
      expect(readFileSync(target, 'utf8')).toBe('keep');
      expect(readFileSync(fixture.env.FIXTURE_CALLS, 'utf8')).not.toContain('"enable"');
    } finally { fixture.cleanup(); }
  });

  test('a source symlink inserted after lstat cannot overwrite another file', () => {
    const fixture = notifyFixture();
    try {
      const source = join(fixture.config, 'source'); mkdirSync(source);
      const target = join(source, 'notify.mjs'); writeFileSync(target, 'old source');
      const victim = join(fixture.home, 'keep'); writeFileSync(victim, 'keep');
      const marker = join(fixture.root, 'swapped');
      const driver = join(fixture.root, 'race.mjs');
      // Keep the real stat result. Move a real symlink into the gap before copy.
      writeFileSync(driver, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const target = ${JSON.stringify(target)}, victim = ${JSON.stringify(victim)};
const lstat = fs.lstatSync;
fs.lstatSync = (...args) => {
  const result = lstat(...args);
  if (String(args[0]) === target) {
    fs.unlinkSync(target); fs.symlinkSync(victim, target);
    fs.writeFileSync(${JSON.stringify(marker)}, 'swapped');
  }
  return result;
};
syncBuiltinESMExports();
const { installNotify } = await import(${JSON.stringify(join(ROOT, 'src/cli/commands/herdr.ts'))});
await installNotify({ session: 'notify-test', nonInteractive: true,
  webhookUrl: 'https://bot.example/routine', webhookKey: 'fixture-secret-key' });
`);
      const result = spawnSync('node', [driver], { env: fixture.env, encoding: 'utf8', timeout: 20_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(marker, 'utf8')).toBe('swapped');
      expect(readFileSync(victim, 'utf8')).toBe('keep');
      expect(lstatSync(target).isSymbolicLink()).toBe(false);
      expect(readFileSync(target, 'utf8')).toBe(readFileSync(join(ROOT, 'assets/herdr/webhook-notify/notify.mjs'), 'utf8'));
    } finally { fixture.cleanup(); }
  });

  test('masked input restores terminal state on Enter, cancel, and EOF', async () => {
    for (const ending of ['enter', 'cancel', 'eof']) {
      const input = new PassThrough() as unknown as NodeJS.ReadStream;
      const output = new PassThrough() as unknown as NodeJS.WriteStream;
      let terminal = ''; output.on('data', chunk => { terminal += chunk.toString(); });
      Object.assign(input, { isTTY: true, isRaw: false, setRawMode(value: boolean) { this.isRaw = value; return this; } });
      Object.assign(output, { isTTY: true });
      const answer = askMasked('Key', input, output);
      input.write('secret'); input.write('\x7f');
      if (ending === 'enter') input.write('\r');
      else if (ending === 'cancel') input.write('\x03');
      else input.emit('end');
      if (ending === 'enter') expect(await answer).toBe('secre');
      else await expect(answer).rejects.toThrow(ending === 'cancel' ? 'Input canceled.' : 'Input ended.');
      expect(terminal).not.toContain('secret');
      expect(input.isRaw).toBe(false);
      expect(input.listenerCount('data')).toBe(0);
    }
  });
});

const pluginPath = join(ROOT, 'assets/herdr/webhook-notify/notify.mjs');
const { notify } = await import(pluginPath) as { notify: (env: NodeJS.ProcessEnv, send: typeof fetch, options?: { managedRoot?: string }) => Promise<void> };

describe('shipped Herdr notify event handler', () => {
  function eventFixture(status = 'blocked') {
    const fixture = notifyFixture();
    writeFileSync(join(fixture.config, '.env'), "WEBHOOK_URL='https://bot.example/routine'\nWEBHOOK_KEY='fixture-secret-key'\nNOTIFY_SESSION='notify-test'\nSLACK_WEBHOOK_URL='https://slack.example/hook'\nDISCORD_WEBHOOK_URL='https://discord.example/hook'\nTELEGRAM_BOT_TOKEN='123:token'\nTELEGRAM_CHAT_ID='-42'\n", { mode: 0o600 });
    const env = { ...fixture.env, HERDR_SESSION: 'notify-test', HERDR_PLUGIN_CONFIG_DIR: fixture.config,
      HERDR_PLUGIN_STATE_DIR: fixture.state, HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane_agent_status_changed',
        data: { type: 'pane_agent_status_changed', pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: status, agent: 'codex', title: 'Needs input' } }),
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: fixture.workspace, focused_pane_cwd: fixture.workspace, workspace_label: 'project' }) };
    const calls: Array<{url: string; init: RequestInit}> = [];
    const send = (async (url: string | URL | Request, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    return { ...fixture, env, calls, send };
  }

  test.each([
    ['pane_agent_status_changed', 4],
    ['pane.agent_status_changed', 0],
    ['pane_updated', 0],
  ] as const)('Herdr wire event contract accepts only the emitted body name: %s', async (name, count) => {
    const f = eventFixture('blocked');
    try {
      const event = JSON.parse(f.env.HERDR_PLUGIN_EVENT_JSON);
      event.event = name;
      f.env.HERDR_PLUGIN_EVENT_JSON = JSON.stringify(event);
      await notify(f.env, f.send);
      expect(f.calls).toHaveLength(count);
      expect(existsSync(join(f.state, 'decision-shadow.jsonl'))).toBe(false);
    } finally { f.cleanup(); }
  });

  function shadowFixture() {
    const f = eventFixture('done');
    Object.assign(f.env, { HERDR_BIN_PATH: join(f.root, 'bin/herdr') });
    writeFileSync(join(f.config, '.env'), readFileSync(join(f.config, '.env'), 'utf8')
      + "CLEF_MODE=shadow\nCLOUDFLARE_ACCOUNT_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nCLOUDFLARE_API_TOKEN=fixture-clef-token\nWEBHOOK_NOTIFY_DONE=1\nSLACK_NOTIFY_DONE=1\nDISCORD_NOTIFY_DONE=1\nTELEGRAM_NOTIFY_DONE=1\n");
    const records = () => readFileSync(join(f.state, 'decision-shadow.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const answer = (model: string) => ({ success: true, result: { model,
      answers: { 'pane.outcome': { type: 'choice', choice: 'quota', confidence: 0.9,
        probabilities: { done: 0.025, stuck: 0.025, model_error: 0.025, quota: 0.9, unclear: 0.025 } },
      'pane.result_present': { type: 'noul', noul: 0.1 }, 'pane.provider_message': { type: 'noul', noul: 0.9 } },
      usage: { input_tokens: 3500, output_tokens: 0 }, private: 'fixture-clef-token' } });
    const send = (async (url: string | URL | Request, init: RequestInit) => {
      f.calls.push({ url: String(url), init });
      return new Response(JSON.stringify(String(url).startsWith('https://api.cloudflare.com/') ? answer(JSON.parse(String(init.body)).model) : { ok: true }));
    }) as typeof fetch;
    return { ...f, send, records, configText: readFileSync(join(f.config, '.env'), 'utf8') };
  }

  test('shadow delivers identical channel requests before both models and writes a private redacted record', async () => {
    const f = shadowFixture();
    const clock = spyOn(Date, 'now').mockReturnValue(1792663200000);
    const stderr: string[] = []; const consoleSpy = spyOn(console, 'error').mockImplementation(message => { stderr.push(String(message)); });
    try {
      writeFileSync(f.env.FIXTURE_TAIL_FILE, Array.from({ length: 125 }, (_, i) => `line ${i}`).join('\n')
        + '\nsk-fixtureSecret ghp_fixtureSecret Bearer credential API_KEY="private value" '
        + 'a'.repeat(48) + ' QWErTyZxCvBnMsDfGhJkLqWeRtYuIoPaSdFgHjKlZXCV123456 fixture-clef-token', 'utf8');
      await notify(f.env, f.send);
      expect(f.calls.slice(0, 4).map(call => call.url)).toEqual(['https://bot.example/routine', 'https://slack.example/hook', 'https://discord.example/hook', 'https://api.telegram.org/bot123:token/sendMessage']);
      expect(f.calls.slice(4).map(call => call.url.split('/').at(-1))).toEqual(['clef-flash', 'clef']);
      const delivered = f.calls.slice(0, 4);
      const body = JSON.parse(String(f.calls[4]!.init.body));
      expect(Object.keys(body.state).sort()).toEqual(['agent', 'herdr_status', 'pane_title', 'tail', 'tail_lines', 'tail_truncated']);
      expect(body.state.tail_lines).toBe(120);
      expect(body.state.tail_truncated).toBe(true);
      for (const secret of ['sk-fixtureSecret', 'ghp_fixtureSecret', 'credential', 'private value', 'fixture-clef-token', 'a'.repeat(48), 'QWErTyZxCvBnMsDfGhJkLqWeRtYuIoPaSdFgHjKlZXCV123456']) {
        expect(body.state.tail).not.toContain(secret);
        expect(JSON.stringify(f.records()) + stderr.join('\n')).not.toContain(secret);
      }
      expect(f.records()).toHaveLength(1);
      expect(f.records()[0].models.map((model: any) => [model.model, model.choice, model.band, model.evidence])).toEqual([
        ['clef-flash', 'quota', 'act', { 'pane.result_present': 0.1, 'pane.provider_message': 0.9 }],
        ['clef', 'quota', 'act', { 'pane.result_present': 0.1, 'pane.provider_message': 0.9 }],
      ]);
      expect(statSync(join(f.state, 'decision-shadow.jsonl')).mode & 0o777).toBe(0o600);
      expect(statSync(join(f.config, 'decision-state.json')).mode & 0o777).toBe(0o600);
      expect(JSON.parse(String(delivered[0]!.init.body)).agent_status).toBe('done');
      expect(JSON.parse(String(delivered[0]!.init.body)).decision).toBeUndefined();
      rmSync(join(f.state, 'debounce-state.json'));
      writeFileSync(join(f.config, '.env'), f.configText.replace('CLEF_MODE=shadow', 'CLEF_MODE=off'));
      f.calls.length = 0;
      await notify(f.env, f.send);
      expect(f.calls.map(call => [call.url, call.init.body, call.init.headers])).toEqual(delivered.map(call => [call.url, call.init.body, call.init.headers]));
      expect(f.records()).toHaveLength(1);
      const calls = readFileSync(f.env.FIXTURE_CALLS, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls.map(call => call.args)).toEqual([['pane', 'read', 'pane-1', '--source', 'recent', '--lines', '120']]);
    } finally { clock.mockRestore(); consoleSpy.mockRestore(); f.cleanup(); }
  });

  test.each(['http', 'timeout', 'json', 'invalid', 'redirect', 'pane', 'binary'])('shadow failure keeps delivery unchanged: %s', async failure => {
    const f = shadowFixture();
    try {
      if (failure === 'pane') (f.env as NodeJS.ProcessEnv).FIXTURE_PANE_FAIL = '1';
      if (failure === 'binary') delete (f.env as NodeJS.ProcessEnv).HERDR_BIN_PATH;
      const send = (async (url: string | URL | Request, init: RequestInit) => {
        if (!String(url).startsWith('https://api.cloudflare.com/')) return f.send(url, init);
        f.calls.push({ url: String(url), init });
        if (failure === 'timeout') return new Promise<Response>(() => {});
        if (failure === 'http') return new Response('private failure fixture-clef-token', { status: 500 });
        if (failure === 'json') return new Response('private invalid json fixture-clef-token');
        if (failure === 'redirect') { const reply = new Response('{}'); Object.defineProperty(reply, 'redirected', { value: true }); return reply; }
        return new Response(JSON.stringify({ success: true, result: {} }));
      }) as typeof fetch;
      await notify(f.env, send);
      expect(f.calls.slice(0, 4).map(call => call.url)).toEqual(['https://bot.example/routine', 'https://slack.example/hook', 'https://discord.example/hook', 'https://api.telegram.org/bot123:token/sendMessage']);
      expect(f.records()).toHaveLength(1);
      expect(f.records()[0].models.map((model: any) => model.status)).toEqual(Array(2).fill(failure === 'invalid' ? 'invalid' : 'unavailable'));
      expect(JSON.stringify(f.records())).not.toContain('fixture-clef-token');
      if (failure === 'pane' || failure === 'binary') { expect(f.calls).toHaveLength(4); expect(f.records()[0].tail).toBeNull(); }
    } finally { f.cleanup(); }
  });

  test.each(['agent', 'blocked', 'off', 'missing-mode', 'missing-token', 'missing-account'])('out-of-scope shadow does no read, call or record: %s', async condition => {
    const f = shadowFixture();
    try {
      if (condition === 'agent') f.env.HERDR_PLUGIN_EVENT_JSON = f.env.HERDR_PLUGIN_EVENT_JSON.replace('codex', 'pi');
      else if (condition === 'blocked') f.env.HERDR_PLUGIN_EVENT_JSON = f.env.HERDR_PLUGIN_EVENT_JSON.replace('done', 'blocked');
      else writeFileSync(join(f.config, '.env'), f.configText.replace(
        condition === 'off' ? 'CLEF_MODE=shadow' : condition === 'missing-mode' ? 'CLEF_MODE=shadow' : condition === 'missing-token' ? 'CLOUDFLARE_API_TOKEN=fixture-clef-token' : 'CLOUDFLARE_ACCOUNT_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        condition === 'off' ? 'CLEF_MODE=off' : ''));
      await notify(f.env, f.send);
      expect(f.calls).toHaveLength(4);
      expect(existsSync(f.env.FIXTURE_CALLS)).toBe(false);
      expect(existsSync(join(f.state, 'decision-shadow.jsonl'))).toBe(false);
    } finally { f.cleanup(); }
  });

  test('two concurrent events reserve the UTC budget once and retain both records', async () => {
    const f = shadowFixture();
    try {
      writeFileSync(join(f.state, 'decision-budget.json'), JSON.stringify({ day: new Date().toISOString().slice(0, 10), calls: 1999 }), { mode: 0o600 });
      const existing = { event_id: 'old', ts: '2000-01-01T00:00:00Z' };
      writeFileSync(join(f.state, 'decision-shadow.jsonl'), JSON.stringify(existing) + '\n', { mode: 0o600 });
      await Promise.all([notify(f.env, f.send), notify(f.env, f.send)]);
      expect(f.records()).toHaveLength(2);
      expect(f.calls.filter(call => call.url.startsWith('https://api.cloudflare.com/'))).toHaveLength(1);
      expect(f.records().flatMap(record => record.models).filter((model: any) => model.status === 'skipped_cap')).toHaveLength(3);
      expect(JSON.parse(readFileSync(join(f.state, 'decision-budget.json'), 'utf8')).calls).toBe(2000);
      const run = (args: string[]) => spawnSync(process.execPath, [join(ROOT, 'src/cli/index.ts'), 'herdr', 'decision', 'label', ...args], { env: f.env, encoding: 'utf8', timeout: 10_000 });
      const original = readFileSync(join(f.state, 'decision-shadow.jsonl'), 'utf8');
      const first = run(['--next']);
      expect(first.status, first.stderr).toBe(0);
      const blind = JSON.parse(first.stdout);
      expect(Object.keys(blind).sort()).toEqual(['agent', 'event_id', 'herdr_status', 'tail']);
      const written = run([blind.event_id, 'quota']);
      expect(written.status, written.stderr).toBe(0);
      expect(JSON.parse(written.stdout).labeler).toBe('bot');
      expect(statSync(join(f.state, 'decision-labels.jsonl')).mode & 0o777).toBe(0o600);
      expect(run([blind.event_id, 'done']).status).toBe(1);
      expect(run([blind.event_id, 'invalid']).status).toBe(1);
      expect(JSON.parse(run(['--next']).stdout).event_id).not.toBe(blind.event_id);
      expect(readFileSync(join(f.state, 'decision-shadow.jsonl'), 'utf8')).toBe(original);
    } finally { f.cleanup(); }
  });

  test('the label lock refuses a live owner and reclaims a dead or reused-PID owner', async () => {
    const f = shadowFixture();
    try {
      await notify(f.env, f.send);
      const eventId = f.records()[0].event_id;
      const root = realpathSync(f.state);
      const lockPath = join(root, 'decision-labels.lock');
      const held = acquireExclusiveDirectoryLock(root, 'decision-labels.lock');
      try {
        await expect(labelDecision({ next: true, stateDir: f.state })).rejects.toThrow('timed out waiting for exclusive lock');
      } finally { held.release(); }

      // A live PID whose start time differs from the record was reused by another process.
      mkdirSync(lockPath, { mode: 0o700 });
      const token = `${process.pid}-${Date.now()}-00000000-0000-4000-8000-000000000915`;
      writeFileSync(join(lockPath, `${token}.json`), `${JSON.stringify({
        pid: process.pid, start_time: `${currentProcessStartTime()}-earlier-process`, created_at: Date.now(), token,
      })}\n`, { mode: 0o600 });
      expect((await labelDecision({ next: true, stateDir: f.state }) as { event_id: string }).event_id).toBe(eventId);
      expect(existsSync(lockPath)).toBe(false);

    } finally { f.cleanup(); }
  });

  test('an aged live legacy label lock keeps its read-modify-write ownership', async () => {
    const f = shadowFixture();
    try {
      const lockPath = join(f.state, 'decision-labels.lock');
      mkdirSync(lockPath, { mode: 0o700 });
      const old = new Date(Date.now() - 60_000);
      utimesSync(lockPath, old, old);
      const path = join(f.state, 'decision-labels.jsonl');
      writeFileSync(path, 'legacy snapshot\n', { mode: 0o600 });
      const snapshot = readFileSync(path, 'utf8');
      // The legacy owner paused after its read. A new writer must not steal
      // its bare-directory lock, even though the directory is older than TTL.
      await expect(labelDecision({ next: true, stateDir: f.state })).rejects.toThrow('timed out waiting for exclusive lock');
      expect(existsSync(lockPath)).toBe(true);
      expect(readFileSync(path, 'utf8')).toBe(snapshot);
      const temporary = join(f.state, 'legacy-labels.tmp');
      writeFileSync(temporary, snapshot + 'legacy publication\n', { mode: 0o600 });
      renameSync(temporary, path);
      expect(readFileSync(path, 'utf8')).toBe('legacy snapshot\nlegacy publication\n');
    } finally { f.cleanup(); }
  });

  test('OSC redaction keeps the result between ST-terminated hyperlinks', async () => {
    const f = shadowFixture();
    try {
      const link = (text: string) => `\x1b]8;;https://example.invalid\x1b\\${text}\x1b]8;;\x1b\\`;
      writeFileSync(f.env.FIXTURE_TAIL_FILE, `start ${link('link1')} KEEP-THIS-RESULT ${link('link2')} end`, 'utf8');
      await notify(f.env, f.send);
      expect(f.records()[0].tail).toBe('start link1 KEEP-THIS-RESULT link2 end');
    } finally { f.cleanup(); }
  });

  test('separate event processes contend on the real lock and reserve only one remaining call', async () => {
    const f = shadowFixture();
    const children: ReturnType<typeof spawn>[] = [];
    const lock = join(f.state, 'decision-shadow.lock');
    try {
      mkdirSync(lock);
      writeFileSync(join(f.state, 'decision-budget.json'), JSON.stringify({ day: new Date().toISOString().slice(0, 10), calls: 1999 }), { mode: 0o600 });
      const driver = join(f.root, 'event.mjs');
      writeFileSync(driver, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const mkdir=fs.mkdirSync; fs.mkdirSync=(...args)=>{try{return mkdir(...args);}catch(error){if(String(args[0])===process.env.FIXTURE_LOCK&&error.code==='EEXIST')fs.writeFileSync(process.env.FIXTURE_CONTENDED,'ready');throw error;}};
syncBuiltinESMExports();
const {notify}=await import(${JSON.stringify(pluginPath)});
await notify(process.env, async()=>new Response(JSON.stringify({ok:true,success:true,result:{}})));
`);
      const exits = [1, 2].map(id => {
        const child = spawn('node', [driver], { env: { ...f.env, FIXTURE_LOCK: lock, FIXTURE_CONTENDED: join(f.root, `contended-${id}`) }, stdio: ['ignore', 'ignore', 'pipe'] });
        children.push(child);
        let stderr = ''; child.stderr!.on('data', chunk => { stderr += chunk.toString(); });
        return new Promise<{ code: number | null; stderr: string }>(resolve => child.once('exit', code => resolve({ code, stderr })));
      });
      const deadline = Date.now() + 1500;
      while (![1, 2].every(id => existsSync(join(f.root, `contended-${id}`)))) {
        if (Date.now() >= deadline) throw new Error('Event processes did not reach the held lock.');
        await Bun.sleep(5);
      }
      expect(readFileSync(join(f.state, 'decision-budget.json'), 'utf8')).toContain('1999');
      rmSync(lock, { recursive: true });
      const results = await Promise.all(exits);
      for (const result of results) { expect(result.code, result.stderr).toBe(0); expect(result.stderr).not.toContain('Shadow record failed'); }
      expect(JSON.parse(readFileSync(join(f.state, 'decision-budget.json'), 'utf8')).calls).toBe(2000);
      expect(f.records()).toHaveLength(2);
      expect(f.records().flatMap(record => record.models).filter((model: any) => model.status === 'skipped_cap')).toHaveLength(3);
    } finally {
      for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
      await Promise.all(children.map(child => new Promise<void>(resolve => child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', () => resolve()))));
      f.cleanup();
    }
  });

  test('a stale lock exhausts the acquire budget after delivery without stealing the lock', async () => {
    const f = shadowFixture();
    const stderr: string[] = [];
    const consoleSpy = spyOn(console, 'error').mockImplementation(message => { stderr.push(String(message)); });
    try {
      const lock = join(f.state, 'decision-shadow.lock'); mkdirSync(lock);
      await notify(f.env, f.send);
      expect(f.calls).toHaveLength(4);
      expect(existsSync(lock)).toBe(true);
      expect(existsSync(join(f.state, 'decision-shadow.jsonl'))).toBe(false);
      expect(stderr.at(-1)).toBe('[webhook-notify] Shadow record failed.');
    } finally { consoleSpy.mockRestore(); f.cleanup(); }
  });

  test('corrupt budgets fail closed and a shadow symlink cannot modify its target', async () => {
    const f = shadowFixture();
    try {
      writeFileSync(join(f.state, 'decision-budget.json'), '{corrupt', { mode: 0o600 });
      await notify(f.env, f.send);
      expect(f.calls).toHaveLength(4);
      expect(f.records()[0].models.every((model: any) => model.status === 'unavailable')).toBe(true);
      expect(readFileSync(join(f.state, 'decision-budget.json'), 'utf8')).toBe('{corrupt');
      const target = join(f.root, 'untouched'); writeFileSync(target, 'keep');
      rmSync(join(f.state, 'decision-shadow.jsonl'));
      symlinkSync(target, join(f.state, 'decision-shadow.jsonl'));
      const stderr: string[] = [];
      const consoleSpy = spyOn(console, 'error').mockImplementation(message => { stderr.push(String(message)); });
      try { await notify(f.env, f.send); } finally { consoleSpy.mockRestore(); }
      expect(readFileSync(target, 'utf8')).toBe('keep');
      expect(stderr).toEqual(['[webhook-notify] Shadow record failed.']);
    } finally { f.cleanup(); }
  });

  test('retention evicts the oldest row at the 20 MiB byte cap', async () => {
    const f = shadowFixture();
    try {
      const path = join(f.state, 'decision-shadow.jsonl');
      const old = JSON.stringify({ ts: new Date().toISOString(), padding: '' });
      const padding = ' '.repeat(20 * 1024 * 1024 - Buffer.byteLength(old) - 2);
      writeFileSync(path, JSON.stringify({ ts: new Date().toISOString(), padding }) + '\n', { mode: 0o600 });
      await notify(f.env, f.send);
      expect(statSync(path).size).toBeLessThanOrEqual(20 * 1024 * 1024);
      expect(f.records()).toHaveLength(1);
      expect(f.records()[0].models).toHaveLength(2);
    } finally { f.cleanup(); }
  });

  test('tail is capped by UTF-8 bytes after redaction and no model text is executed', async () => {
    const f = shadowFixture();
    try {
      const tail = Array.from({ length: 120 }, () => '漢 '.repeat(300)).join('\n');
      // Keep the original large input. Linux cannot spawn with this text in one env entry.
      expect(Buffer.byteLength(tail)).toBe(144119);
      writeFileSync(f.env.FIXTURE_TAIL_FILE, tail, 'utf8');
      await notify(f.env, f.send);
      const record = f.records()[0];
      expect(typeof record.tail).toBe('string');
      expect(tail.endsWith(record.tail)).toBe(true);
      expect(Buffer.byteLength(record.tail)).toBeGreaterThanOrEqual(16 * 1024 - 3);
      expect(Buffer.byteLength(record.tail)).toBeLessThanOrEqual(16 * 1024);
      expect(record.tail).not.toContain('�');
      expect(record.models.every((model: any) => model.status === 'ok')).toBe(true);
      const calls = readFileSync(f.env.FIXTURE_CALLS, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls).toHaveLength(1);
      expect(calls[0].args.slice(0, 2)).toEqual(['pane', 'read']);
    } finally { f.cleanup(); }
  });

  test.each(['cwd', 'nested-cwd', 'worktree-path'])('managed default task notifications are delivered: %s', async field => {
    for (const status of ['done', 'blocked']) {
      const f = eventFixture(status); try {
        const repo = join(f.root, 'repo'), managed = join(f.root, 'managed'); mkdirSync(repo); mkdirSync(managed);
        const git = (...args: string[]) => { const result = spawnSync('git', args, { cwd: repo, env: f.env, encoding: 'utf8' }); expect(result.status, result.stderr).toBe(0); };
        git('init', '-q', '-b', 'main'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'base');
        const task = join(managed, 'repo-wt-notify'); git('worktree', 'add', '-q', '-b', 'codex/notify', task);
        const nested = join(task, 'nested'); mkdirSync(nested);
        const context = { workspace_cwd: f.workspace, focused_pane_cwd: f.workspace, worktree: { path: f.workspace }, workspace_label: 'project' };
        if (field === 'worktree-path') context.worktree.path = task;
        else { context.workspace_cwd = field === 'cwd' ? task : nested; context.focused_pane_cwd = context.workspace_cwd; }
        f.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify(context);
        if (status === 'done') writeFileSync(join(f.config, '.env'), readFileSync(join(f.config, '.env'), 'utf8') + 'WEBHOOK_NOTIFY_DONE=1\n');
        await notify(f.env, f.send, { managedRoot: managed }); expect(f.calls).toHaveLength(status === 'done' ? 1 : 4);
        f.calls.length = 0;
        f.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ ...context, workspace_label: 'rh-herdr-fixture' });
        await notify(f.env, f.send, { managedRoot: managed }); expect(f.calls).toHaveLength(0);
      } finally { f.cleanup(); }
    }
  });

  test.skipIf(process.platform === 'win32')('a FIFO commondir is suppressed without blocking the notifier', () => {
    const f = eventFixture(); try {
      const managed = join(f.root, 'managed'), fake = join(managed, 'repo-wt-fifo');
      const admin = join(f.root, 'fake-git/worktrees/fifo');
      mkdirSync(fake, { recursive: true }); mkdirSync(admin, { recursive: true });
      writeFileSync(join(fake, '.git'), 'gitdir: ' + admin);
      const fifo = spawnSync('mkfifo', [join(admin, 'commondir')], { encoding: 'utf8' });
      expect(fifo.status, fifo.stderr).toBe(0);
      const env = { ...f.env, HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: fake }) };
      const code = `import { notify } from ${JSON.stringify(pluginPath)}; await notify(process.env, () => { throw new Error('unexpected send'); }, { managedRoot: ${JSON.stringify(managed)} });`;
      const child = spawnSync(process.execPath, ['-e', code], { env, encoding: 'utf8', timeout: 2000 });
      expect(child.error).toBeUndefined(); expect(child.status, child.stderr).toBe(0);
    } finally { f.cleanup(); }
  });

  test.each(['ordinary', 'unregistered', 'copied-pointer', 'fake-admin'])('temporary notification contexts remain filtered: %s', async kind => {
    const f = eventFixture(); try {
      const managed = join(f.root, 'managed'); mkdirSync(managed);
      const fake = kind === 'ordinary' ? join(f.root, 'ordinary') : join(managed, 'repo-wt-fake'); mkdirSync(fake);
      if (kind === 'fake-admin') {
        const admin = join(f.root, 'fake-git/worktrees/fake'); mkdirSync(admin, { recursive: true });
        writeFileSync(join(fake, '.git'), 'gitdir: ' + admin); writeFileSync(join(admin, 'gitdir'), join(fake, '.git')); writeFileSync(join(admin, 'commondir'), '../..');
      }
      if (kind === 'copied-pointer') {
        const repo = join(f.root, 'repo'); mkdirSync(repo);
        for (const args of [['init', '-q', '-b', 'main'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'base'], ['worktree', 'add', '-q', '-b', 'codex/real', join(managed, 'repo-wt-real')]]) {
          const result = spawnSync('git', args, { cwd: repo, env: f.env, encoding: 'utf8' }); expect(result.status, result.stderr).toBe(0);
        }
        writeFileSync(join(fake, '.git'), readFileSync(join(managed, 'repo-wt-real/.git')));
      }
      f.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ workspace_cwd: fake, focused_pane_cwd: fake, worktree: { path: fake } });
      await notify(f.env, f.send, { managedRoot: managed }); expect(f.calls).toHaveLength(0);
    } finally { f.cleanup(); }
  });

  test('blocked reaches Bot and all selected human channels with native request bodies', async () => {
    const fixture = eventFixture();
    try {
      await notify(fixture.env, fixture.send);
      expect(fixture.calls).toHaveLength(4);
      expect(fixture.calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer fixture-secret-key', 'x-webhook-key': 'fixture-secret-key' });
      expect(JSON.parse(String(fixture.calls[0]!.init.body))).toMatchObject({ pane_id: 'pane-1', agent_status: 'blocked', session: 'notify-test' });
      expect(JSON.parse(String(fixture.calls[1]!.init.body)).text).toContain('Herdr blocked');
      expect(JSON.parse(String(fixture.calls[2]!.init.body)).allowed_mentions).toEqual({ parse: [] });
      expect(fixture.calls[3]!.url).toBe('https://api.telegram.org/bot123:token/sendMessage');
      expect(JSON.parse(String(fixture.calls[3]!.init.body)).chat_id).toBe('-42');
      expect(fixture.calls.every(call => call.init.redirect === 'error' && call.init.signal instanceof AbortSignal)).toBe(true);
      await notify(fixture.env, fixture.send);
      expect(fixture.calls).toHaveLength(4);
    } finally { fixture.cleanup(); }
  });

  test('done is opt-in for each channel, and working sends nothing', async () => {
    for (const channel of ['WEBHOOK', 'SLACK', 'DISCORD', 'TELEGRAM']) {
      const fixture = eventFixture('done');
      try {
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(0);
        writeFileSync(join(fixture.config, '.env'), readFileSync(join(fixture.config, '.env'), 'utf8') + `${channel}_NOTIFY_DONE=1\n`);
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(1);
        const expectedUrl = { WEBHOOK: 'https://bot.example', SLACK: 'https://slack.example', DISCORD: 'https://discord.example', TELEGRAM: 'https://api.telegram.org' }[channel]!;
        expect(fixture.calls[0]!.url).toStartWith(expectedUrl);
        fixture.env.HERDR_PLUGIN_EVENT_JSON = fixture.env.HERDR_PLUGIN_EVENT_JSON.replace('done', 'working');
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(1);
      } finally { fixture.cleanup(); }
    }
  });

  test('Slack escapes broadcast and user mentions in every message field', async () => {
    const fixture = eventFixture();
    try {
      const event = JSON.parse(fixture.env.HERDR_PLUGIN_EVENT_JSON);
      event.data.display_agent = '<!channel>';
      event.data.title = '<!everyone> <@U123|user> &lt;!here&gt; & text';
      event.data.pane_id = '<@U456>';
      fixture.env.HERDR_PLUGIN_EVENT_JSON = JSON.stringify(event);
      fixture.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ workspace_cwd: fixture.workspace, workspace_label: '<!here>', tab_label: '<!subteam^S123>' });
      await notify(fixture.env, fixture.send);
      expect(fixture.calls).toHaveLength(4);
      const slack = JSON.parse(String(fixture.calls[1]!.init.body)).text;
      for (const token of ['!channel', '!here', '!everyone', '@U123|user', '@U456', '!subteam^S123']) {
        expect(slack).toContain(`&lt;${token}&gt;`);
      }
      expect(slack).toContain('&amp;lt;!here&amp;gt; &amp; text');
      expect(slack).not.toMatch(/[<>]/);
      expect(JSON.parse(String(fixture.calls[0]!.init.body)).title).toBe(event.data.title);
    } finally { fixture.cleanup(); }
  });

  // A checkout under system tmp cannot provide a lexically durable alias.
  const aliasCheckoutIsTemporary = realpathSync(ROOT).startsWith(realpathSync('/tmp') + '/') || realpathSync(ROOT) === realpathSync('/tmp');
  test.skipIf(aliasCheckoutIsTemporary)('temporary workspaces reached through a durable symlink are filtered (requires checkout outside system tmp)', async () => {
    for (const field of ['workspace_cwd', 'focused_pane_cwd', 'worktree']) {
      const fixture = eventFixture();
      const aliasRoot = mkdtempSync(join(ROOT, '.notify-alias-'));
      try {
        const alias = join(aliasRoot, 'temporary'); symlinkSync(fixture.root, alias);
        expect(realpathSync(alias)).toBe(realpathSync(fixture.root));
        const context = { workspace_cwd: fixture.workspace, focused_pane_cwd: fixture.workspace, worktree: { path: fixture.workspace } };
        if (field === 'worktree') context.worktree.path = alias;
        else context[field as 'workspace_cwd' | 'focused_pane_cwd'] = alias;
        fixture.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify(context);
        await notify(fixture.env, fixture.send);
        expect(fixture.calls).toHaveLength(0);
      } finally { fixture.cleanup(); rmSync(aliasRoot, { recursive: true, force: true }); }
    }
  });

  test('session and temporary workspace filters stop every delivery', async () => {
    for (const path of ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', tmpdir()].filter(existsSync)) {
      const fixture = eventFixture();
      try {
        fixture.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ workspace_cwd: fixture.workspace, focused_pane_cwd: path });
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(0);
        fixture.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ workspace_cwd: fixture.workspace, focused_pane_cwd: fixture.root });
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(0);
      } finally { fixture.cleanup(); }
    }
    for (const change of ['session', 'label']) {
      const fixture = eventFixture();
      try {
        if (change === 'session') fixture.env.HERDR_SESSION = 'other-session';
        else fixture.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ workspace_cwd: fixture.workspace, workspace_label: 'rh-herdr-test' });
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(0);
      } finally { fixture.cleanup(); }
    }
  });

  test('failed targets retry without repeating targets that succeeded', async () => {
    const fixture = eventFixture();
    try {
      let first = true;
      const send = (async (url: string | URL | Request, init: RequestInit) => {
        if (first && String(url).includes('bot.example')) throw new Error('private-token-and-url');
        if (first && String(url).includes('discord.example')) return new Response('', { status: 429 });
        if (first && String(url).includes('telegram.org')) return new Response('{"ok":false}', { status: 200 });
        return fixture.send(url, init);
      }) as typeof fetch;
      await notify(fixture.env, send); expect(fixture.calls).toHaveLength(1);
      first = false;
      await notify(fixture.env, send); expect(fixture.calls).toHaveLength(4);
      await notify(fixture.env, send); expect(fixture.calls).toHaveLength(4);
    } finally { fixture.cleanup(); }
  });

  test('default session identity and expired debounce state allow fresh blocked events', async () => {
    const fixture = eventFixture();
    try {
      writeFileSync(join(fixture.config, '.env'), readFileSync(join(fixture.config, '.env'), 'utf8').replace('notify-test', 'default'));
      delete (fixture.env as NodeJS.ProcessEnv).HERDR_SESSION;
      await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(4);
      const statePath = join(fixture.state, 'debounce-state.json');
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      for (const key of Object.keys(state)) state[key] = Date.now() - 120_001;
      writeFileSync(statePath, JSON.stringify(state));
      await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(8);
      expect(statSync(statePath).mode & 0o777).toBe(0o600);
    } finally { fixture.cleanup(); }
  });

  test('missing Bot config, malformed events, and missing paths fail closed', async () => {
    for (const invalid of ['bot', 'event', 'path', 'relative-path', 'missing-directory']) {
      const fixture = eventFixture();
      try {
        if (invalid === 'bot') writeFileSync(join(fixture.config, '.env'), 'NOTIFY_SESSION=notify-test\n');
        if (invalid === 'event') fixture.env.HERDR_PLUGIN_EVENT_JSON = '{';
        if (invalid === 'path') fixture.env.HERDR_PLUGIN_CONTEXT_JSON = '{}';
        if (invalid === 'relative-path') fixture.env.HERDR_PLUGIN_CONTEXT_JSON = '{"workspace_cwd":"relative"}';
        if (invalid === 'missing-directory') fixture.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ workspace_cwd: join(fixture.workspace, 'missing') });
        await expect(notify(fixture.env, fixture.send)).rejects.toThrow();
        expect(fixture.calls).toHaveLength(0);
      } finally { fixture.cleanup(); }
    }
  });

  test('corrupt or unreadable debounce state logs a warning and still sends', async () => {
    for (const invalid of ['{', '[]', 'null', '{"bad":"private-state-value"}', '{"bad":1e400}', '{"bad":-1}', 'directory']) {
      const fixture = eventFixture();
      const originalError = console.error;
      const logs: string[] = [];
      console.error = (...args) => { logs.push(args.join(' ')); };
      try {
        const path = join(fixture.state, 'debounce-state.json');
        if (invalid === 'directory') mkdirSync(path);
        else writeFileSync(path, invalid);
        await notify(fixture.env, fixture.send);
        expect(fixture.calls).toHaveLength(4);
        expect(logs).toContain('[webhook-notify] Cannot read debounce state. Using empty state.');
        expect(logs.join('\n')).not.toContain('private-state-value');
        if (invalid !== 'directory') {
          expect(Object.keys(JSON.parse(readFileSync(path, 'utf8')))).toHaveLength(4);
          await notify(fixture.env, fixture.send);
          expect(fixture.calls).toHaveLength(4);
        }
      } finally { console.error = originalError; fixture.cleanup(); }
    }
  });

  test('future debounce timestamps cannot suppress any configured channel', async () => {
    for (const channel of ['WEBHOOK', 'SLACK', 'DISCORD', 'TELEGRAM']) {
      for (const future of [Date.now() + 120_000, 9e15]) {
        const fixture = eventFixture();
        const originalError = console.error;
        const logs: string[] = [];
        console.error = (...args) => { logs.push(args.join(' ')); };
        try {
          const path = join(fixture.state, 'debounce-state.json');
          const key = JSON.stringify(['notify-test', 'pane-1', 'blocked', channel]);
          writeFileSync(path, JSON.stringify({ [key]: future }));
          await notify(fixture.env, fixture.send);
          expect(fixture.calls).toHaveLength(4);
          expect(logs).toContain('[webhook-notify] Cannot read debounce state. Using empty state.');
          const state = JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>;
          expect(Object.keys(state)).toHaveLength(4);
          expect(state[key]).toBeLessThanOrEqual(Date.now());
          await notify(fixture.env, fixture.send);
          expect(fixture.calls).toHaveLength(4);
        } finally { console.error = originalError; fixture.cleanup(); }
      }
    }
  });
});
