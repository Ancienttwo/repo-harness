import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { inspectBridgeExtensionInstall, renderBrowserAuthorizePage } from '../../src/cli/chatgpt-browser/bind-server';
import { writeChatgptBridgeExtension } from '../../src/cli/chatgpt-browser/bridge-extension';
import { runBridgeProvider } from '../../src/cli/chatgpt-browser/bridge-provider';
import type { PromptBundle } from '../../src/cli/chatgpt-browser/types';

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

async function withRepoAsync<T>(fn: (repoRoot: string) => Promise<T>): Promise<T> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-'));
  try {
    return await fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function emptyBundle(prompt: string): PromptBundle {
  return { prompt, rendered: prompt, files: [], followups: [], totalChars: prompt.length };
}

function readBridgeToken(repoRoot: string): string {
  const script = readFileSync(join(repoRoot, '.ai/harness/chatgpt/bridge-extension/content-script.js'), 'utf-8');
  return script.match(/REPO_HARNESS_CHATGPT_BRIDGE_TOKEN = "([^"]+)"/)?.[1] ?? '';
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
    expect(consult.stdout).toContain('--heartbeat');
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
      expect(readiness.status).toBe('deprecated');
      expect(readiness.code).toBe('NATIVE_PROVIDER_DEPRECATED');
      expect(readiness.native.deprecated).toBe(true);
      expect(readiness.posture).toEqual({ oracle: 'default', native: 'deprecated', bridge: 'experimental' });
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
      expect(readiness.next).toContain('The native CDP provider is deprecated; use --provider oracle. Native remains only for short-term diagnostics.');
      if (readiness.native.installed) {
        expect(readiness.next).toContain('repo-harness chatgpt browser-doctor --provider native --validate-session');
      } else {
        expect(readiness.next).toContain('Install Google Chrome before native provider execution.');
      }

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
      const extension = writeChatgptBridgeExtension(repoRoot, 'http://127.0.0.1:17651', 'tok_example_123');
      const manifest = JSON.parse(readFileSync(extension.manifestPath, 'utf-8'));
      expect(manifest.host_permissions).toEqual([
        'https://chatgpt.com/*',
        'https://chat.openai.com/*',
        'http://127.0.0.1:17651/*',
      ]);
      expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
      expect(JSON.stringify(manifest)).not.toContain('cookies');
      expect(JSON.stringify(manifest)).not.toContain('storage');
      const script = readFileSync(extension.contentScriptPath, 'utf-8');
      expect(script).toContain('/api/extension/task');
      expect(script).toContain('REPO_HARNESS_CHATGPT_BRIDGE_TOKEN = "tok_example_123"');
      expect(script).toContain('x-repo-harness-bridge-token');
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
      ], ROOT, {
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

  test('bridge enforces the capability token and backstops status-only completions', async () => {
    await withRepoAsync(async (repoRoot) => {
      const port = 33000 + Math.floor(Math.random() * 9000);
      const prevPort = process.env.REPO_HARNESS_CHATGPT_BRIDGE_PORT;
      process.env.REPO_HARNESS_CHATGPT_BRIDGE_PORT = String(port);
      try {
        // Start the provider without awaiting; the server binds and the extension
        // (carrying the token) is written before the first internal await.
        const promise = runBridgeProvider({ repoRoot, prompt: 'Reply exactly OK', timeoutMs: 6000 }, emptyBundle('Reply exactly OK'));
        const base = `http://127.0.0.1:${port}`;
        const token = readBridgeToken(repoRoot);
        expect(token.length).toBeGreaterThan(0);

        // Any caller missing the token is rejected before it can claim the task.
        const unauthorized = await fetch(`${base}/api/extension/task`, { headers: { accept: 'application/json' } });
        expect(unauthorized.status).toBe(401);

        // The authorized extension claims the task...
        const claim = await fetch(`${base}/api/extension/task`, { headers: { accept: 'application/json', 'x-repo-harness-bridge-token': token } });
        expect(claim.status).toBe(200);
        const task = await claim.json();
        expect(task.kind).toBe('consult');

        // ...then posts a "completed" with status-only text, which must be coerced.
        await fetch(`${base}/api/extension/result`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-repo-harness-bridge-token': token },
          body: JSON.stringify({ taskId: task.id, status: 'completed', output: 'Pro thinking' }),
        });

        const result = await promise;
        expect(result.status).toBe('failed');
        expect(result.error?.code).toBe('CHATGPT_BRIDGE_NO_FINAL_MESSAGE');
      } finally {
        if (prevPort === undefined) delete process.env.REPO_HARNESS_CHATGPT_BRIDGE_PORT;
        else process.env.REPO_HARNESS_CHATGPT_BRIDGE_PORT = prevPort;
      }
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
      expect(readiness.status).toBe('deprecated');
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

  test('oracle provider reads the --write-output answer file and treats stdout as logs', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-bin-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        // The fake echoes its args to stdout (logs) and writes the answer to the
        // managed --write-output path (authority). conversationUrl/sessionId come
        // from the stdout logs.
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'printf "%s\\n" "Oracle saw: $ARGS"',
            'printf "%s\\n" "Session ID: oracle_fake_123"',
            'printf "%s\\n" "https://chatgpt.com/c/fake-conversation"',
            'if [ -n "$OUT" ]; then',
            '  printf "%s\\n" "Final answer: Oracle saw: $ARGS" > "$OUT"',
            '  printf "%s\\n" "PWD: $PWD" >> "$OUT"',
            '  printf "%s\\n" "ORACLE_HOME_DIR: ${ORACLE_HOME_DIR:-}" >> "$OUT"',
            '  printf "%s\\n" "ORACLE_ENGINE: ${ORACLE_ENGINE:-}" >> "$OUT"',
            '  printf "%s\\n" "ORACLE_REMOTE_HOST: ${ORACLE_REMOTE_HOST:-}" >> "$OUT"',
            'fi',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        mkdirSync(join(repoRoot, '.oracle'), { recursive: true });
        writeFileSync(
          join(repoRoot, '.oracle/config.json'),
          '{"promptSuffix":"DO NOT INHERIT","browser":{"manualLogin":true,"modelStrategy":"ignore"}}\n',
        );
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
          '--oracle-bin',
          oraclePath,
        ], ROOT, {
          ...process.env,
          ORACLE_ENGINE: 'api',
          ORACLE_REMOTE_HOST: '127.0.0.1:9473',
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain('Oracle saw:');
        expect(result.stderr).toContain('--heartbeat 59');
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('Final answer: Oracle saw: --engine browser');
        expect(output).toContain('--heartbeat 59');
        expect(output).toContain('--browser-archive never');
        expect(output).toContain('--browser-model-strategy select');
        expect(output).toContain(`--file ${join(repoRoot, 'docs/example.md')}`);
        expect(output).not.toContain('--browser-manual-login');
        expect(output).not.toContain('DO NOT INHERIT');
        expect(output).not.toContain(`PWD: ${repoRoot}`);
        expect(output).toContain(`ORACLE_HOME_DIR: ${join(repoRoot, '.ai/harness/chatgpt/oracle-home')}`);
        expect(output).toContain('ORACLE_ENGINE:');
        expect(output).toContain('ORACLE_REMOTE_HOST:');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.browser.conversationUrl).toBe('https://chatgpt.com/c/fake-conversation');
        expect(meta.providerSessionId).toBe('oracle_fake_123');
        expect(meta.oracle.binary).toBe(oraclePath);
        expect(meta.oracle.captureStatus).toBe('completed');
        expect(meta.output.artifacts).toEqual([]);

        const opened = runChatgpt(['browser-open', '--repo', repoRoot, payload.sessionId]);
        expect(opened.status).toBe(0);
        expect(JSON.parse(opened.stdout).url).toBe('https://chatgpt.com/c/fake-conversation');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('oracle provider uses the bound ChatGPT profile cookie database', () => {
    withRepo((repoRoot) => {
      const userDataDir = join(repoRoot, 'Chrome/User Data');
      const profileDir = join(userDataDir, 'Profile 1');
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(join(userDataDir, 'Local State'), '{}\n');
      writeFileSync(join(profileDir, 'Preferences'), '{}\n');
      writeFileSync(join(profileDir, 'Cookies'), 'fake cookie db\n');
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

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-profile-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'printf "%s\\n" "Session ID: oracle_profile_123"',
            'if [ -n "$OUT" ]; then printf "%s\\n" "Oracle saw: $ARGS" > "$OUT"; fi',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('--browser-model-strategy current');
        expect(output).toContain(`--browser-cookie-path ${join(profileDir, 'Cookies')}`);
        expect(output).toContain('--chatgpt-url https://chatgpt.com/');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.browser.profileDir).toBe(userDataDir);
        expect(meta.browser.profileDirectory).toBe('Profile 1');
        expect(meta.browser.selectedProfilePath).toBe(profileDir);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('oracle provider prefers modern Network/Cookies over legacy Cookies', () => {
    withRepo((repoRoot) => {
      const userDataDir = join(repoRoot, 'Chrome/User Data');
      const profileDir = join(userDataDir, 'Profile 1');
      const networkDir = join(profileDir, 'Network');
      mkdirSync(networkDir, { recursive: true });
      writeFileSync(join(userDataDir, 'Local State'), '{}\n');
      writeFileSync(join(profileDir, 'Preferences'), '{}\n');
      writeFileSync(join(profileDir, 'Cookies'), 'legacy cookie db\n');
      writeFileSync(join(networkDir, 'Cookies'), 'modern cookie db\n');
      const setup = runChatgpt([
        'browser-setup',
        '--repo',
        repoRoot,
        '--profile-dir',
        profileDir,
        '--browser-channel',
        'chrome',
      ]);
      expect(setup.status).toBe(0);

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-network-cookie-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'if [ -n "$OUT" ]; then printf "%s\n" "Oracle saw: $ARGS" > "$OUT"; fi',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain(`--browser-cookie-path ${join(networkDir, 'Cookies')}`);
        expect(output).not.toContain(`--browser-cookie-path ${join(profileDir, 'Cookies')}`);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('oracle provider fails closed when the bound profile has no regular cookie database', () => {
    withRepo((repoRoot) => {
      const userDataDir = join(repoRoot, 'Chrome/User Data');
      const profileDir = join(userDataDir, 'Profile 1');
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(join(userDataDir, 'Local State'), '{}\n');
      writeFileSync(join(profileDir, 'Preferences'), '{}\n');
      mkdirSync(join(profileDir, 'Cookies'));
      const setup = runChatgpt([
        'browser-setup',
        '--repo',
        repoRoot,
        '--profile-dir',
        profileDir,
        '--browser-channel',
        'chrome',
      ]);
      expect(setup.status).toBe(0);

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-no-cookie-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'printf "%s\\n" "unexpected oracle execution" >&2',
            'exit 99',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('failed');
        expect(payload.error.code).toBe('ORACLE_PROFILE_COOKIE_NOT_FOUND');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('could not find a Chrome cookie database');
        expect(output).not.toContain('unexpected oracle execution');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('oracle provider downgrades an empty answer file to recoverable, not completed', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-empty-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        // Clean exit but no answer file written: oracle submitted, capture lost.
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'printf "%s\\n" "Session ID: oracle_recover_789"',
            'exit 0',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('recoverable');
        expect(payload.error.code).toBe('ORACLE_CAPTURE_INCOMPLETE');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.providerSessionId).toBe('oracle_recover_789');
        expect(meta.oracle.captureStatus).toBe('recoverable');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('oracle provider maps thinking to Oracle browser thinking time', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-thinking-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'if [ -n "$OUT" ]; then printf "%s\\n" "Oracle saw: $ARGS" > "$OUT"; fi',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--thinking',
          'heavy',
          '--model',
          'gpt-5.5-pro',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('--model gpt-5.5-pro --browser-model-strategy select');
        expect(output).toContain('--browser-thinking-time heavy');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.model.thinking).toBe('heavy');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('oracle doctor probes binary capabilities and reports ready', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-doctor-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.13.0";;',
            '  *) printf "%s\\n" "Usage: oracle --engine browser --browser-archive never --write-output <p> --browser-follow-up <t> --followup <id> --browser-model-strategy current --browser-cookie-path <path> --chatgpt-url <url> --heartbeat <seconds>";;',
            'esac',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--oracle-bin', oraclePath, '--json']);
        expect(doctor.status).toBe(0);
        const readiness = JSON.parse(doctor.stdout);
        expect(readiness.status).toBe('ready');
        expect(readiness.agent_actions).toEqual([]);
        expect(readiness.oracle.installed).toBe(true);
        expect(readiness.oracle.binary).toBe(oraclePath);
        expect(readiness.oracle.version).toBe('0.13.0');
        expect(readiness.oracle.capabilities).toEqual({
          browserEngine: true,
          writeOutput: true,
          browserFollowup: true,
          sessionFollowup: true,
          browserArchive: true,
          browserModelStrategy: true,
          browserCookiePath: true,
          browserThinkingTime: true,
          chatgptUrl: true,
          heartbeat: true,
        });
        expect(readiness.oracle.missingCapabilities).toEqual([]);

        const missing = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--oracle-bin', join(binDir, 'nope'), '--json'], ROOT, {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        });
        const missingReadiness = JSON.parse(missing.stdout);
        expect(missingReadiness.status).toBe('unavailable');
        expect(missingReadiness.code).toBe('ORACLE_NOT_INSTALLED');
        expect(missingReadiness.oracle.installed).toBe(false);
        expect(missingReadiness.oracle.resolvedFrom).toBe('--oracle-bin');
        expect(missingReadiness.oracle.error.message).toContain('--oracle-bin');
        expect(missingReadiness.agent_actions).toHaveLength(1);
        expect(missingReadiness.agent_actions[0]).toMatchObject({
          id: 'chatgpt-oracle-fix-configured-source',
          status: 'needs_agent',
          requires_agent: true,
          command: 'repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --oracle-bin <path-to-pinned-oracle> --json',
          automatic: false,
          verification: 'repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json',
        });
        expect(missingReadiness.agent_actions[0].reason).toContain('--oracle-bin');
        expect(missingReadiness.agent_actions[0].reason).toContain('globally will not fix');
        expect(missingReadiness.agent_actions[0].risk).toContain('explicit Oracle binary selection');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('oracle doctor requires every runtime flag before reporting ready', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-incompatible-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'for a in "$@"; do',
            '  if [ "$a" = "--browser-thinking-time" ]; then printf "%s\\n" "error: unknown option --browser-thinking-time" >&2; exit 1; fi',
            'done',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.12.0";;',
            '  *) printf "%s\\n" "Usage: oracle --engine browser --write-output <p>";;',
            'esac',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--oracle-bin', oraclePath, '--json']);
        expect(doctor.status).toBe(0);
        const readiness = JSON.parse(doctor.stdout);
        expect(readiness.status).toBe('action_required');
        expect(readiness.code).toBe('ORACLE_INCOMPATIBLE');
        expect(readiness.oracle.capabilities).toEqual({
          browserEngine: true,
          writeOutput: true,
          browserFollowup: false,
          sessionFollowup: false,
          browserArchive: false,
          browserModelStrategy: false,
          browserCookiePath: false,
          browserThinkingTime: false,
          chatgptUrl: false,
          heartbeat: false,
        });
        expect(readiness.oracle.missingCapabilities).toEqual(['browserFollowup', 'sessionFollowup', 'browserArchive', 'browserModelStrategy', 'browserCookiePath', 'browserThinkingTime', 'chatgptUrl', 'heartbeat']);
        expect(readiness.oracle.error.message).toContain('browserFollowup');
        expect(readiness.agent_actions).toHaveLength(1);
        expect(readiness.agent_actions[0]).toMatchObject({
          id: 'chatgpt-oracle-fix-configured-source',
          status: 'needs_agent',
          requires_agent: true,
          command: 'repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --oracle-bin <path-to-pinned-oracle> --json',
          automatic: false,
        });
        expect(readiness.agent_actions[0].reason).toContain('browserFollowup');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('oracle doctor repairs repo-local and env-selected binaries through source-aware actions', () => {
    withRepo((repoRoot) => {
      const repoBinDir = join(repoRoot, 'node_modules/.bin');
      mkdirSync(repoBinDir, { recursive: true });
      const repoOracle = join(repoBinDir, 'oracle');
      writeFileSync(
        repoOracle,
        [
          '#!/bin/sh',
          'case "$1" in',
          '  --version) printf "%s\\n" "0.12.0";;',
          '  *) printf "%s\\n" "Usage: oracle --engine browser --write-output <p>";;',
          'esac',
        ].join('\n'),
      );
      chmodSync(repoOracle, 0o755);

      const repoLocal = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--json']);
      expect(repoLocal.status).toBe(0);
      const repoLocalReadiness = JSON.parse(repoLocal.stdout);
      expect(repoLocalReadiness.status).toBe('action_required');
      expect(repoLocalReadiness.oracle.resolvedFrom).toBe('node_modules/.bin');
      expect(repoLocalReadiness.agent_actions[0]).toMatchObject({
        id: 'chatgpt-oracle-upgrade-pinned',
        command: 'bun add -D @steipete/oracle@0.14.1',
      });

      const envSelected = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--json'], ROOT, {
        ...process.env,
        REPO_HARNESS_ORACLE_BIN: join(repoRoot, 'missing-oracle'),
      });
      expect(envSelected.status).toBe(0);
      const envReadiness = JSON.parse(envSelected.stdout);
      expect(envReadiness.status).toBe('unavailable');
      expect(envReadiness.oracle.resolvedFrom).toBe('REPO_HARNESS_ORACLE_BIN');
      expect(envReadiness.agent_actions[0]).toMatchObject({
        id: 'chatgpt-oracle-fix-configured-source',
        command: 'REPO_HARNESS_ORACLE_BIN=<path-to-pinned-oracle> repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json',
      });
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
      const userDataDir = join(repoRoot, 'Chrome/User Data');
      const profileDir = join(userDataDir, 'Profile 1');
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(join(userDataDir, 'Local State'), '{}\n');
      writeFileSync(join(profileDir, 'Preferences'), '{}\n');
      writeFileSync(join(profileDir, 'Cookies'), 'fake cookie db\n');
      const setup = runChatgpt([
        'browser-setup',
        '--repo',
        repoRoot,
        '--profile-dir',
        profileDir,
        '--browser-channel',
        'chrome',
      ]);
      expect(setup.status).toBe(0);

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-followup-bin-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'printf "%s\\n" "Session ID: oracle_followup_456"',
            'if [ -n "$OUT" ]; then printf "%s\\n" "Oracle saw: $ARGS" > "$OUT"; fi',
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
          '--oracle-bin',
          oraclePath,
        ]);
        expect(followup.status).toBe(0);
        const followupPayload = JSON.parse(followup.stdout);
        const output = readFileSync(followupPayload.paths.output, 'utf-8');
        expect(output).toContain('--followup oracle_upstream_123');
        expect(output).not.toContain(initialPayload.sessionId);
        expect(output).not.toContain('--browser-cookie-path');
        const followupMeta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', followupPayload.sessionId, 'meta.json'), 'utf-8'));
        // Parent linkage points at the source conversation; the new session's own
        // providerSessionId reflects what oracle returned for the reopened run.
        expect(followupMeta.parentProviderSessionId).toBe('oracle_upstream_123');
        expect(followupMeta.providerSessionId).toBe('oracle_followup_456');
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
    const gptproSkill = join(ROOT, 'assets/skill-commands/repo-harness-gptpro/SKILL.md');
    expect(readFileSync(guide, 'utf-8')).toContain('repo-harness chatgpt browser-consult');
    expect(readFileSync(guide, 'utf-8')).toContain('--provider native');
    expect(readFileSync(guide, 'utf-8')).toContain('--provider bridge');
    expect(readFileSync(guide, 'utf-8')).toContain('--browser-channel chrome');
    expect(readFileSync(guide, 'utf-8')).toContain('.ai/harness/handoff/gptpro/chatgpt-review-${stamp}.md');
    expect(readFileSync(guide, 'utf-8')).toContain('docs/researches/YYYYMMDD-<topic>.md');
    expect(readFileSync(guide, 'utf-8')).toContain('not `oracle-mcp`');
    expect(readFileSync(join(ROOT, 'docs/researches/README.md'), 'utf-8')).toContain('.ai/harness/handoff/gptpro/');
    expect(readFileSync(guide, 'utf-8')).toContain('Oracle CLI package currently requires `node >=24`');
    expect(readFileSync(guide, 'utf-8')).toContain('agent_actions');
    expect(readFileSync(guide, 'utf-8')).toContain('chatgpt-oracle-install-pinned');
    const browserSkillText = readFileSync(skill, 'utf-8');
    expect(browserSkillText).toContain('repo-harness-chatgpt-browser');
    expect(browserSkillText).toContain('--provider oracle --json');
    expect(browserSkillText).toContain('node >=24');
    expect(browserSkillText).toContain('chatgpt-oracle-install-pinned');
    expect(browserSkillText).toContain('default repo-harness install');
    const gptproSkillText = readFileSync(gptproSkill, 'utf-8');
    expect(gptproSkillText).toContain('date -u +%Y%m%dT%H%M%SZ');
    expect(gptproSkillText).toContain('mkdir -p .ai/harness/handoff/gptpro');
    expect(gptproSkillText).toContain('.ai/harness/handoff/gptpro/gptpro-${stamp}-${slug}.md');
    expect(gptproSkillText).toContain('--model gpt-5.5-pro');
    expect(gptproSkillText).toContain('MCP Read-Back Acceptance');
    expect(gptproSkillText).toContain('chatgpt.serverName');
    expect(gptproSkillText).toContain('.repo-harness/mcp.local.json');
    expect(gptproSkillText).toContain('MCP Read Evidence');
    expect(gptproSkillText).not.toContain('kito-mcp');
    expect(gptproSkillText).not.toContain('gptpro-consult.md');
  });
});
