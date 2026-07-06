import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { PassThrough, Writable } from 'stream';
import { runGlobalRuntimeSetup } from '../../src/cli/commands/global-runtime';
import { resolveOptionalRuntimeDeps } from '../../src/cli/index';

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
    const bunLog = join(tmp, 'bun.log');
    const bunxLog = join(tmp, 'bunx.log');
    const codegraphLog = join(tmp, 'codegraph.log');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      mkdirSync(join(home, '.agents', 'rules'), { recursive: true });
      writeFileSync(join(home, '.agents', 'rules', 'anti-patterns.md'), 'anti\n');
      writeFileSync(join(home, '.agents', 'rules', 'chinese.md'), 'zh\n');
      writeFileSync(join(home, '.agents', 'rules', 'durable-context.md'), 'durable\n');
      writeFileSync(join(home, '.agents', 'rules', 'english.md'), 'en\n');
      writeFakeCodegraph(fakeBin, codegraphLog);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nexit 0\n`);
      // The install/init external-skills bootstrap (installWazaSkills /
      // installMermaidSkill) invokes `bunx skills add ...` directly, and the
      // CodeGraph MCP configure step shells out to the real
      // scripts/check-agent-tooling.sh (for repo-agnostic tooling detection),
      // which also calls `bunx skills ls -g --json` for Waza status. This one
      // fake bunx answers both, so the read-only probe never hits the network.
      writeExecutable(join(fakeBin, 'bunx'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunxLog}"\nexit 0\n`);

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
      expect(readFileSync(bunLog, 'utf-8')).toContain(`add -g ${source}`);
      expect(result.steps.find((step) => step.step === 'sync repo-harness skill runtime')?.stdout).toContain(
        'sync runtime',
      );
      expect(existsSync(join(home, '.codex', 'hooks.json'))).toBe(true);
      expect(readFileSync(bunxLog, 'utf-8')).toContain(
        'skills add tw93/Waza -g -a codex -s think hunt check health -y',
      );
      expect(readFileSync(join(home, '.codex', 'rules', 'anti-patterns.md'), 'utf-8')).toBe('anti\n');
      expect(readFileSync(bunxLog, 'utf-8')).toContain(
        'skills add BfdCampos/dotfiles -g -a codex -s mermaid -y',
      );
      expect(existsSync(join(home, '.codex', 'skills', 'claude-review', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(home, '.claude', 'skills', 'codex-review', 'SKILL.md'))).toBe(false);
      expect(readFileSync(bunxLog, 'utf-8')).not.toContain('feature-dev');
      expect(JSON.parse(readFileSync(join(home, '.repo-harness', 'config.json'), 'utf-8')).brainRoot).toBe(
        join(home, 'Documents', 'brain'),
      );
      expect(readFileSync(codegraphLog, 'utf-8')).toContain('codegraph install --target codex --location global --yes');
      // Regression guard: the Waza status probe inside check-agent-tooling.sh
      // must go through bunx, not npx, so bun-only machines don't get a false
      // "Waza unavailable" report from the setup check diagnostic surface.
      expect(readFileSync(bunxLog, 'utf-8')).toContain('skills ls -g --json');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15000);

  test('repairs Bun dependency loop by reinstalling CLI from a packed tarball', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-cli-loop-'));
    const source = join(tmp, 'source');
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    const npmLog = join(tmp, 'npm.log');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeExecutable(
        join(fakeBin, 'bun'),
        [
          '#!/bin/bash',
          'set -euo pipefail',
          `printf '%s\\n' "$*" >> "${bunLog}"`,
          `if [[ "$*" == "add -g ${source}" ]]; then`,
          '  echo "error: DependencyLoop" >&2',
          '  echo "Resolution: repo-harness@../../../Projects/repo-harness" >&2',
          '  echo "Dependency: repo-harness@^9.9.9" >&2',
          '  exit 1',
          'fi',
          'exit 0',
          '',
        ].join('\n'),
      );
      writeExecutable(
        join(fakeBin, 'npm'),
        [
          '#!/bin/bash',
          'set -euo pipefail',
          `printf '%s\\n' "$*" >> "${npmLog}"`,
          'if [[ "${1:-}" == "pack" ]]; then',
          '  destination=""',
          '  for ((i=1; i<=$#; i++)); do',
          '    if [[ "${!i}" == "--pack-destination" ]]; then',
          '      next=$((i + 1))',
          '      destination="${!next}"',
          '    fi',
          '  done',
          '  mkdir -p "$destination"',
          '  touch "$destination/repo-harness-9.9.9.tgz"',
          '  printf \'[{"filename":"repo-harness-9.9.9.tgz"}]\\n\'',
          '  exit 0',
          'fi',
          'exit 1',
          '',
        ].join('\n'),
      );

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
        env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
      });

      expect(result.exitCode).toBe(0);
      const install = result.steps.find((step) => step.step === 'install repo-harness CLI');
      expect(install?.status).toBe('ok');
      expect(install?.detail).toBe('version=9.9.9; repaired=packed-tarball');
      const bunCommands = readFileSync(bunLog, 'utf-8').trim().split('\n');
      expect(bunCommands[0]).toBe(`add -g ${source}`);
      expect(bunCommands[1]).toBe('remove -g repo-harness');
      expect(bunCommands[2]).toBe(`add -g ${join(home, '.repo-harness', 'packages', 'repo-harness-9.9.9.tgz')}`);
      expect(existsSync(join(home, '.repo-harness', 'packages', 'repo-harness-9.9.9.tgz'))).toBe(true);
      expect(readFileSync(npmLog, 'utf-8')).toContain('pack --json --pack-destination');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

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
      writeExecutable(join(fakeBin, 'bun'), '#!/bin/bash\nexit 0\n');
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

  test('skips CLI self-install when running from the Bun global package source', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-self-install-'));
    const home = join(tmp, 'home');
    const source = join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nexit 42\n`);

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          BUN_INSTALL: join(home, '.bun'),
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      const installStep = result.steps.find((step) => step.step === 'install repo-harness CLI');
      expect(result.exitCode).toBe(0);
      expect(installStep?.status).toBe('skipped');
      expect(installStep?.detail).toContain('already installed from Bun global package source');
      expect(existsSync(bunLog)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('skips CLI self-install when Bun global package links to the workspace source', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-linked-source-'));
    const home = join(tmp, 'home');
    const source = join(tmp, 'workspace', 'repo-harness');
    const globalPackage = join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(join(globalPackage, '..'), { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      symlinkSync(source, globalPackage, 'dir');
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nexit 42\n`);

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          BUN_INSTALL: join(home, '.bun'),
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      const installStep = result.steps.find((step) => step.step === 'install repo-harness CLI');
      expect(result.exitCode).toBe(0);
      expect(installStep?.status).toBe('skipped');
      expect(installStep?.detail).toContain('already installed from Bun global package source');
      expect(existsSync(bunLog)).toBe(false);
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
    expect(res.stdout).toContain('--refresh');
    expect(res.stdout).not.toContain('--with-optional');
    expect(res.stdout).not.toContain('--project-type');
    expect(res.stdout).not.toContain('setup-plugins');
  });

  test('CLI update refreshes user-level runtime without touching the current repo', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-cli-update-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nexit 0\n`);

      const res = spawnSync(
        process.execPath,
        [
          CLI,
          'update',
          '--no-sync-skill',
          '--no-hooks',
          '--no-external-skills',
          '--no-codegraph',
          '--json',
        ],
        {
          cwd: repo,
          encoding: 'utf-8',
          env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
        },
      );

      expect(res.status).toBe(0);
      const result = JSON.parse(res.stdout);
      expect(readFileSync(bunLog, 'utf-8')).toContain('add -g repo-harness@latest');
      expect(result.steps.find((step: { step: string }) => step.step === 'configure brain root')?.status).toBe('ok');
      expect(existsSync(join(home, '.repo-harness', 'config.json'))).toBe(true);
      expect(existsSync(join(repo, '.ai'))).toBe(false);
      expect(existsSync(join(repo, 'tasks'))).toBe(false);
      expect(existsSync(join(repo, 'plans'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI update --version installs the requested package version', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-cli-update-version-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nexit 0\n`);

      const res = spawnSync(
        process.execPath,
        [
          CLI,
          'update',
          '--version',
          '9.9.9',
          '--no-sync-skill',
          '--no-hooks',
          '--no-external-skills',
          '--no-codegraph',
          '--json',
        ],
        {
          cwd: repo,
          encoding: 'utf-8',
          env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
        },
      );

      expect(res.status).toBe(0);
      expect(JSON.parse(res.stdout).steps.find((step: { step: string }) => step.step === 'install repo-harness CLI')?.detail).toBe(
        'spec=repo-harness@9.9.9',
      );
      expect(readFileSync(bunLog, 'utf-8')).toContain('add -g repo-harness@9.9.9');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI top-level --version still prints the CLI version', () => {
    const res = spawnSync(process.execPath, [CLI, '--version'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('CLI update --check is read-only setup readiness output', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-cli-update-check-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });

      const res = spawnSync('bun', [CLI, 'update', '--check', '--target', 'codex', '--json'], {
        cwd: repo,
        encoding: 'utf-8',
        env: { ...process.env, HOME: home },
      });

      const s = res.status;
      expect([0, 1]).toContain(s!);
      const report = JSON.parse(res.stdout);
      expect(report.version).toBe(1);
      expect(report.target).toBe('codex');
      expect(existsSync(join(home, '.repo-harness'))).toBe(false);
      expect(existsSync(join(repo, '.ai'))).toBe(false);
      expect(existsSync(join(repo, 'tasks'))).toBe(false);
      expect(existsSync(join(repo, 'plans'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15000);

  test('CLI exposes update help for user-level refresh', () => {
    const res = spawnSync('bun', [CLI, 'update', '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: repo-harness update');
    expect(res.stdout).toContain('--version <version>');
    expect(res.stdout).toContain('--channel <channel>');
    expect(res.stdout).toContain('--check');
    expect(res.stdout).toContain('--no-runtime-refresh');
    expect(res.stdout).toContain('--with-external-skills');
    expect(res.stdout).toContain('--configure-codegraph');
    expect(res.stdout).toContain('--no-cli');
    expect(res.stdout).toContain('Deprecated: use repo-harness adopt --repo <path>');
  });

  test('CLI install bootstraps non-interactively over piped (non-TTY) stdio with default-on optional deps', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-cli-install-non-tty-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    const bunxLog = join(tmp, 'bunx.log');
    const npxLog = join(tmp, 'npx.log');
    const codegraphLog = join(tmp, 'codegraph.log');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFakeCodegraph(fakeBin, codegraphLog);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nexit 0\n`);
      writeExecutable(join(fakeBin, 'bunx'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunxLog}"\nexit 0\n`);
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

      // spawnSync's stdio pipes are never a TTY (isTTY is undefined), so this
      // exercises the non-interactive branch of runGlobalRuntimeBootstrap.
      // Passing input (even empty) closes stdin immediately, so a wrongly
      // interactive code path would fail fast on EOF instead of hanging.
      // Use process.execPath (not literal 'bun') since PATH below is
      // overridden with a fake bin dir; a literal 'bun' command would
      // resolve to the fake shim and never actually run the CLI script.
      const res = spawnSync(
        process.execPath,
        [CLI, 'install', '--target', 'codex', '--no-sync-skill', '--no-hooks'],
        {
          cwd: repo,
          encoding: 'utf-8',
          input: '',
          timeout: 20000,
          env: {
            ...process.env,
            HOME: home,
            PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
            AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: '0',
          },
        },
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('install repo-harness CLI');
      expect(readFileSync(bunxLog, 'utf-8')).toContain('skills add tw93/Waza');
      expect(readFileSync(bunxLog, 'utf-8')).toContain('skills add BfdCampos/dotfiles');
      expect(readFileSync(codegraphLog, 'utf-8')).toContain('codegraph install --target codex --location global --yes');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 25000);
});

describe('resolveOptionalRuntimeDeps (interactive optional-dep prompts)', () => {
  test('non-interactive keeps default-on behavior regardless of flags omitted', async () => {
    const result = await resolveOptionalRuntimeDeps({ target: 'both' }, undefined, { interactive: false });
    expect(result).toEqual({ externalSkills: true, codegraph: true });
  });

  test('non-interactive still honors explicit --no-* flags without prompting', async () => {
    const result = await resolveOptionalRuntimeDeps(
      { target: 'both', externalSkills: false, codegraph: false },
      undefined,
      { interactive: false },
    );
    expect(result).toEqual({ externalSkills: false, codegraph: false });
  });

  test('interactive mode prompts, and answering "n" skips both optional deps', async () => {
    const input = new PassThrough();
    ['n\n', 'n\n'].forEach((answer, index) => {
      setTimeout(() => input.write(answer), index * 5);
    });
    setTimeout(() => input.end(), 20);
    const outputChunks: string[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        outputChunks.push(String(chunk));
        callback();
      },
    });

    const result = await resolveOptionalRuntimeDeps({ target: 'both' }, undefined, {
      interactive: true,
      input,
      output,
    });

    expect(result).toEqual({ externalSkills: false, codegraph: false });
    expect(outputChunks.join('')).toContain('Install external skills');
    expect(outputChunks.join('')).toContain('Install CodeGraph CLI');
  });

  test('interactive mode keeps the default-on outcome when the answer is blank (Enter)', async () => {
    const input = new PassThrough();
    ['\n', '\n'].forEach((answer, index) => {
      setTimeout(() => input.write(answer), index * 5);
    });
    setTimeout(() => input.end(), 20);
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    const result = await resolveOptionalRuntimeDeps({ target: 'both' }, undefined, {
      interactive: true,
      input,
      output,
    });

    expect(result).toEqual({ externalSkills: true, codegraph: true });
  });

  test('interactive mode does not prompt for a flag explicitly passed on the CLI', async () => {
    const input = new PassThrough();
    // Only externalSkills should be prompted (codegraph was explicit via
    // --no-codegraph); a single "n" answer must apply to that one prompt.
    setTimeout(() => input.write('n\n'), 5);
    setTimeout(() => input.end(), 20);
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const cmd = { getOptionValueSource: (key: string) => (key === 'codegraph' ? 'cli' : 'default') };

    const result = await resolveOptionalRuntimeDeps({ target: 'both', codegraph: false }, cmd, {
      interactive: true,
      input,
      output,
    });

    expect(result).toEqual({ externalSkills: false, codegraph: false });
  });
});
