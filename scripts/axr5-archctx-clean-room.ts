#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { PROJECTION_REQUEST_VERSION, type ProjectionRequestV1 } from '../src/core/architecture/projection';
import { archctxCapabilities, captureArchitectureProjectionSnapshot, runArchitectureProjection } from '../src/effects/architecture/archctx-provider';

const VERSION = '0.4.1';
const repoRoot = resolve(import.meta.dir, '..');
const archContextRoot = resolve(flag('--arch-context-root') ?? join(repoRoot, '..', 'arch-context'));
const revision = flag('--revision') ?? git(archContextRoot, ['rev-parse', 'HEAD']);
const outputPath = resolve(repoRoot, flag('--out') ?? 'docs/verification/axr5-archctx-clean-room-readback.json');
const keep = process.argv.includes('--keep-temp');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 'repo-harness.axr5-clean-room/v1',
  status: 'running',
  source: { repository: 'Ancienttwo/arch-context', revision, archiveMode: 'git-archive', dirtySourceUsed: false },
}, null, 2)}\n`);
const workspace = mkdtempSync(join(tmpdir(), 'repo-harness-axr5-clean-room-'));
let installedBinary: string | null = null;
let daemonRoot: string | null = null;

try {
  const checkout = join(workspace, 'arch-context');
  const artifacts = join(workspace, 'artifacts');
  const consumer = join(workspace, 'consumer');
  const fixtureRepo = join(workspace, 'fixture-repo');
  mkdirSync(checkout, { recursive: true });
  mkdirSync(artifacts, { recursive: true });
  extractRevision(checkout);
  prepareReleaseVersion(checkout);
  linkBuildDependencies(checkout);
  const contracts = packContracts(checkout, artifacts);
  const archctxEvidencePath = join(checkout, 'axr5-archctx-pack.json');
  const release = JSON.parse(run('bun', [
    'scripts/fg6-npm-release-dry-run.ts', 'run',
    '--artifact-dir', artifacts,
    '--out', archctxEvidencePath,
    '--json',
  ], checkout).stdout) as Record<string, any>;
  if (release.ok !== true || release.package?.version !== VERSION) throw new Error(`archctx pack failed: ${JSON.stringify(release.failures ?? release)}`);
  const archctxTarball = join(artifacts, String(release.artifact.tarball));
  const codeGraphPlatform = installedPlatformPackage('@colbymchenry', 'codegraph');
  const jiebaPlatform = installedPlatformPackage('@node-rs', 'jieba');

  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({
    private: true,
    dependencies: {
      archctx: `file:${archctxTarball}`,
      'archctx-contracts': `file:${contracts.tarball}`,
      '@colbymchenry/codegraph': `file:${join(archContextRoot, 'node_modules', '@colbymchenry', 'codegraph')}`,
      [codeGraphPlatform.name]: `file:${codeGraphPlatform.path}`,
      '@node-rs/jieba': `file:${join(archContextRoot, 'node_modules', '@node-rs', 'jieba')}`,
      [jiebaPlatform.name]: `file:${jiebaPlatform.path}`,
    },
  }, null, 2)}\n`);
  const offlineEnv = {
    ...process.env,
    NPM_CONFIG_REGISTRY: 'http://127.0.0.1:9',
    BUN_CONFIG_REGISTRY: 'http://127.0.0.1:9',
  };
  run('npm', ['install', '--offline', '--ignore-scripts', '--omit=dev', '--omit=optional'], consumer, offlineEnv);
  const installedNodeSchemaPath = join(consumer, 'node_modules', 'archctx-contracts', 'schemas', 'repo', 'architecture-node.schema.json');
  const installedNodeSchemaBody = readFileSync(installedNodeSchemaPath);
  const installedNodeSchema = JSON.parse(installedNodeSchemaBody.toString('utf8')) as any;
  if (installedNodeSchema.properties?.schemaVersion?.const !== 'archcontext.node/v2') throw new Error('packed archctx-contracts does not expose authoritative node/v2 schema');

  mkdirSync(join(fixtureRepo, '.ai', 'harness'), { recursive: true });
  mkdirSync(join(fixtureRepo, '.archcontext', 'model', 'nodes'), { recursive: true });
  run('git', ['init'], fixtureRepo);
  writeFileSync(join(fixtureRepo, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    context: { capability_source: 'archcontext' },
    architecture: {
      projection_provider: 'archctx',
      projection_apply: 'manual',
      projection_version: VERSION,
      projection_timeout_ms: 120000,
    },
  }, null, 2)}\n`);
  mkdirSync(join(fixtureRepo, 'src', 'projection-fixture'), { recursive: true });
  writeFileSync(join(fixtureRepo, 'src', 'projection-fixture', 'index.ts'), 'export const projectionFixture = true;\n');
  writeFileSync(join(fixtureRepo, 'AGENTS.md'), '# Fixture agent context\n');
  writeFileSync(join(fixtureRepo, 'CLAUDE.md'), '# Fixture agent context\n');
  writeFileSync(join(fixtureRepo, '.archcontext', 'model', 'nodes', 'capability.fixture.projection.yaml'), `schemaVersion: archcontext.node/v2
