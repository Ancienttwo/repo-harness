import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ERROR_CATALOG } from 'archctx-contracts';
import { collectAgentNotice, renderAgentNotice } from '../src/cli/hook/agent-notice';
import { checkpointArchitectureDebt, type ArchctxProviderOptions } from '../src/effects/architecture/archctx-provider';
import { resolveCapabilityOwnership } from '../src/effects/state/resolve-effective-state';
import { agentNoticeFixture, noticeOwnership, noticeEnv, registryNoticeFixture, NOTICE_CAPABILITY } from './helpers/agent-notice';
import { fixtureCommit, fixtureGit, fixtureWrite } from './helpers/module-repository';

const roots: string[] = [];
function fixture() { const root = agentNoticeFixture(); roots.push(root); return root; }
function registryFixture() { const root = registryNoticeFixture(); roots.push(root); return root; }
const noCheckpoint = () => { throw new Error('checkpoint must not run'); };
const timedOut = () => ({ status: null, signal: 'SIGTERM' as const, stdout: '', stderr: '', timedOut: true });
const STATUS = 'repo-harness architecture-projection status --json';
const NO_MODEL = 'no ArchContext model (.archcontext/manifest.yaml is missing)';
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('AgentNotice', () => {
  test.each([false, true])('checkpoint accepts a deleted owned path (committed: %s)', committed => {
    const root = fixture();
    const ownership = noticeOwnership(root);
    const path = 'src/module/read.ts';
    rmSync(join(root, path));
    if (committed) fixtureCommit(root);
    expect(existsSync(join(root, path))).toBe(false);
    const result = checkpointArchitectureDebt(root, ownership, { env: noticeEnv(root) });
    expect(result).not.toBeNull();
    expect(result!.report.scope.changedPaths).toEqual([path]);
    expect(result!.report.checks.find(check => check.check === 'ownership')?.coverage).toBe('complete');
    expect(result!.report.items.some(item => item.kind === 'stale-anchor' && item.reasonCode === 'missing-path' && item.paths.includes(path))).toBe(true);
  });

  test('review round 1: notice ownership receives its own 3 s bound and hook environment', () => {
    const root = fixture();
    const env = noticeEnv(root);
    const report = checkpointArchitectureDebt(root, noticeOwnership(root), { env })!.report;
    const calls: string[] = [];
    const notice = collectAgentNotice(root, options => resolveCapabilityOwnership(root, undefined, options), {
      env, nowMs: () => 100,
      run: (_binary, args, options) => {
        calls.push(args[0]!);
        expect(options.env).toBe(env);
        expect(options.timeoutMs).toBe(3_000);
        const paths = args[0] === 'resolve' ? readFileSync(args[2]!, 'utf8').trim().split('\n') : [];
        const data = args[0] === 'resolve' ? { results: paths.map(path => ({ path, matched: true, ambiguous: false, owningCapabilityId: NOTICE_CAPABILITY })) } : report;
        return { status: 0, signal: null, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: args[0], data }), stderr: '' };
      },
    });
    expect(calls).toEqual(['resolve', 'checkpoint']);
    expect(notice.content).toContain('[ArchitectureDebt]');
  });

  test('review round 1: multi-capability headers count unique ids and rows use scope then unowned', () => {
    const root = fixture();
    const report = checkpointArchitectureDebt(root, noticeOwnership(root), { env: noticeEnv(root) })!.report;
    const item = report.items[0]!;
    const items = [
      { ...item, id: 'first', capabilityIds: ['capability.test.first', 'capability.test.second'] },
      { ...item, id: 'second', capabilityIds: ['capability.test.second'] },
      { ...item, id: 'third', capabilityIds: [] },
    ];
    const rendered = renderAgentNotice({ ...report, scope: { ...report.scope, capabilityIds: ['capability.test.scope'] }, items })!;
    expect(rendered.content).toStartWith('[ArchitectureDebt] 3 new in capability.test.first (+2 capabilities)\n');
    expect(rendered.systemMessage).toContain('capability.test.first (+2 capabilities)');
    expect(rendered.content).toContain('- stale-anchor capability.test.scope;');
    expect(Buffer.byteLength(rendered.content!)).toBeLessThanOrEqual(800);
    const empty = renderAgentNotice({ ...report, scope: { ...report.scope, capabilityIds: [] }, items: [{ ...item, capabilityIds: [] }] })!;
    expect(empty.content).toStartWith('[ArchitectureDebt] 1 new in unowned\n');
    expect(empty.content).toContain('- stale-anchor unowned;');
    expect(empty.systemMessage).toContain('in unowned;');
    const scope = renderAgentNotice({ ...report, items: [{ ...item, capabilityIds: [] }] })!;
    expect(scope.content).toStartWith(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}\n`);
  });

  test('review round 1: checkpoint timeout points to debt inspection without a request id', () => {
    const root = fixture();
    const result = collectAgentNotice(root, () => noticeOwnership(root), {
      env: noticeEnv(root), run: () => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true }),
    });
    expect(result.diagnostics).toContain('architecture notice timed out after 3 s; run repo-harness architecture-debt --json');
    expect(result.diagnostics).not.toContain('request id');
    expect(result.diagnostics).not.toContain('architecture-projection');
    expect(result.content).toBe('[Architecture] notice unavailable (RH_ARCHCTX_TIMEOUT): architecture notice timed out after 3 s; run repo-harness architecture-debt --json');
  });

  test('real citation debt is bounded, uses producer ids and dedupes across delivery points', () => {
    const root = fixture();
    const ownership = noticeOwnership(root);
    const options = { env: noticeEnv(root) };
    const measured = checkpointArchitectureDebt(root, ownership, options)!;
    expect(measured.report.items).toHaveLength(1);
    expect(measured.report.items[0]!.kind).toBe('stale-anchor');
    const first = collectAgentNotice(root, () => ownership, options);
    expect(first.content).toContain(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}`);
    expect(first.content).toContain('Run:');
    expect(first.content).toContain('human');
    expect(Buffer.byteLength(first.content!)).toBeLessThanOrEqual(800);
    expect(first.systemMessage).toBe(`Architecture: 1 debt item in ${NOTICE_CAPABILITY}; run repo-harness architecture-debt --json.`);
    expect(first.diagnostics).toBeUndefined();
    const key = createHash('sha256').update(JSON.stringify(['feature', measured.report.items.map(item => item.id).sort(), []])).digest('hex');
    expect(readFileSync(join(root, '.ai/harness/state/agent-notice'), 'utf8').trim()).toBe(key);
    expect(collectAgentNotice(root, () => ownership, options)).toEqual({});
    fixtureWrite(root, 'docs/architecture/.projection-manifest.json', '{"profile":"repo-harness/v1"}\n');
    expect(collectAgentNotice(root, () => ownership, options)).toEqual({});
    fixtureWrite(root, 'docs/architecture/modules/test/module.md', '## 3. Decisions\nRead `src/module/read.ts:998`.\n');
    expect(collectAgentNotice(root, () => ownership, options).content).toContain('[ArchitectureDebt]');
    fixtureGit(root, ['checkout', '-qb', 'other']);
    expect(collectAgentNotice(root, () => ownership, options).content).toContain('[ArchitectureDebt]');
  });

  test('clean main and unowned-only changes never call checkpoint', () => {
    const root = fixture();
    fixtureGit(root, ['add', '.']); fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=t@t', 'commit', '-qm', 'code']);
    fixtureGit(root, ['branch', '-f', 'main', 'HEAD']);
    fixtureWrite(root, 'src/unowned.ts', 'export const unrelated = 1;\n');
    const ownership = noticeOwnership(root);
    expect(checkpointArchitectureDebt(root, ownership, { run: () => { throw new Error('must not run'); } })).toBeNull();
    expect(collectAgentNotice(root, () => null, { env: noticeEnv(root), run: () => { throw new Error('must not run'); } })).toEqual({});
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
  });

  test('failures, timeouts and unsafe markers emit only one diagnostic and can retry', () => {
    const root = fixture();
    const ownership = noticeOwnership(root);
    const failed = collectAgentNotice(root, () => ownership, { env: noticeEnv(root), run: () => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true }) });
    expect(failed.content).toStartWith('[Architecture] notice unavailable (RH_ARCHCTX_TIMEOUT): ');
    expect(failed.systemMessage).toBe('Architecture: notice unavailable (RH_ARCHCTX_TIMEOUT); run repo-harness architecture-debt --json.');
    expect(failed.diagnostics!.trim().split('\n')).toHaveLength(1);
    expect(failed.diagnostics).toContain('RH_ARCHCTX_TIMEOUT');
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
    mkdirSync(join(root, '.ai/harness/state'), { recursive: true });
    symlinkSync(join(root, 'home'), join(root, '.ai/harness/state/agent-notice'));
    const unsafe = collectAgentNotice(root, () => ownership, { env: noticeEnv(root) });
    expect(unsafe.content).toBeUndefined();
    expect(unsafe.diagnostics!.trim().split('\n')).toHaveLength(1);
  });

  test('UTF-8 output retains complete fields and commands with an exact overflow count', () => {
    const root = fixture();
    const report = checkpointArchitectureDebt(root, noticeOwnership(root), { env: noticeEnv(root) })!.report;
    const item = report.items[0]!;
    const items = Array.from({ length: 8 }, (_, i) => ({ ...item, id: `${item.id}-${i}`, capabilityIds: ['capability.test.中文'], action: 'archctx docs anchors --json', details: { modelField: 'human prose' } }));
    const rendered = renderAgentNotice({ ...report, items })!;
    expect(Buffer.byteLength(rendered.content!)).toBeLessThanOrEqual(800);
    expect(rendered.content).not.toContain('�');
    expect(rendered.content!.split('\n').filter(line => line.startsWith('- '))).toHaveLength(3);
    expect(rendered.content).toContain('(+5 more: repo-harness architecture-debt --json)');
    expect(rendered.content).toContain('human prose');
    expect(rendered.content).toContain('Run: archctx docs anchors --json');
    const huge = renderAgentNotice({ ...report, items: [{ ...item, action: 'x'.repeat(1024) }] })!;
    expect(Buffer.byteLength(huge.content!)).toBeLessThanOrEqual(800);
    expect(huge.content).toContain('(+1 more: repo-harness architecture-debt --json)');
    expect(huge.content).not.toContain('Run: x');
    expect(renderAgentNotice({ ...report, items: [] })).toBeNull();
  });

  test('#850: a registry consumer sees the inactive model line and its unowned path without a checkpoint', () => {
    const root = registryFixture();
    const options = { env: noticeEnv(root), run: noCheckpoint };
    const ownership = (scoped: ArchctxProviderOptions) => resolveCapabilityOwnership(root, undefined, scoped);
    const first = collectAgentNotice(root, ownership, options);
    expect(first.diagnostics).toBeUndefined();
    expect(first.content).toBe([
      `[Architecture] inactive: ${NO_MODEL}. Run: ${STATUS}`,
      '[ArchitectureDebt] 1 unowned changed path',
      '- unowned-path packages/new-core/index.ts; no capability owns it. Fix: add an owner in .ai/context/capabilities.json',
    ].join('\n'));
    expect(first.systemMessage).toBe([
      `Architecture: inactive (${NO_MODEL}); run ${STATUS}.`,
      'Architecture: 1 unowned changed path; add an owner in .ai/context/capabilities.json.',
    ].join('\n'));
    expect(collectAgentNotice(root, ownership, options)).toEqual({});
    fixtureWrite(root, 'packages/new-core/extra.ts', 'export const extra = 1;\n');
    const second = collectAgentNotice(root, ownership, options);
    expect(second.content).toStartWith('[ArchitectureDebt] 2 unowned changed paths\n');
    expect(second.content).toContain('- unowned-path packages/new-core/extra.ts;');
    expect(second.content).not.toContain('[Architecture]');
  });

  test('#850: a registry consumer without a diff sees the inactive line once', () => {
    const root = registryFixture();
    rmSync(join(root, 'packages'), { recursive: true, force: true });
    const options = { env: noticeEnv(root), run: noCheckpoint };
    const ownership = (scoped: ArchctxProviderOptions) => resolveCapabilityOwnership(root, undefined, scoped);
    expect(collectAgentNotice(root, ownership, options)).toEqual({
      content: `[Architecture] inactive: ${NO_MODEL}. Run: ${STATUS}`,
      systemMessage: `Architecture: inactive (${NO_MODEL}); run ${STATUS}.`,
    });
    expect(collectAgentNotice(root, ownership, options)).toEqual({});
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
  });

  test('#850: a registry-source repository with an adopted model still receives checkpoint debt', () => {
    const root = fixture();
    fixtureWrite(root, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'registry' } }));
    const notice = collectAgentNotice(root, () => noticeOwnership(root), { env: noticeEnv(root) });
    expect(notice.content).toStartWith(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}\n`);
    expect(notice.content).not.toContain('[Architecture]');
    expect(notice.diagnostics).toBeUndefined();
  });

  test('#850: an explicitly disabled provider prints no inactive line but keeps unowned paths', () => {
    const root = registryFixture();
    fixtureWrite(root, 'home/.repo-harness/config.json', JSON.stringify({ architecture: { projection_provider: 'disabled', projection_apply: 'disabled' } }));
    const notice = collectAgentNotice(root, scoped => resolveCapabilityOwnership(root, undefined, scoped), { env: noticeEnv(root), run: noCheckpoint });
    expect(notice.content).toStartWith('[ArchitectureDebt] 1 unowned changed path\n');
    expect(notice.content).not.toContain('[Architecture]');
    expect(existsSync(join(root, '.ai/harness/state/agent-notice-status'))).toBe(false);
  });

  test('#850: missing global configuration and a model adoption refusal are setup states', () => {
    const root = fixture();
    const ownership = noticeOwnership(root);
    rmSync(join(root, 'home/.repo-harness/config.json'));
    const missing = collectAgentNotice(root, () => ownership, { env: noticeEnv(root), run: noCheckpoint });
    expect(missing.content).toBe(`[Architecture] inactive: global architecture configuration is missing; run repo-harness update. Run: ${STATUS}`);
    fixtureWrite(root, 'home/.repo-harness/config.json', JSON.stringify({ architecture: { projection_provider: 'archctx', projection_apply: 'manual' } }));
    const catalog = ERROR_CATALOG.AC_MODEL_ADOPTION_REQUIRED;
    const error = { ...catalog, message: 'adopt the model', reasonCode: 'model-missing' };
    const refused = collectAgentNotice(root, () => ownership, {
      env: noticeEnv(root),
      run: () => ({ status: 1, signal: null, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: false, requestId: 'checkpoint', error }), stderr: '' }),
    });
    expect(refused.content).toBe(`[Architecture] inactive: AC_MODEL_ADOPTION_REQUIRED, action ${catalog.action}. Run: ${STATUS}`);
    expect(refused.diagnostics).toBeUndefined();
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
  });

  test('#850: a notice failure is visible once and does not consume the debt', () => {
    const root = fixture();
    const ownership = noticeOwnership(root);
    const env = noticeEnv(root);
    const failed = collectAgentNotice(root, () => ownership, { env, run: timedOut });
    expect(failed.content).toBe('[Architecture] notice unavailable (RH_ARCHCTX_TIMEOUT): architecture notice timed out after 3 s; run repo-harness architecture-debt --json');
    expect(failed.systemMessage).toBe('Architecture: notice unavailable (RH_ARCHCTX_TIMEOUT); run repo-harness architecture-debt --json.');
    expect(failed.diagnostics!.trim().split('\n')).toHaveLength(1);
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
    const repeated = collectAgentNotice(root, () => ownership, { env, run: timedOut });
    expect(repeated.content).toBeUndefined();
    expect(repeated.systemMessage).toBeUndefined();
    expect(repeated.diagnostics).toContain('RH_ARCHCTX_TIMEOUT');
    const recovered = collectAgentNotice(root, () => ownership, { env });
    expect(recovered.content).toStartWith(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}\n`);
    expect(recovered.content).not.toContain('[Architecture]');
    // Recovery ends the failure state, so the same failure prints again.
    expect(collectAgentNotice(root, () => ownership, { env, run: timedOut }).content).toContain('notice unavailable (RH_ARCHCTX_TIMEOUT)');
  });
});
