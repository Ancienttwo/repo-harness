import { describe, expect, test } from 'bun:test';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { PassThrough, Writable } from 'stream';
import { runGlobalRuntimeSetup } from '../../src/cli/commands/global-runtime';
import { resolveOptionalRuntimeDeps } from '../../src/cli/index';

const ROOT = join(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'src/cli/index.ts');
const REVERSE_PROVIDER = 'zhaoxuya520/reverse-skill@539899ddc7608d63dc66e08e794d572e080f1a55';
const REVERSE_FAKE_TREE_INTEGRITY = 'sha256:0089d4f8f81d3c4b8b055ac9a3674838cdb064ffae2f4c99d357977d3719baae';

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

function setupFakeSource(root: string): void {
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'assets', 'skills', 'repo-harness-cross-review'), { recursive: true });
  // installWazaSkills()/installMermaidSkill()/syncCrossReviewSkills() now read
  // sourceRoot's skill-surface manifest (see loadSkillSurfaceCatalog in
  // global-runtime.ts); a real copy keeps this synthetic package tree
  // loadable exactly like the real repo.
  mkdirSync(join(root, 'assets', 'skill-commands'), { recursive: true });
  copyFileSync(
    join(ROOT, 'assets', 'skill-commands', 'manifest.json'),
    join(root, 'assets', 'skill-commands', 'manifest.json'),
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'repo-harness', version: '9.9.9' }, null, 2));
  writeFileSync(join(root, 'assets', 'skills', 'repo-harness-cross-review', 'SKILL.md'), 'repo-harness-cross-review\n');
  writeExecutable(
    join(root, 'scripts', 'sync-codex-installed-copies.sh'),
    '#!/bin/bash\nset -euo pipefail\necho "sync runtime link=${AGENTIC_DEV_LINK_INSTALLED_COPIES:-unset}"\n',
  );
  writeExecutable(
    join(root, 'scripts', 'install-agent-fleet.sh'),
    '#!/bin/bash\nset -euo pipefail\necho "fleet installed"\n',
  );
}