id: capability.fixture.projection
kind: capability
name: Projection Fixture
status: active
summary: Proves the packed provider projection contract.
responsibilities:
  - Provide one deterministic clean-room projection scope.
source:
  include:
    - src/projection-fixture/**
extensions:
  contractFiles:
    agents: AGENTS.md
    claude: CLAUDE.md
  lspProfile: typescript-lsp
  verification: []
`);
  run('git', ['config', 'user.email', 'axr5@example.invalid'], fixtureRepo);
  run('git', ['config', 'user.name', 'AXR5 Clean Room'], fixtureRepo);
  run('git', ['add', '.'], fixtureRepo);
  run('git', ['commit', '-m', 'clean-room fixture'], fixtureRepo);
  const conflictDir = join(workspace, 'conflicting-path');
  mkdirSync(conflictDir, { recursive: true });
  const conflictBin = join(conflictDir, 'archctx');
  writeFileSync(conflictBin, '#!/bin/sh\nprintf \'{"package":{"version":"999.0.0"}}\\n\'\n');
  Bun.spawnSync(['chmod', '+x', conflictBin]);
  const handshake = archctxCapabilities(fixtureRepo, {
    consumerRoot: consumer,
    env: { ...offlineEnv, PATH: `${conflictDir}:${process.env.PATH ?? ''}` },
  });
  installedBinary = handshake.resolved.binaryPath;
  if (handshake.capabilities.package.version !== VERSION) throw new Error('package-local feature handshake version mismatch');
  const packageLocalBinary = handshake.resolved.binaryPath === realpathSync(join(consumer, 'node_modules', 'archctx', 'bin', 'archctx.mjs'));
  const conflictingPathIgnored = packageLocalBinary && handshake.capabilities.package.version === VERSION && !realpathSync(handshake.resolved.binaryPath).startsWith(`${conflictDir}/`);
  if (!packageLocalBinary || !conflictingPathIgnored) throw new Error('package-local provider authority was not proven');
  const expected = captureArchitectureProjectionSnapshot(fixtureRepo);
  daemonRoot = fixtureRepo;
  run(installedBinary, ['daemon', 'upgrade'], fixtureRepo, { ...offlineEnv, PATH: `${conflictDir}:${process.env.PATH ?? ''}` });
  const request: ProjectionRequestV1 = {
    schemaVersion: PROJECTION_REQUEST_VERSION,
    requestId: 'repo-harness.axr5-clean-room',
    profile: 'repo-harness/v1',
    mode: 'plan',
    targets: ['architecture-docs'],
    changedPaths: ['src/projection-fixture/index.ts'],
    expected,
  };
  const projection = runArchitectureProjection(request, fixtureRepo, {
    consumerRoot: consumer,
    env: { ...offlineEnv, PATH: `${conflictDir}:${process.env.PATH ?? ''}` },
  });

  const readback = {
    schemaVersion: 'repo-harness.axr5-clean-room/v1',
    status: 'verified',
    source: { repository: 'Ancienttwo/arch-context', revision, archiveMode: 'git-archive', dirtySourceUsed: false },
    packages: {
      contracts: { name: 'archctx-contracts', version: VERSION, file: basename(contracts.tarball), integrity: contracts.integrity, sha512: sha512(contracts.tarball) },
      archctx: { name: 'archctx', version: VERSION, file: basename(archctxTarball), integrity: release.artifact.integrity, sha512: sha512(archctxTarball) },
    },
    consumer: {
      registry: 'disabled-loopback',
      installMode: 'temporary-file-tarballs',
      committedFileDependency: false,
      packageLocalBinary,
      conflictingPathIgnored,
      authoritativeNodeSchema: installedNodeSchema.properties.schemaVersion.const,
      authoritativeNodeSchemaDigest: `sha256:${createHash('sha256').update(installedNodeSchemaBody).digest('hex')}`,
      capabilities: handshake.capabilities,
      projection: {
        requestId: projection.requestId,
        status: projection.status,
        worktreeDigestMatched: projection.inputSnapshot.worktreeDigest === expected.worktreeDigest,
        rendererVersion: projection.outputSnapshot.rendererVersion,
        layoutVersion: projection.outputSnapshot.layoutVersion,
        codeGraph: projection.outputSnapshot.generatedFrom,
        receiptDigest: projection.receiptDigest,
      },
    },
  };
  writeFileSync(outputPath, `${JSON.stringify(readback, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(readback, null, 2)}\n`);
} finally {
  if (installedBinary && daemonRoot) spawnSync(installedBinary, ['daemon', 'stop'], { cwd: daemonRoot, encoding: 'utf8', stdio: 'ignore' });
  if (!keep) rmSync(workspace, { recursive: true, force: true });
}

function extractRevision(target: string): void {
  const archive = spawnSync('git', ['archive', '--format=tar', revision], { cwd: archContextRoot, encoding: null, maxBuffer: 100 * 1024 * 1024 });
  if (archive.status !== 0 || !archive.stdout) throw new Error(`git archive failed: ${String(archive.stderr)}`);
  const extract = spawnSync('tar', ['-xf', '-', '-C', target], { input: archive.stdout, encoding: null, maxBuffer: 100 * 1024 * 1024 });
  if (extract.status !== 0) throw new Error(`tar extract failed: ${String(extract.stderr)}`);
}

function linkBuildDependencies(checkout: string): void {
  const sourceModules = join(archContextRoot, 'node_modules');
  const targetModules = join(checkout, 'node_modules');
  mkdirSync(targetModules, { recursive: true });
  for (const name of readdirSync(sourceModules)) {
    if (name === '@archcontext') continue;
    symlinkSync(join(sourceModules, name), join(targetModules, name), 'dir');
  }
  const sourceScope = join(sourceModules, '@archcontext');
  const targetScope = join(targetModules, '@archcontext');
  mkdirSync(targetScope, { recursive: true });
  for (const name of readdirSync(sourceScope)) {
    const sourcePackage = realpathSync(join(sourceScope, name));
    if (!sourcePackage.startsWith(`${archContextRoot}/`)) throw new Error(`workspace package escapes source root: ${name}`);
    const packageRelativePath = sourcePackage.slice(archContextRoot.length + 1);
    symlinkSync(join(checkout, packageRelativePath), join(targetScope, name), 'dir');
  }
}

function packContracts(checkout: string, artifacts: string): { tarball: string; integrity: string } {
  const stage = join(workspace, 'contracts-stage');
  mkdirSync(stage, { recursive: true });
  cpSync(join(checkout, 'packages', 'contracts', 'src'), join(stage, 'src'), { recursive: true });
  cpSync(join(checkout, 'packages', 'contracts', 'fixtures'), join(stage, 'fixtures'), { recursive: true });
  cpSync(join(checkout, 'schemas'), join(stage, 'schemas'), { recursive: true });
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify({
    name: 'archctx-contracts', version: VERSION, private: false, type: 'module', license: 'Apache-2.0',
    files: ['src', 'fixtures', 'schemas'],
    exports: { '.': './src/index.ts', './schemas/*': './schemas/*' },
  }, null, 2)}\n`);
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', artifacts], stage).stdout) as Array<{ filename: string; integrity: string }>;
  if (!packed?.filename || !packed.integrity) throw new Error('contracts npm pack did not return integrity');
  return { tarball: join(artifacts, packed.filename), integrity: packed.integrity };
}

function setPackageVersion(path: string, version: string): void {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  writeFileSync(path, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
}

function prepareReleaseVersion(checkout: string): void {
  setPackageVersion(join(checkout, 'package.json'), VERSION);
  for (const packageName of readdirSync(join(checkout, 'packages'))) {
    const manifestPath = join(checkout, 'packages', packageName, 'package.json');
    if (existsSync(manifestPath)) setPackageVersion(manifestPath, VERSION);
  }
  const productVersionPath = join(checkout, 'packages', 'contracts', 'src', 'product-version.ts');
  const source = readFileSync(productVersionPath, 'utf8');
  const updated = source.replace(/export const ARCHCONTEXT_PRODUCT_VERSION = "[^"]+";/, `export const ARCHCONTEXT_PRODUCT_VERSION = "${VERSION}";`);
  if (updated === source) throw new Error('product version source was not updated');
  writeFileSync(productVersionPath, updated);
}

function installedPlatformPackage(scope: string, baseName: string): { name: string; path: string } {
  const expectedPrefix = `${baseName}-${process.platform}-${process.arch}`;
  const roots = [
    join(archContextRoot, 'node_modules', scope),
    join(archContextRoot, 'node_modules', '.bun', 'node_modules', scope),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const name = readdirSync(root).find((entry) => entry === expectedPrefix || entry.startsWith(`${expectedPrefix}-`));
    if (name) return { name: `${scope}/${name}`, path: join(root, name) };
  }
  throw new Error(`installed platform package is missing: ${scope}/${expectedPrefix}*`);
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim().slice(0, 2000)}`);
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
function git(cwd: string, args: string[]): string { return run('git', args, cwd).stdout.trim(); }
function sha512(path: string): string { return createHash('sha512').update(readFileSync(path)).digest('hex'); }
function flag(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
