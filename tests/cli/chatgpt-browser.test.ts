import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { inspectBridgeExtensionInstall, renderBrowserAuthorizePage } from '../../src/cli/chatgpt-browser/bind-server';
import { writeChatgptBridgeExtension } from '../../src/cli/chatgpt-browser/bridge-extension';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function runChatgpt(args: string[], cwd = ROOT, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync('bun', [CLI, 'chatgpt', ...args], {
    cwd,
    encoding: 'utf-8',
    env,
  });
}

function withRepo<T>(fn: (repoRoot: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-'));
  try {
    mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    writeFileSync(join(repoRoot, 'plans/sprints/example.sprint.md'), '# Sprint\n\n- [ ] Task\n');
    writeFileSync(join(repoRoot, 'docs/example.md'), '# Docs\n');
    writeFileSync(join(repoRoot, '.env'), 'SECRET=value\n');
    return fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

describe('chatgpt browser command', () => {
  test('prints help for browser command group', () => {
    const root = runChatgpt(['--help']);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain('browser-consult');
    expect(root.stdout).toContain('browser-followup');
    expect(root.stdout).toContain('browser-session');
    expect(root.stdout).toContain('browser-doctor');
    expect(root.stdout).toContain('browser-bind');
    expect(root.stdout).toContain('browser-open');
    expect(root.stdout).toContain('browser-cleanup');

    const setup = runChatgpt(['browser-setup', '--help']);
    expect(setup.status).toBe(0);
    expect(setup.stdout).toContain('--profile-dir');
    expect(setup.stdout).toContain('--profile-directory');
    expect(setup.stdout).not.toContain('--open');

    const doctor = runChatgpt(['browser-doctor', '--help']);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('--validate-session');
    expect(doctor.stdout).toContain('--profile-directory');

    const bind = runChatgpt(['browser-bind', '--help']);
    expect(bind.status).toBe(0);
    expect(bind.stdout).toContain('authorization page');
    expect(bind.stdout).toContain('--profile-directory');

    const consult = runChatgpt(['browser-consult', '--help']);
    expect(consult.status).toBe(0);
    expect(consult.stdout).toContain('ChatGPT Web');
    expect(consult.stdout).toContain('--dry-run');
    expect(consult.stdout).toContain('--profile-dir');
    expect(consult.stdout).toContain('--keep-browser');
    expect(consult.stdout).toContain('--allow-absolute-output');
  });

  test('dry-run consult writes a repo-local session with inline files', () => {
    withRepo((repoRoot) => {
      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--title',
        'review sprint',
        '--prompt',
        'Review this sprint.',
        '--file',
        'plans/sprints/example.sprint.md',
        '--follow-up',
        'Challenge the recommendation.',
        '--model',
        'GPT-5.5 Pro',
        '--thinking',
        'heavy',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.status).toBe('dry_run');
      expect(payload.sessionId).toMatch(/^chgpt_\d{8}_\d{6}_review-sprint$/);
      expect(payload.dryRun.files[0].path).toBe('plans/sprints/example.sprint.md');

      const metaPath = join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json');
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      expect(meta.engine).toBe('chatgpt-browser');
      expect(meta.provider).toBe('oracle');
      expect(meta.browser.profileDir).toBeUndefined();

      const read = runChatgpt(['browser-session', '--repo', repoRoot, payload.sessionId]);
      expect(read.status).toBe(0);
      expect(read.stdout).toContain('Dry run only');

      const listed = runChatgpt(['browser-list', '--repo', repoRoot, '--json']);
      expect(listed.status).toBe(0);
      expect(JSON.parse(listed.stdout).sessions[0].sessionId).toBe(payload.sessionId);

      const followup = runChatgpt([
        'browser-followup',
        '--repo',
        repoRoot,
        '--session',
        payload.sessionId,
        '--dry-run',
        '--prompt',
        'Turn that into a goal.',
      ]);
      expect(followup.status).toBe(0);
      const followupPayload = JSON.parse(followup.stdout);
      expect(followupPayload.sourceSessionId).toBe(payload.sessionId);
      const followupMeta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', followupPayload.sessionId, 'meta.json'), 'utf-8'));
      expect(followupMeta.sourceSessionId).toBe(payload.sessionId);

      const cleanupPlan = runChatgpt(['browser-cleanup', '--repo', repoRoot, '--status', 'dry_run', '--limit', '1', '--json']);
      expect(cleanupPlan.status).toBe(0);
      expect(JSON.parse(cleanupPlan.stdout).dryRun).toBe(true);
    });
  });

  test('denies secret files before writing a session', () => {
    withRepo((repoRoot) => {
      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Read this.',
        '--file',
        '.env',
      ]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('path is denied by ChatGPT browser policy');
      expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
    });
  });

  test('denies allowed-path symlink escapes before writing a session', () => {
    withRepo((repoRoot) => {
      const outside = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-outside-'));
      try {
        writeFileSync(join(outside, 'secret.md'), '# outside\n');
        symlinkSync(join(outside, 'secret.md'), join(repoRoot, 'plans/sprints/linked.md'));
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--dry-run',
          '--prompt',
          'Read this.',
          '--file',
          'plans/sprints/linked.md',
        ]);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('escapes repository root');
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  test('validates write-output path and overwrite policy before writing a session', () => {
    withRepo((repoRoot) => {
      const denied = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Reply OK.',
        '--write-output',
        '.env',
      ]);
      expect(denied.status).toBe(2);
      expect(denied.stderr).toContain('path is denied by ChatGPT browser policy');
      expect(readFileSync(join(repoRoot, '.env'), 'utf-8')).toBe('SECRET=value\n');
      expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);

      const absolute = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Reply OK.',
        '--write-output',
        join(tmpdir(), 'repo-harness-chatgpt-browser-output.md'),
      ]);
      expect(absolute.status).toBe(2);
      expect(absolute.stderr).toContain('absolute write output paths require --allow-absolute-output');

      mkdirSync(join(repoRoot, 'tasks/reviews'), { recursive: true });
      writeFileSync(join(repoRoot, 'tasks/reviews/existing.md'), 'old\n');
      const noOverwrite = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Reply OK.',
        '--write-output',
        'tasks/reviews/existing.md',
      ]);
      expect(noOverwrite.status).toBe(2);
      expect(noOverwrite.stderr).toContain('write output already exists');
      expect(readFileSync(join(repoRoot, 'tasks/reviews/existing.md'), 'utf-8')).toBe('old\n');
    });
  });

  test('native provider readiness and dry-run are wired without opening a browser', () => {
    withRepo((repoRoot) => {
      const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'native', '--json']);
      expect(doctor.status).toBe(0);
      const readiness = JSON.parse(doctor.stdout);
      expect(readiness.provider).toBe('native');
      expect(['ready', 'partial']).toContain(readiness.status);
      expect(typeof readiness.native.installed).toBe('boolean');
      expect(readiness.native.driver).toBe('chrome-cdp');
      expect(readiness.native.defaultChannel).toBe('chrome');
      expect(readiness.native.productSession.status).toBe('not_configured');

      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--dry-run',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
      expect(meta.provider).toBe('native');
      expect(meta.status).toBe('dry_run');
      expect(meta.browser.profileDir).toBeUndefined();

      const unsupported = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--prompt',
        'Reply exactly OK',
        '--model',
        'GPT-5.5 Pro',
      ]);
      expect(unsupported.status).toBe(0);
      const unsupportedPayload = JSON.parse(unsupported.stdout);
      expect(unsupportedPayload.status).toBe('failed');
      expect(unsupportedPayload.error.code).toBe('NATIVE_MODEL_SELECTION_UNSUPPORTED');

      const unbound = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(unbound.status).toBe(0);
      const unboundPayload = JSON.parse(unbound.stdout);
      expect(unboundPayload.status).toBe('failed');
      expect(unboundPayload.error.code).toBe('NATIVE_PROFILE_NOT_BOUND');
    });
  });

  test('browser setup binds a user-selected ChatGPT profile and native dry-run uses it', () => {
    withRepo((repoRoot) => {
      const userDataDir = join(repoRoot, 'Chrome/User Data');
      const profileDir = join(userDataDir, 'Profile 1');
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(join(userDataDir, 'Local State'), '{}\n');
      writeFileSync(join(profileDir, 'Preferences'), '{}\n');
      const setup = runChatgpt([
        'browser-setup',
        '--repo',
        repoRoot,
        '--profile-dir',
        profileDir,
        '--browser-channel',
        'chrome',
        '--chatgpt-url',
        'https://chatgpt.com/',
      ]);
      expect(setup.status).toBe(0);
      expect(setup.stdout).toContain('ChatGPT profile binding');
      expect(setup.stdout).toContain('browser-bind --open');

      const configPath = join(repoRoot, '.repo-harness/chatgpt-browser.local.json');
      expect(existsSync(configPath)).toBe(true);
      const binding = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(binding.product).toBe('chatgpt');
      expect(binding.profileDir).toBe(userDataDir);
      expect(binding.profileDirectory).toBe('Profile 1');
      expect(binding.selectedProfilePath).toBe(profileDir);
      expect(binding.browserChannel).toBe('chrome');
      expect(binding.chatgptUrl).toBe('https://chatgpt.com/');
      const retiredPageKeys = ['bind' + 'PagePath', 'bind' + 'PageUrl'];
      expect(Object.keys(binding)).not.toEqual(expect.arrayContaining(retiredPageKeys));

      const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'native', '--json']);
      expect(doctor.status).toBe(0);
      const readiness = JSON.parse(doctor.stdout);
      expect(readiness.native.productSession.status).toBe('bound');
      expect(readiness.native.productSession.profileDir).toBe(userDataDir);
      expect(readiness.native.productSession.profileDirectory).toBe('Profile 1');
      expect(readiness.native.productSession.selectedProfilePath).toBe(profileDir);
      expect(Object.keys(readiness.native.productSession)).not.toEqual(expect.arrayContaining(retiredPageKeys));
      expect(readiness.next).toContain('repo-harness chatgpt browser-doctor --provider native --validate-session');

      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--dry-run',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
      expect(meta.provider).toBe('native');
      expect(meta.browser.profileDir).toBe(userDataDir);
      expect(meta.browser.profileDirectory).toBe('Profile 1');
      expect(meta.browser.selectedProfilePath).toBe(profileDir);
      expect(meta.browser.channel).toBe('chrome');
    });
  });

  test('browser authorization page binds through a local endpoint instead of linking to ChatGPT', () => {
    const html = renderBrowserAuthorizePage({
      profileDir: '/tmp/repo-harness-chatgpt-profile',
      profileDirectory: 'Profile 1',
      selectedProfilePath: '/tmp/repo-harness-chatgpt-profile/Profile 1',
      browserChannel: 'chrome',
      chatgptUrl: 'https://chatgpt.com/',
      blockedByDefaultProfile: false,
      extensionDir: '/tmp/repo-harness-chatgpt-extension',
    });
    expect(html).toContain('Authorize ChatGPT Web Session');
    expect(html).toContain('Bind ChatGPT');
    expect(html).toContain('Bridge extension');
    expect(html).toContain("postJson('/api/authorize')");
    expect(html).toContain("postJson('/api/open-chatgpt')");
    expect(html).toContain("postJson('/api/open-extensions')");
    expect(html).toContain("fetch('/api/extension/status'");
    expect(html).toContain('Copy Extension Path');
    expect(html).not.toContain('href="https://chatgpt.com/');
  });

  test('bridge authorization diagnoses whether the unpacked extension is installed in the selected profile', () => {
    const profileRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-profile-'));
    try {
      const profileDir = join(profileRoot, 'Profile 1');
      mkdirSync(profileDir, { recursive: true });
      const extensionDir = join(profileRoot, 'bridge-extension');
      writeFileSync(join(profileDir, 'Preferences'), JSON.stringify({ extensions: { settings: {} } }));
      expect(inspectBridgeExtensionInstall(profileRoot, 'Profile 1', extensionDir).status).toBe('not_installed');

      writeFileSync(join(profileDir, 'Secure Preferences'), JSON.stringify({
        extensions: {
          settings: {
            secureOnly: {
              location: 4,
              path: extensionDir,
            },
          },
        },
      }));
      const secureInstalled = inspectBridgeExtensionInstall(profileRoot, 'Profile 1', extensionDir);
      expect(secureInstalled.status).toBe('installed');
      expect(secureInstalled.extensionId).toBe('secureOnly');

      rmSync(join(profileDir, 'Secure Preferences'), { force: true });
      writeFileSync(join(profileDir, 'Preferences'), JSON.stringify({
        extensions: {
          settings: {
            abc: {
              state: 1,
              path: extensionDir,
              manifest: { name: 'repo-harness ChatGPT Bridge' },
            },
          },
        },
      }));
      const installed = inspectBridgeExtensionInstall(profileRoot, 'Profile 1', extensionDir);
      expect(installed.status).toBe('installed');
      expect(installed.extensionId).toBe('abc');

      writeFileSync(join(profileDir, 'Preferences'), JSON.stringify({
        extensions: {
          settings: {
            abc: {
              state: 0,
              path: extensionDir,
              manifest: { name: 'repo-harness ChatGPT Bridge' },
            },
          },
        },
      }));
      expect(inspectBridgeExtensionInstall(profileRoot, 'Profile 1', extensionDir).status).toBe('disabled');
    } finally {
      rmSync(profileRoot, { recursive: true, force: true });
    }
  });

  test('bridge extension is scoped to ChatGPT product domains and localhost only', () => {
    withRepo((repoRoot) => {
      const extension = writeChatgptBridgeExtension(repoRoot, 'http://127.0.0.1:17651');
      const manifest = JSON.parse(readFileSync(extension.manifestPath, 'utf-8'));
      expect(manifest.host_permissions).toEqual([
        'https://chatgpt.com/*',
        'https://chat.openai.com/*',
        'http://127.0.0.1:17651/*',
      ]);
      expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
      expect(JSON.stringify(manifest)).not.toContain('cookies');
      expect(JSON.stringify(manifest)).not.toContain('storage');
      expect(readFileSync(extension.contentScriptPath, 'utf-8')).toContain('/api/extension/task');
    });
  });

  test('bridge provider fails closed when the product-scoped extension is not connected', () => {
    withRepo((repoRoot) => {
      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'bridge',
        '--timeout-ms',
        '1000',
        '--prompt',
        'Reply exactly OK',
      ], repoRoot, {
        ...process.env,
        REPO_HARNESS_CHATGPT_BRIDGE_PORT: String(32000 + Math.floor(Math.random() * 10000)),
      });
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.status).toBe('failed');
      expect(payload.error.code).toBe('CHATGPT_BRIDGE_EXTENSION_NOT_CONNECTED');
      const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
      expect(meta.provider).toBe('bridge');
      expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/bridge-extension/manifest.json'))).toBe(true);
    });
  });

  test('native provider blocks the default Chrome profile before CDP launch', () => {
    if (process.platform !== 'darwin') {
      expect(process.platform).not.toBe('darwin');
      return;
    }
    withRepo((repoRoot) => {
      const defaultChromeDir = join(homedir(), 'Library/Application Support/Google/Chrome');
      const doctor = runChatgpt([
        'browser-doctor',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--profile-dir',
        defaultChromeDir,
        '--profile-directory',
        'Default',
        '--validate-session',
        '--json',
      ]);
      expect(doctor.status).toBe(0);
      const readiness = JSON.parse(doctor.stdout);
      expect(readiness.status).toBe('partial');
      expect(readiness.native.productSession.status).toBe('blocked_default_profile');
      expect(readiness.native.productSession.blockedByDefaultProfile).toBe(true);
      expect(readiness.native.productSession.validation).toBeUndefined();
      expect(readiness.browser.opensBrowser).toBe(false);

      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--profile-dir',
        defaultChromeDir,
        '--profile-directory',
        'Default',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.status).toBe('failed');
      expect(payload.error.code).toBe('NATIVE_DEFAULT_PROFILE_CDP_BLOCKED');
      expect(payload.error.recovery).toContain('Chrome 136+ requires a non-standard --user-data-dir');
      expect(readFileSync(payload.paths.output, 'utf-8')).toContain('Chrome 136+ requires a non-standard --user-data-dir');
    });
  });

  test('oracle provider wrapper executes a visible oracle binary and ignores stdout artifact paths', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-bin-'));
      const outside = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-secret-'));
      const artifactPath = join(outside, 'secret-artifact.md');
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(artifactPath, '# Secret artifact\n');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'printf "%s\\n" "Oracle saw: $*"',
            'printf "%s\\n" "Session ID: oracle_fake_123"',
            'printf "%s\\n" "https://chatgpt.com/c/fake-conversation"',
            `printf "%s\\n" "Artifact: ${artifactPath}"`,
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--file',
          'docs/example.md',
          '--model',
          'GPT-5.5 Pro',
          '--thinking',
          'heavy',
        ], repoRoot, { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` });
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('Oracle saw: --engine browser');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.browser.conversationUrl).toBe('https://chatgpt.com/c/fake-conversation');
        expect(meta.providerSessionId).toBe('oracle_fake_123');
        expect(meta.output.artifacts).toEqual([]);
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'artifacts/secret-artifact.md'))).toBe(false);

        const opened = runChatgpt(['browser-open', '--repo', repoRoot, payload.sessionId]);
        expect(opened.status).toBe(0);
        expect(JSON.parse(opened.stdout).url).toBe('https://chatgpt.com/c/fake-conversation');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  test('oracle follow-up uses providerSessionId instead of local sessionId', () => {
    withRepo((repoRoot) => {
      const initial = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Start.',
      ]);
      expect(initial.status).toBe(0);
      const initialPayload = JSON.parse(initial.stdout);
      const metaPath = join(repoRoot, '.ai/harness/chatgpt/sessions', initialPayload.sessionId, 'meta.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.providerSessionId = 'oracle_upstream_123';
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-followup-bin-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'printf "%s\\n" "Oracle saw: $*"',
            'printf "%s\\n" "Session ID: oracle_followup_456"',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const followup = runChatgpt([
          'browser-followup',
          '--repo',
          repoRoot,
          '--session',
          initialPayload.sessionId,
          '--prompt',
          'Continue.',
        ], repoRoot, { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` });
        expect(followup.status).toBe(0);
        const followupPayload = JSON.parse(followup.stdout);
        const output = readFileSync(followupPayload.paths.output, 'utf-8');
        expect(output).toContain('--session oracle_upstream_123');
        expect(output).not.toContain(`--session ${initialPayload.sessionId}`);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('rejects invalid session ids for read/open surfaces', () => {
    withRepo((repoRoot) => {
      const read = runChatgpt(['browser-session', '--repo', repoRoot, '../secret']);
      expect(read.status).toBe(2);
      expect(read.stderr).toContain('invalid ChatGPT browser session id');
    });
  });

  test('ships browser engine docs and Codex Skill', () => {
    const guide = join(ROOT, 'docs/repo-harness-chatgpt-browser-engine.md');
    const skill = join(ROOT, '.agents/skills/repo-harness-chatgpt-browser/SKILL.md');
    expect(readFileSync(guide, 'utf-8')).toContain('repo-harness chatgpt browser-consult');
    expect(readFileSync(guide, 'utf-8')).toContain('--provider native');
    expect(readFileSync(guide, 'utf-8')).toContain('--provider bridge');
    expect(readFileSync(guide, 'utf-8')).toContain('--browser-channel chrome');
    expect(readFileSync(skill, 'utf-8')).toContain('repo-harness-chatgpt-browser');
  });
});
