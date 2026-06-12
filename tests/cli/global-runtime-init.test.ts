import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { runGlobalRuntimeSetup } from '../../src/cli/commands/global-runtime';

const ROOT = join(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'src/cli/index.ts');

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

function setupFakeSource(root: string): void {
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'assets', 'skills', 'codex-review'), { recursive: true });
  mkdirSync(join(root, 'assets', 'skills', 'claude-review'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '9.9.9' }, null, 2));
  writeFileSync(join(root, 'assets', 'skills', 'codex-review', 'SKILL.md'), 'codex-review\n');
  writeFileSync(join(root, 'assets', 'skills', 'claude-review', 'SKILL.md'), 'claude-review\n');
  writeExecutable(
    join(root, 'scripts', 'sync-codex-installed-copies.sh'),
    '#!/bin/bash\nset -euo pipefail\necho "sync runtime link=${AGENTIC_DEV_LINK_INSTALLED_COPIES:-unset}"\n',
  );
}

function writeFakeCodegraph(fakeBin: string, logFile: string): void {
  writeExecutable(
    join(fakeBin, 'codegraph'),
    [
      '#!/bin/bash',
      'set -euo pipefail',
      `echo "codegraph $*" >> "${logFile}"`,
      'case "${1:-}" in',
      '  "--version") echo "0.9.6" ;;',
      '  "status") echo "CodeGraph Status"; echo "Index is up to date" ;;',
      '  "install")',
      '    if [[ " $* " == *" --target codex "* ]]; then',
      '      mkdir -p "$HOME/.codex"',
      '      cat > "$HOME/.codex/config.toml" <<\'TOML\'',
      '[mcp_servers.codegraph]',
      'command = "codegraph"',
      'args = ["serve", "--mcp"]',
      'TOML',
      '    fi',
      '    echo "installed" ;;',
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'),
  );
}

describe('init command global runtime bootstrap', () => {
  test('installs CLI, hooks, Waza, brain root, and CodeGraph without setup-plugins.sh', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-'));
    const source = join(tmp, 'node_modules', 'repo-harness');
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const npmLog = join(tmp, 'npm.log');
    const npxLog = join(tmp, 'npx.log');
    const codegraphLog = join(tmp, 'codegraph.log');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, codegraphLog);
      writeExecutable(join(fakeBin, 'npm'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${npmLog}"\nexit 0\n`);
      writeExecutable(
        join(fakeBin, 'npx'),
        [
          '#!/bin/bash',
          'set -euo pipefail',
          `printf '%s\\n' "$*" >> "${npxLog}"`,
          'if [[ "$*" == *"skills ls -g --json"* ]]; then echo "[]"; fi',
          'exit 0',
          '',
        ].join('\n'),
      );

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        target: 'codex',
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: '0',
        },
      });

      expect(result.exitCode).toBe(0);
      expect(readFileSync(npmLog, 'utf-8')).toContain(`install -g ${source}`);
      expect(result.steps.find((step) => step.step === 'sync repo-harness skill runtime')?.stdout).toContain(
        'sync runtime',
      );
      expect(existsSync(join(home, '.codex', 'hooks.json'))).toBe(true);
      expect(readFileSync(npxLog, 'utf-8')).toContain(
        '-y skills add tw93/Waza -g -a codex -s think hunt check health -y',
      );
      expect(readFileSync(npxLog, 'utf-8')).toContain(
        '-y skills add BfdCampos/dotfiles -g -a codex -s mermaid -y',
      );
      expect(existsSync(join(home, '.codex', 'skills', 'claude-review', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(home, '.claude', 'skills', 'codex-review', 'SKILL.md'))).toBe(false);
      expect(readFileSync(npxLog, 'utf-8')).not.toContain('feature-dev');
      expect(JSON.parse(readFileSync(join(home, '.repo-harness', 'config.json'), 'utf-8')).brainRoot).toBe(
        join(home, 'Documents', 'brain'),
      );
      expect(readFileSync(codegraphLog, 'utf-8')).toContain('codegraph install --target codex --location global --yes');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15000);

  test('npx cache sources force copy-based installed skill sync', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-npx-'));
    const source = join(tmp, '_npx', 'abc123', 'node_modules', 'repo-harness');
    const home = join(tmp, 'home');
    const fakeBin = join(tmp, 'bin');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeExecutable(join(fakeBin, 'npm'), '#!/bin/bash\nexit 0\n');
      writeExecutable(join(fakeBin, 'npx'), '#!/bin/bash\nexit 0\n');

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        installCli: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === 'sync repo-harness skill runtime')?.stdout).toContain(
        'link=0',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI exposes init help for npx users without legacy plugin options', () => {
    const res = spawnSync('bun', [CLI, 'init', '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: repo-harness init');
    expect(res.stdout).toContain('--target <target>');
    expect(res.stdout).toContain('--no-cli');
    expect(res.stdout).toContain('--brain-root <path>');
    expect(res.stdout).not.toContain('--with-optional');
    expect(res.stdout).not.toContain('--project-type');
    expect(res.stdout).not.toContain('setup-plugins');
  });
});