function setReverseSkillIntegrity(root: string, integrity: string | null): void {
  const manifestPath = join(root, 'assets', 'skill-commands', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const pkg = manifest.packages.find(({ name }: { name: string }) => name === 'reverse-skill-router');
  if (!pkg) throw new Error('reverse-skill-router missing from fixture manifest');
  pkg.integrity = integrity;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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

function setupManagedRuntimeReadback(home: string, fakeBin: string, harnessVersion = '9.9.9'): void {
  const globalModules = join(home, '.bun', 'install', 'global', 'node_modules');
  const harness = join(globalModules, 'repo-harness');
  const archctx = join(globalModules, 'archctx');
  mkdirSync(harness, { recursive: true });
  mkdirSync(join(archctx, 'bin'), { recursive: true });
  mkdirSync(join(globalModules, 'archctx-contracts'), { recursive: true });
  mkdirSync(join(globalModules, '@colbymchenry', 'codegraph'), { recursive: true });
  writeFileSync(join(harness, 'package.json'), JSON.stringify({
    name: 'repo-harness',
    version: harnessVersion,
    dependencies: { archctx: '0.4.1', 'archctx-contracts': '0.4.1' },
  }));
  writeFileSync(join(archctx, 'package.json'), JSON.stringify({
    name: 'archctx',
    version: '0.4.1',
    engines: { node: '>=24 <26' },
    bin: { archctx: './bin/archctx.mjs' },
    dependencies: { '@colbymchenry/codegraph': '1.5.0' },
  }));
  writeExecutable(join(archctx, 'bin', 'archctx.mjs'), '#!/usr/bin/env node\n');
  writeFileSync(join(globalModules, 'archctx-contracts', 'package.json'), JSON.stringify({ name: 'archctx-contracts', version: '0.4.1' }));
  writeFileSync(join(globalModules, '@colbymchenry', 'codegraph', 'package.json'), JSON.stringify({ name: '@colbymchenry/codegraph', version: '1.5.0' }));
  const systemNode = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf-8' }).stdout.trim();
  writeExecutable(join(fakeBin, 'node'), [
    '#!/bin/bash',
    'if [[ "${1:-}" == "--version" ]]; then echo v24.11.0; exit 0; fi',
    `if [[ "\${1:-}" == *"/archctx/bin/archctx.mjs" ]]; then printf '%s\\n' '${JSON.stringify({
      schemaVersion: 'archcontext.capabilities/v1',
      package: { name: 'archctx', version: '0.4.1' },
      protocols: {
        projectionRequest: 'archcontext.projection-request/v1',
        projectionResult: 'archcontext.projection-result/v1',
        architectureRefreshSignal: 'archcontext.architecture-refresh-signal/v1',
      },
      renderers: { architectureDocs: 'archcontext.docs-renderer/v2', agentContext: 'archcontext.agent-context-renderer/v1' },
      features: ['architecture-docs-renderer-v2', 'architecture-refresh-signal-v1', 'projection-protocol-v1'],
    })}'; exit 0; fi`,
    `exec "${systemNode}" "$@"`,
    '',
  ].join('\n'));
}

describe('install command global runtime bootstrap', () => {
  test('upgrades an old Bun runtime before any global install or update steps', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-bun-floor-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(home, '.bun', 'bin');
    const bunLog = join(tmp, 'bun.log');
    const upgradedMarker = join(tmp, 'upgraded');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(
        join(fakeBin, 'bun'),
        [
          '#!/bin/bash',
          `printf '%s\n' "$*" >> "${bunLog}"`,
          `if [[ "\${1:-}" == "upgrade" ]]; then touch "${upgradedMarker}"; exit 0; fi`,
          `if [[ "\${1:-}" == "--version" ]]; then [[ -f "${upgradedMarker}" ]] && echo "1.1.35" || echo "1.1.34"; exit 0; fi`,
          'exit 99',
          '',
        ].join('\n'),
      );

      const result = runGlobalRuntimeSetup({
        cwd: repo,
        profile: 'minimal',
        installCli: false,
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

      expect(result.exitCode).toBe(0);
      expect(result.steps[0]).toMatchObject({
        step: 'ensure Bun runtime',
        status: 'ok',
        detail: 'upgraded=1.1.35; minimum=1.1.35',
      });
      expect(readFileSync(bunLog, 'utf-8')).toBe('--version\nupgrade\n--version\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('an old package-manager-owned Bun fails closed with its manager upgrade command', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-managed-bun-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'Cellar', 'bun', '1.1.34', 'bin');
    const bunLog = join(tmp, 'bun.log');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(
        join(fakeBin, 'bun'),
        [
          '#!/bin/bash',
          `printf '%s\n' "$*" >> "${bunLog}"`,
          'if [[ "${1:-}" == "--version" ]]; then echo "1.1.34"; exit 0; fi',
          'exit 99',
          '',
        ].join('\n'),
      );

      const result = runGlobalRuntimeSetup({
        cwd: repo,
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps[0]?.status).toBe('failed');
      expect(result.steps[0]?.stderr).toContain('run `brew upgrade bun`, then retry');
      expect(readFileSync(bunLog, 'utf-8')).toBe('--version\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI subprocesses stay bound to the validated launcher Bun when PATH contains an older Bun', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-path-mismatch-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(
        join(fakeBin, 'bun'),
        `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.0.0; exit 0; fi\nexit 99\n`,
      );
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: home,
        BUN_INSTALL: join(home, '.bun'),
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      };
      const harnessVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string;
      setupManagedRuntimeReadback(home, fakeBin, harnessVersion);
      delete childEnv.REPO_HARNESS_BUN_EXECUTABLE;

      const res = spawnSync(
        process.execPath,
        [
          CLI,
          'update',
          '--no-cli',
          '--no-sync-skill',
          '--no-hooks',
          '--no-external-skills',
          '--no-codegraph',
          '--json',
        ],
        { cwd: repo, encoding: 'utf-8', env: childEnv },
      );

      expect(res.status, `${res.stderr}\n${res.stdout}`).toBe(0);
      const steps = JSON.parse(res.stdout).steps as Array<{ step: string; status: string; command?: string[] }>;
      const runtimeStep = steps.find((step) => step.step === 'ensure Bun runtime')!;
      expect(runtimeStep.status).toBe('skipped');
      expect(runtimeStep.command?.[0]).toBe(process.execPath);
      expect(steps.find((step) => step.step === 'install repo-harness CLI')?.status).toBe('skipped');
      expect(existsSync(bunLog)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

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
      setReverseSkillIntegrity(source, REVERSE_FAKE_TREE_INTEGRITY);
      mkdirSync(join(home, '.agents', 'rules'), { recursive: true });
      writeFileSync(join(home, '.agents', 'rules', 'anti-patterns.md'), 'anti\n');
      writeFileSync(join(home, '.agents', 'rules', 'chinese.md'), 'zh\n');
      writeFileSync(join(home, '.agents', 'rules', 'durable-context.md'), 'durable\n');
      writeFileSync(join(home, '.agents', 'rules', 'english.md'), 'en\n');
      writeFakeCodegraph(fakeBin, codegraphLog);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; fi\nexit 0\n`);
      // The install/init provider-driven external-skills bootstrap invokes
      // `bunx skills add ...` directly, and the
      // CodeGraph MCP configure step shells out to the real
      // scripts/check-agent-tooling.sh (for repo-agnostic tooling detection),
      // which also calls `bunx skills ls -g --json` for Waza status. This one
      // fake bunx answers both, so the read-only probe never hits the network.
      writeExecutable(join(fakeBin, 'bunx'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunxLog}"\nif [[ "\${1:-}" == "skills" && "\${2:-}" == "add" ]]; then if [[ " $* " == *" tw93/Waza "* ]]; then names='think hunt check health'; elif [[ " $* " == *" zhaoxuya520/reverse-skill@"* ]]; then names='reverse-skill-router'; else names='mermaid'; fi; for skill in $names; do mkdir -p "$HOME/.agents/skills/$skill"; printf '# %s\\n' "$skill" > "$HOME/.agents/skills/$skill/SKILL.md"; done; fi\nexit 0\n`);

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        target: 'codex',
        profile: 'full',
        externalSkills: true,
        reverseSkill: true,
        codegraph: true,
        brainRoot: join(home, 'brain'),
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
      expect(readFileSync(bunxLog, 'utf-8')).toContain(
        `skills add ${REVERSE_PROVIDER} -g -a codex -s reverse-skill-router -y`,
      );
      expect(existsSync(join(home, '.codex', 'skills', 'reverse-skill-router', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(home, '.codex', 'skills', 'repo-harness-cross-review', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(home, '.claude', 'skills', 'repo-harness-cross-review', 'SKILL.md'))).toBe(false);
      expect(readFileSync(bunxLog, 'utf-8')).not.toContain('feature-dev');
      expect(JSON.parse(readFileSync(join(home, '.repo-harness', 'config.json'), 'utf-8')).brainRoot).toBe(
        join(home, 'brain'),
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

  test('update mode reconciles mandatory dependencies and refreshes explicitly selected Waza, Mermaid, and CodeGraph', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-managed-update-'));
    const source = join(tmp, 'source');
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
      setupManagedRuntimeReadback(home, fakeBin);
      for (const skill of ['think', 'hunt', 'check', 'health', 'mermaid']) {
        mkdirSync(join(home, '.agents', 'skills', skill), { recursive: true });
        writeFileSync(join(home, '.agents', 'skills', skill, 'SKILL.md'), `# stale ${skill}\n`);
      }
      mkdirSync(join(home, '.agents', 'rules'), { recursive: true });
      mkdirSync(join(home, '.codex', 'rules'), { recursive: true });
      for (const rule of ['anti-patterns.md', 'chinese.md', 'durable-context.md', 'english.md']) {
        writeFileSync(join(home, '.agents', 'rules', rule), '# stale rule\n');
        writeFileSync(join(home, '.codex', 'rules', rule), '# stale rule\n');
      }
      writeFakeCodegraph(fakeBin, codegraphLog);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; fi\nexit 0\n`);
      writeExecutable(join(fakeBin, 'bunx'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunxLog}"\nif [[ " $* " == *" tw93/Waza "* ]]; then for rule in anti-patterns.md chinese.md durable-context.md english.md; do printf '# refreshed rule\\n' > "$HOME/.agents/rules/$rule"; done; fi\nexit 0\n`);

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        target: 'codex',
        profile: 'full',
        installSpec: 'repo-harness@9.9.9',
        updateMode: true,
        externalSkills: true,
        syncSkill: false,
        hostAdapters: false,
        env: {
          ...process.env,
          HOME: home,
          BUN_INSTALL: join(home, '.bun'),
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          REPO_HARNESS_BUN_EXECUTABLE: join(fakeBin, 'bun'),
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: '0',
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === 'verify managed runtime dependencies')).toMatchObject({ status: 'ok' });
      expect(readFileSync(bunxLog, 'utf-8')).toContain('skills add tw93/Waza -g -a codex -s think hunt check health -y');
      expect(readFileSync(bunxLog, 'utf-8')).toContain('skills add BfdCampos/dotfiles -g -a codex -s mermaid -y');
      expect(readFileSync(bunLog, 'utf-8')).toContain('add -g @colbymchenry/codegraph@1.5.0');
      expect(result.steps.find((step) => step.step === 'ensure CodeGraph CLI')?.detail).toBe('updated=1.5.0');
      expect(readFileSync(join(home, '.codex', 'rules', 'chinese.md'), 'utf-8')).toBe('# refreshed rule\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15_000);

  test('update mode preserves the working CLI and fails closed when Bun leaves a stale mandatory dependency tree', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-managed-update-repair-'));
    const source = join(tmp, 'source');
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      setupManagedRuntimeReadback(home, fakeBin);
      const archctxManifest = join(home, '.bun', 'install', 'global', 'node_modules', 'archctx', 'package.json');
      const stale = JSON.parse(readFileSync(archctxManifest, 'utf-8'));
      stale.version = '0.3.0';
      writeFileSync(archctxManifest, JSON.stringify(stale));
      writeExecutable(join(fakeBin, 'bun'), [
        '#!/bin/bash',
        `printf '%s\\n' "$*" >> "${bunLog}"`,
        'if [[ "${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi',
        'exit 0',
        '',
      ].join('\n'));

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        profile: 'minimal',
        installSpec: 'repo-harness@9.9.9',
        updateMode: true,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          BUN_INSTALL: join(home, '.bun'),
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          REPO_HARNESS_BUN_EXECUTABLE: join(fakeBin, 'bun'),
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find((step) => step.step === 'verify managed runtime dependencies')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('managed runtime mismatch'),
      });
      const log = readFileSync(bunLog, 'utf-8');
      expect(log.match(/add -g repo-harness@9\.9\.9/g)).toHaveLength(1);
      expect(log).not.toContain('remove -g repo-harness');
      expect(existsSync(join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness', 'package.json'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15_000);

  test('fails closed before host projection when the pinned Reverse Skill tree digest drifts', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-reverse-skill-integrity-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const isolatedHomeLog = join(tmp, 'isolated-home.log');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(
        join(fakeBin, 'bun'),
        '#!/bin/bash\nif [[ "${1:-}" == "--version" ]]; then echo 1.3.14; fi\nexit 0\n',
      );
      writeExecutable(join(fakeBin, 'bunx'), `#!/bin/bash
printf '%s\n' "$HOME" > "${isolatedHomeLog}"
mkdir -p "$HOME/.agents/skills/reverse-skill-router" "$HOME/.codex/skills/reverse-skill-router"
printf '# drifted reverse-skill-router\n' > "$HOME/.agents/skills/reverse-skill-router/SKILL.md"
printf '# premature host projection\n' > "$HOME/.codex/skills/reverse-skill-router/SKILL.md"
exit 0
`);

      const result = runGlobalRuntimeSetup({
        sourceRoot: ROOT,
        cwd: repo,
        target: 'codex',
        profile: 'minimal',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        reverseSkill: true,
        codegraph: false,
        brainRoot: join(home, 'brain'),
        env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find((step) => step.step === 'configure Reverse Skill')).toMatchObject({
        status: 'failed',
      });
      expect(result.steps.find((step) => step.step === 'configure Reverse Skill')?.detail).toContain(
        'isolated staging integrity mismatch',
      );
      expect(readFileSync(isolatedHomeLog, 'utf-8').trim()).not.toBe(home);
      expect(existsSync(join(home, '.agents', 'skills', 'reverse-skill-router'))).toBe(false);
      expect(existsSync(join(home, '.codex', 'skills', 'reverse-skill-router'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('rejects a pre-existing Reverse Skill staging symlink even when its target matches the pinned digest', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-reverse-skill-staging-symlink-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const outside = join(tmp, 'outside');
    try {
      mkdirSync(join(home, '.agents', 'skills'), { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, 'SKILL.md'), '# reverse-skill-router\n');
      symlinkSync(outside, join(home, '.agents', 'skills', 'reverse-skill-router'), 'dir');

      const result = runGlobalRuntimeSetup({
        sourceRoot: ROOT,
        cwd: repo,
        target: 'codex',
        profile: 'minimal',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        reverseSkill: true,
        codegraph: false,
        brainRoot: join(home, 'brain'),
        env: { ...process.env, HOME: home },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find((step) => step.step === 'configure Reverse Skill')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('refusing non-canonical integrity staging root'),
      });
      expect(existsSync(join(home, '.codex', 'skills', 'reverse-skill-router'))).toBe(false);
      expect(readFileSync(join(outside, 'SKILL.md'), 'utf-8')).toBe('# reverse-skill-router\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('rejects a symlinked shared skills root instead of blessing its outside realpath', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-reverse-skill-root-symlink-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const outside = join(tmp, 'outside');
    try {
      mkdirSync(join(home, '.agents'), { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(join(outside, 'reverse-skill-router'), { recursive: true });
      writeFileSync(join(outside, 'reverse-skill-router', 'SKILL.md'), '# reverse-skill-router\n');
      symlinkSync(outside, join(home, '.agents', 'skills'), 'dir');

      const result = runGlobalRuntimeSetup({
        sourceRoot: ROOT,
        cwd: repo,
        target: 'codex',
        profile: 'minimal',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        reverseSkill: true,
        codegraph: false,
        brainRoot: join(home, 'brain'),
        env: { ...process.env, HOME: home },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find((step) => step.step === 'configure Reverse Skill')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('refusing non-canonical integrity staging root'),
      });
      expect(existsSync(join(home, '.codex', 'skills', 'reverse-skill-router'))).toBe(false);
      expect(readFileSync(join(outside, 'reverse-skill-router', 'SKILL.md'), 'utf-8'))
        .toBe('# reverse-skill-router\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('preflights unowned Reverse Skill host paths before committing shared staging', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-reverse-skill-host-preflight-'));
    const source = join(tmp, 'source');
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunxLog = join(tmp, 'bunx.log');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      setReverseSkillIntegrity(source, REVERSE_FAKE_TREE_INTEGRITY);
      mkdirSync(join(home, '.codex', 'skills', 'reverse-skill-router'), { recursive: true });
      writeFileSync(join(home, '.codex', 'skills', 'reverse-skill-router', 'SKILL.md'), '# user-owned\n');
      writeExecutable(join(fakeBin, 'bunx'), `#!/bin/bash\nprintf '%s\\n' "$*" > "${bunxLog}"\nexit 0\n`);

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        target: 'codex',
        profile: 'minimal',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        reverseSkill: true,
        codegraph: false,
        brainRoot: join(home, 'brain'),
        env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find((step) => step.step === 'configure Reverse Skill')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('refusing to refresh unowned host skill'),
      });
      expect(existsSync(bunxLog)).toBe(false);
      expect(existsSync(join(home, '.agents', 'skills', 'reverse-skill-router'))).toBe(false);
      expect(readFileSync(join(home, '.codex', 'skills', 'reverse-skill-router', 'SKILL.md'), 'utf-8'))
        .toBe('# user-owned\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('fails closed when explicit Reverse Skill selection is absent from the catalog', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-reverse-skill-missing-catalog-'));
    const source = join(tmp, 'source');
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      const manifestPath = join(source, 'assets', 'skill-commands', 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      manifest.packages = manifest.packages.filter(
        ({ name }: { name: string }) => name !== 'reverse-skill-router',
      );
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        target: 'codex',
        profile: 'minimal',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        reverseSkill: true,
        codegraph: false,
        brainRoot: join(home, 'brain'),
        env: { ...process.env, HOME: home },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find((step) => step.step === 'configure Reverse Skill')).toEqual({
        step: 'configure Reverse Skill',
        status: 'failed',
        detail: 'required explicit catalog package reverse-skill-router is missing for the selected host target',
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('fails closed before provider execution when explicit Reverse Skill integrity is absent', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-reverse-skill-missing-integrity-'));
    const source = join(tmp, 'source');
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      setReverseSkillIntegrity(source, null);

      const result = runGlobalRuntimeSetup({
        sourceRoot: source,
        cwd: repo,
        target: 'codex',
        profile: 'minimal',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        reverseSkill: true,
        codegraph: false,
        brainRoot: join(home, 'brain'),
        env: { ...process.env, HOME: home },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find((step) => step.step === 'configure Reverse Skill')).toEqual({
        step: 'configure Reverse Skill',
        status: 'failed',
        detail: 'catalog package reverse-skill-router requires a pinned tree integrity digest',
      });
      expect(existsSync(join(home, '.agents', 'skills', 'reverse-skill-router'))).toBe(false);
      expect(existsSync(join(home, '.codex', 'skills', 'reverse-skill-router'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

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
          'if [[ "${1:-}" == "--version" ]]; then echo "1.3.14"; exit 0; fi',
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
      expect(bunCommands[0]).toBe('--version');
      expect(bunCommands[1]).toBe(`add -g ${source}`);
      expect(bunCommands[2]).toBe('remove -g repo-harness');
      expect(bunCommands[3]).toBe(`add -g ${join(home, '.repo-harness', 'packages', 'repo-harness-9.9.9.tgz')}`);
      expect(existsSync(join(home, '.repo-harness', 'packages', 'repo-harness-9.9.9.tgz'))).toBe(true);
      expect(readFileSync(npmLog, 'utf-8')).toContain('pack --json --pack-destination');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('full installs bundled cross-review while mutable marketplace skills stay disabled by default', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-full-cross-review-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });

      const result = runGlobalRuntimeSetup({
        sourceRoot: ROOT,
        cwd: repo,
        target: 'claude',
        profile: 'full',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        codegraph: false,
        env: { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun') },
      }, { authorityHome: () => home });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === 'configure Waza skills')?.status).toBe('skipped');
      expect(result.steps.find((step) => step.step === 'configure Reverse Skill')).toMatchObject({
        status: 'skipped',
        detail: 'requires explicit --with-reverse-skill opt-in',
      });
      expect(result.steps.find((step) => step.step === 'cross-review skill repo-harness-cross-review')?.status).toBe('ok');
      expect(existsSync(join(home, '.claude', 'skills', 'repo-harness-cross-review', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(home, '.claude', 'skills', 'merge-gate', 'SKILL.md'))).toBe(false);
      expect(existsSync(join(home, '.agents', 'skills', 'think'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('minimal can install explicitly requested marketplace skills without adding full-only cross-review', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-minimal-no-cross-review-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(join(fakeBin, 'bun'), '#!/bin/bash\nif [[ "${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi\nexit 0\n');
      writeExecutable(join(fakeBin, 'bunx'), `#!/bin/bash
if [[ "\${1:-}" == "skills" && "\${2:-}" == "add" ]]; then
  if [[ " $* " == *" tw93/Waza "* ]]; then
    names='think hunt check health'
    mkdir -p "$HOME/.agents/rules"
    for rule in anti-patterns.md chinese.md durable-context.md english.md; do printf '# rule\\n' > "$HOME/.agents/rules/$rule"; done
	  elif [[ " $* " == *" zhaoxuya520/reverse-skill@"* ]]; then
    names='reverse-skill-router'
  else
    names='mermaid'
  fi
  for skill in $names; do
    mkdir -p "$HOME/.agents/skills/$skill"
    printf '# %s\\n' "$skill" > "$HOME/.agents/skills/$skill/SKILL.md"
  done
fi
exit 0
`);

      const result = runGlobalRuntimeSetup({
        sourceRoot: ROOT,
        cwd: repo,
        target: 'claude',
        profile: 'minimal',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: true,
        codegraph: false,
        brainRoot: join(home, 'brain'),
        env: { ...process.env, HOME: home, BUN_INSTALL: join(home, '.bun'), PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === 'cross-review skills')).toMatchObject({
        status: 'skipped',
        detail: 'disabled by install profile',
      });
      expect(existsSync(join(home, '.claude', 'skills', 'think', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(home, '.claude', 'skills', 'mermaid', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(home, '.claude', 'skills', 'reverse-skill-router', 'SKILL.md'))).toBe(false);
      expect(existsSync(join(home, '.claude', 'skills', 'repo-harness-cross-review'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('full refuses a partial unowned host skill projection', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-partial-skill-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      for (const skill of ['think', 'hunt', 'check', 'health', 'mermaid', 'reverse-skill-router']) {
        mkdirSync(join(home, '.agents', 'skills', skill), { recursive: true });
        writeFileSync(join(home, '.agents', 'skills', skill, 'SKILL.md'), `# ${skill}\n`);
      }
      mkdirSync(join(home, '.codex', 'skills', 'think'), { recursive: true });
      writeFileSync(join(home, '.codex', 'skills', 'think', 'SKILL.md'), '# think\n');
      writeExecutable(join(fakeBin, 'bun'), '#!/bin/bash\nif [[ "${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi\nexit 0\n');

      const result = runGlobalRuntimeSetup({
        sourceRoot: ROOT,
        cwd: repo,
        target: 'both',
        profile: 'full',
        installCli: false,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: true,
        codegraph: false,
        brainRoot: join(home, 'brain'),
        env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find(({ step }) => step === 'configure Waza skills')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('refusing to refresh unowned host skill'),
      });
      expect(existsSync(join(home, '.claude', 'skills', 'think'))).toBe(false);
      expect(existsSync(join(home, '.claude', 'skills', 'mermaid'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('update mode checks the mandatory closure even when CLI installation is disabled', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-managed-update-no-cli-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupManagedRuntimeReadback(home, fakeBin, '9.9.8');
      writeExecutable(join(fakeBin, 'bun'), '#!/bin/bash\nif [[ "${1:-}" == "--version" ]]; then echo 1.3.14; fi\nexit 0\n');

      const result = runGlobalRuntimeSetup({
        sourceRoot: ROOT,
        cwd: repo,
        profile: 'minimal',
        installCli: false,
        installSpec: 'repo-harness@9.9.9',
        updateMode: true,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          BUN_INSTALL: join(home, '.bun'),
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          REPO_HARNESS_BUN_EXECUTABLE: join(fakeBin, 'bun'),
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.steps.find((step) => step.step === 'verify managed runtime dependencies')).toMatchObject({ status: 'failed' });
      expect(result.steps.some((step) => step.step === 'install host adapters')).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('the installed candidate handoff checks its closure before projecting host files', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-candidate-handoff-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const codexSkills = join(tmp, 'codex-skills');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupManagedRuntimeReadback(home, fakeBin, JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string);
      const globalHarness = join(home, '.bun', 'install', 'global', 'node_modules', 'repo-harness');
      rmSync(globalHarness, { recursive: true, force: true });
      symlinkSync(ROOT, globalHarness, 'dir');
      writeExecutable(join(fakeBin, 'node'), '#!/bin/bash\nif [[ "${1:-}" == "--version" ]]; then echo v22.14.0; exit 0; fi\nexit 1\n');

      const result = spawnSync('bash', [join(ROOT, 'scripts', 'sync-codex-installed-copies.sh')], {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          BUN_INSTALL: join(home, '.bun'),
          PATH: `${fakeBin}:${join(process.env.HOME ?? '', '.bun', 'bin')}:/usr/bin:/bin`,
          AGENTIC_DEV_SOURCE_ROOT: ROOT,
          CODEX_SKILLS_ROOT: codexSkills,
        },
      });

      expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(1);
      expect(result.stderr).toContain('requires Node >=24 <26');
      expect(existsSync(codexSkills)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15_000);

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
      writeExecutable(join(fakeBin, 'bun'), '#!/bin/bash\nif [[ "${1:-}" == "--version" ]]; then echo 1.3.14; fi\nexit 0\n');
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
    const npmLog = join(tmp, 'npm.log');
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi\nexit 42\n`);
      writeExecutable(join(fakeBin, 'npm'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${npmLog}"\nexit 42\n`);

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
      expect(readFileSync(bunLog, 'utf-8')).toBe('--version\n');
      expect(existsSync(npmLog)).toBe(false);
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
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi\nexit 42\n`);

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
      expect(readFileSync(bunLog, 'utf-8')).toBe('--version\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('skip detail appends an update hint when a newer version is available', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-update-hint-'));
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
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi\nexit 42\n`);

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
          REPO_HARNESS_CHECK_UPDATES: '1',
          // readLatestPackageVersion() now receives this injected env directly
          // (see doctor.ts), so the override is set here instead of mutating
          // live process.env.
          REPO_HARNESS_LATEST_VERSION: '99.0.0',
        },
      });

      const installStep = result.steps.find((step) => step.step === 'install repo-harness CLI');
      expect(result.exitCode).toBe(0);
      expect(installStep?.status).toBe('skipped');
      expect(installStep?.detail).toBe(
        'already installed from Bun global package source; version=9.9.9; latest=99.0.0 available — run: repo-harness update',
      );
      expect(readFileSync(bunLog, 'utf-8')).toBe('--version\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('skip detail is unchanged when update checks are disabled or the override is current', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-global-init-update-hint-current-'));
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
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi\nexit 42\n`);

      const baseEnv: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: home,
        BUN_INSTALL: join(home, '.bun'),
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      };
      delete baseEnv.REPO_HARNESS_LATEST_VERSION;
      delete baseEnv.REPO_HARNESS_CHECK_UPDATES;
      const runOpts = {
        sourceRoot: source,
        cwd: repo,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
      };
      const expectedDetail = 'already installed from Bun global package source; version=9.9.9';

      const unsetStep = runGlobalRuntimeSetup({ ...runOpts, env: baseEnv }).steps.find(
        (step) => step.step === 'install repo-harness CLI',
      );
      expect(unsetStep?.status).toBe('skipped');
      expect(unsetStep?.detail).toBe(expectedDetail);

      // Explicit update checks can still use a caller-provided registry result
      // without spawning the registry client.
      const equalStep = runGlobalRuntimeSetup({
        ...runOpts,
        env: {
          ...baseEnv,
          REPO_HARNESS_CHECK_UPDATES: '1',
          REPO_HARNESS_LATEST_VERSION: '9.9.9',
        },
      }).steps.find((step) => step.step === 'install repo-harness CLI');
      expect(equalStep?.status).toBe('skipped');
      expect(equalStep?.detail).toBe(expectedDetail);

      expect(readFileSync(bunLog, 'utf-8')).toBe('--version\n--version\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI exposes install help for npx users without legacy plugin options', () => {
    const res = spawnSync('bun', [CLI, 'install', '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Usage: repo-harness install');
    expect(res.stdout).toContain('--target <target>');
    expect(res.stdout).toContain('--no-cli');
    expect(res.stdout).toContain('--with-reverse-skill');
    expect(res.stdout).toContain('--brain-root <path>');
    expect(res.stdout).not.toContain('--with-optional');
    expect(res.stdout).not.toContain('--project-type');
    expect(res.stdout).not.toContain('setup-plugins');
  }, 30_000);

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
      mkdirSync(join(home, '.repo-harness'), { recursive: true });
      setupManagedRuntimeReadback(home, fakeBin);
      writeFileSync(join(home, '.repo-harness', 'install-state.json'), `${JSON.stringify({
        protocol: 2,
        profile: 'full',
        components: [
          'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
          'adaptive-workflow', 'codegraph-conditional', 'planning-integrations',
          'agent-fleet', 'verifier', 'cross-model-acceptance', 'release-deployment-gates',
        ],
        transaction_id: 'existing-full-install',
        applied_at: '2026-07-14T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      })}\n`);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi\nexit 0\n`);

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
          env: {
            ...process.env,
            HOME: home,
            BUN_INSTALL: join(home, '.bun'),
            PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
            REPO_HARNESS_BUN_EXECUTABLE: join(fakeBin, 'bun'),
          },
        },
      );

      expect(res.status).toBe(0);
      const result = JSON.parse(res.stdout);
      expect(readFileSync(bunLog, 'utf-8')).toContain('add -g repo-harness@latest');
      expect(result.steps.find((step: { step: string }) => step.step === 'install agent fleet')?.status).toBe('ok');
      expect(result.steps.find((step: { step: string }) => step.step === 'configure brain root')?.status).toBe('ok');
      expect(existsSync(join(home, '.repo-harness', 'config.json'))).toBe(true);
      expect(existsSync(join(repo, '.ai'))).toBe(false);
      expect(existsSync(join(repo, 'tasks'))).toBe(false);
      expect(existsSync(join(repo, 'plans'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

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
      setupManagedRuntimeReadback(home, fakeBin);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; fi\nexit 0\n`);

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
          env: {
            ...process.env,
            HOME: home,
            BUN_INSTALL: join(home, '.bun'),
            PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
            REPO_HARNESS_BUN_EXECUTABLE: join(fakeBin, 'bun'),
          },
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
  }, 30_000);

  test('CLI update rejects protocol-1 state until explicit migration', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-cli-update-legacy-profile-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    try {
      mkdirSync(join(home, '.repo-harness'), { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(home, '.repo-harness', 'install-state.json'), `${JSON.stringify({
        protocol: 1,
        profile: 'product-planning',
        components: [
          'cli', 'effective-state', 'scope-worktree-check-guards', 'handoff', 'host-adapters',
          'adaptive-workflow', 'codegraph-conditional', 'planning-integrations',
        ],
        transaction_id: 'existing-planning-install',
        applied_at: '2026-07-14T00:00:00.000Z',
        ownership_manifest: [],
        previous: null,
      })}\n`);
      writeExecutable(join(fakeBin, 'bun'), '#!/bin/bash\nif [[ "${1:-}" == "--version" ]]; then echo 1.3.14; fi\nexit 0\n');

      const res = spawnSync(process.execPath, [
        CLI,
        'update',
        '--no-cli',
        '--no-sync-skill',
        '--no-hooks',
        '--no-external-skills',
        '--no-codegraph',
        '--json',
      ], {
        cwd: repo,
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          REPO_HARNESS_BUN_EXECUTABLE: join(fakeBin, 'bun'),
        },
      });

      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('--migrate-profile-state');
      expect(existsSync(join(home, '.repo-harness', 'config.json'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test('CLI top-level --version still prints the CLI version', () => {
    const res = spawnSync(process.execPath, [CLI, '--version'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  }, 30_000);

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
    expect(res.stdout).toContain('--with-reverse-skill');
    expect(res.stdout).toContain('--configure-codegraph');
    expect(res.stdout).toContain('--no-cli');
    expect(res.stdout).toContain('Deprecated: use repo-harness init --repo <path>');
  }, 30_000);

  test('CLI install defaults non-interactively to full with its selected optional ecosystems', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'repo-harness-cli-install-non-tty-'));
    const home = join(tmp, 'home');
    const repo = join(tmp, 'repo');
    const fakeBin = join(tmp, 'bin');
    const bunLog = join(tmp, 'bun.log');
    const bunxLog = join(tmp, 'bunx.log');
    const codegraphLog = join(tmp, 'codegraph.log');
    try {
      mkdirSync(home, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFakeCodegraph(fakeBin, codegraphLog);
      writeExecutable(join(fakeBin, 'bun'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${bunLog}"\nif [[ "\${1:-}" == "--version" ]]; then echo 1.3.14; exit 0; fi\nif [[ "\${1:-}" == "-" ]]; then exec "${process.execPath}" "$@"; fi\nif [[ " $* " == *" add -g "* ]]; then mkdir -p "$HOME/.bun/bin"; printf '#!/bin/sh\\n' > "$HOME/.bun/bin/repo-harness"; chmod +x "$HOME/.bun/bin/repo-harness"; fi\nexit 0\n`);
      writeExecutable(join(fakeBin, 'bunx'), `#!/bin/bash
printf '%s\\n' "$*" >> "${bunxLog}"
if [[ "\${1:-}" == "skills" && "\${2:-}" == "add" ]]; then
  if [[ " $* " == *" tw93/Waza "* ]]; then
    names='think hunt check health'
    mkdir -p "$HOME/.agents/rules"
    for rule in anti-patterns.md chinese.md durable-context.md english.md; do printf '# rule\\n' > "$HOME/.agents/rules/$rule"; done
  elif [[ " $* " == *" zhaoxuya520/reverse-skill@"* ]]; then
    names='reverse-skill-router'
  else
    names='mermaid'
  fi
  for skill in $names; do
    mkdir -p "$HOME/.agents/skills/$skill"
    printf '# %s\\n' "$skill" > "$HOME/.agents/skills/$skill/SKILL.md"
  done
fi
exit 0
`);

      // spawnSync's stdio pipes are never a TTY (isTTY is undefined), so this
      // exercises the non-interactive branch of runGlobalRuntimeBootstrap.
      // Passing input (even empty) closes stdin immediately, so a wrongly
      // interactive code path would fail fast on EOF instead of hanging.
      // Use process.execPath (not literal 'bun') since PATH below is
      // overridden with a fake bin dir; a literal 'bun' command would
      // resolve to the fake shim and never actually run the CLI script.
      const res = spawnSync(
        process.execPath,
        [CLI, 'install', '--target', 'codex'],
        {
          cwd: repo,
          encoding: 'utf-8',
          input: '',
          timeout: 20000,
          env: {
            ...process.env,
            HOME: home,
            BUN_INSTALL: join(home, '.bun'),
            PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
            REPO_HARNESS_BUN_EXECUTABLE: join(fakeBin, 'bun'),
            AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: '0',
          },
        },
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('[profile] full');
      expect(res.stdout).toContain('install repo-harness CLI');
      expect(readFileSync(bunxLog, 'utf-8')).toContain('skills add tw93/Waza');
      expect(readFileSync(bunxLog, 'utf-8')).not.toContain('skills add zhaoxuya520/reverse-skill');
      expect(readFileSync(codegraphLog, 'utf-8')).toContain('codegraph install');
      expect(JSON.parse(readFileSync(join(home, '.repo-harness', 'install-state.json'), 'utf-8')).profile).toBe('full');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 25000);
});

describe('resolveOptionalRuntimeDeps (interactive optional-dep prompts)', () => {
  test('non-interactive defaults optional ecosystems off', async () => {
    const result = await resolveOptionalRuntimeDeps({ target: 'both' }, undefined, { interactive: false });
    expect(result).toEqual({ externalSkills: false, codegraph: false });
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

  test('interactive mode keeps optional ecosystems off when the answer is blank', async () => {
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

    expect(result).toEqual({ externalSkills: false, codegraph: false });
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
