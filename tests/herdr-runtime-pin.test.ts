import { defaultPolicy } from "../src/core/adoption/standard-plan";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
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
    expect(herdr.min_version).toBe("0.9.3");
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
    const homeSteps = workflow.jobs['test-home-isolation']!.steps as Array<{ name?: string; uses?: string; if?: string }>;
    const install = homeSteps.findIndex(step => step.uses === './.github/actions/install-pinned-herdr');
    const native = homeSteps.findIndex(step => step.name === 'Run native OAR acceptance tests');
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(native);
    expect(homeSteps[install]!.if).toBe("matrix.os == 'macos-latest'");
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
    const first = "---\nname: herdr\n---\nCheck HERDR_ENV before control.\n";
    writeFileSync(source, first);
    expect(configureRequiredHerdrSkill("both", env).status).toBe("ok");
    for (const host of [".claude", ".codex"]) {
      expect(readFileSync(join(home, host, "skills", "herdr", "SKILL.md"), "utf8")).toBe(first);
    }

    const next = `${first}Use herdr agent list.\n`;
    writeFileSync(source, next);
    expect(configureRequiredHerdrSkill("both", env).status).toBe("ok");
    expect(readFileSync(join(home, ".codex", "skills", "herdr", "SKILL.md"), "utf8")).toBe(next);

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
      expect(readFileSync(join(home, host, "skills", "herdr", "SKILL.md"), "utf8")).toBe(afterCleanupFailure);
    }

    const claudeSkill = join(home, ".claude", "skills", "herdr", "SKILL.md");
    writeFileSync(claudeSkill, "# user change\n");
    writeFileSync(source, `${afterCleanupFailure}One more rule.\n`);
    expect(configureRequiredHerdrSkill("both", env).status).toBe("failed");
    expect(readFileSync(claudeSkill, "utf8")).toBe("# user change\n");
    expect(readFileSync(join(home, ".codex", "skills", "herdr", "SKILL.md"), "utf8")).toBe(afterCleanupFailure);
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
    writeFileSync(source, "---\nname: herdr\n---\nCheck HERDR_ENV before control.\n");
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
    const content = "---\nname: herdr\n---\nCheck HERDR_ENV before control.\n";
    const source = join(root, "skill.md");
    writeFileSync(source, content);
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
    expect(readFileSync(source, "utf8")).toBe(content);
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
    writeFileSync(source, `${content}Updated binary skill.\n`);
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
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { askMasked } from '../src/cli/commands/herdr';

function notifyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'rh-herdr-notify-'));
  // Use an existing non-temporary directory as read-only event context.
  const workspace = dirname(realpathSync('/tmp'));
  const home = join(root, 'home');
  const config = join(root, 'config');
  const state = join(root, 'state');
  const bin = join(root, 'bin');
  for (const dir of [home, config, state, bin]) mkdirSync(dir);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'),
    PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    FIXTURE_CONFIG: config, FIXTURE_CALLS: join(root, 'calls.jsonl') };
  for (const key of Object.keys(env)) if (key.startsWith('HERDR_') || /^(WEBHOOK_|SLACK_|DISCORD_|TELEGRAM_)/.test(key)) delete (env as NodeJS.ProcessEnv)[key];
  const shim = join(bin, 'herdr');
  writeFileSync(shim, `#!${process.execPath}\nimport {appendFileSync,mkdirSync} from 'node:fs';\nconst args=process.argv.slice(2);\nappendFileSync(process.env.FIXTURE_CALLS,JSON.stringify({args,secret:process.env.WEBHOOK_KEY??null})+'\\n');\nif(process.env.FIXTURE_FAIL===args[3]) { console.error('private '+process.env.FIXTURE_PRIVATE);process.exit(1); }\nif(args[3]==='config-dir') { mkdirSync(process.env.FIXTURE_CONFIG,{recursive:true}); console.log(process.env.FIXTURE_CONFIG); }\nif(args[3]==='list') console.log(process.env.FIXTURE_LIST_OUTPUT??JSON.stringify({id:'cli:plugin',result:{type:'plugin_list',plugins:JSON.parse(process.env.FIXTURE_PLUGINS??'[]')}}));\n`);
  chmodSync(shim, 0o755);
  const run = (args: string[] = [], extra: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath,
    [join(ROOT, 'src/cli/index.ts'), 'herdr', 'notify', 'install', '--session', 'notify-test', '--non-interactive', ...args],
    { env: { ...env, ...extra }, encoding: 'utf8', timeout: 20_000 });
  return { root, workspace, home, config, state, env, run, cleanup: () => {
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
      for (const name of ['herdr-plugin.toml', 'notify.mjs', 'worktree-location.mjs']) expect(readFileSync(join(fixture.config, 'source', name), 'utf8')).toBe(readFileSync(join(ROOT, 'assets/herdr/webhook-notify', name), 'utf8'));
      const { notify: installedNotify } = await import(join(fixture.config, 'source/notify.mjs'));
      const delivered: string[] = [];
      await installedNotify({ ...fixture.env, HERDR_SESSION: 'notify-test', HERDR_PLUGIN_CONFIG_DIR: fixture.config,
        HERDR_PLUGIN_STATE_DIR: fixture.state,
        HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane.agent_status_changed', data: { pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: 'done' } }),
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: fixture.workspace }),
      }, async (url: string) => { delivered.push(url); return new Response('{"ok":true}'); });
      expect(delivered).toEqual(['https://slack.example/secret']);
      chmodSync(path, 0o644);
      expect(fixture.run([], { WEBHOOK_URL: 'https://bot.example/routine', WEBHOOK_KEY: 'changed-key' }).status).toBe(0);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(parseEnv(readFileSync(path, 'utf8')).WEBHOOK_KEY).toBe('changed-key');
    } finally { fixture.cleanup(); }
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
      } finally { fixture.cleanup(); }
    }
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
      HERDR_PLUGIN_STATE_DIR: fixture.state, HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane.agent_status_changed',
        data: { type: 'pane_agent_status_changed', pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: status, agent: 'codex', title: 'Needs input' } }),
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: fixture.workspace, focused_pane_cwd: fixture.workspace, workspace_label: 'project' }) };
    const calls: Array<{url: string; init: RequestInit}> = [];
    const send = (async (url: string | URL | Request, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    return { ...fixture, env, calls, send };
  }

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
