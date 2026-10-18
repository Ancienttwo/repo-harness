import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { collectAgentNotice, renderAgentNotice } from '../src/cli/hook/agent-notice';
import { checkpointArchitectureDebt } from '../src/effects/architecture/archctx-provider';
import { agentNoticeFixture, noticeOwnership, noticeEnv, NOTICE_CAPABILITY } from './helpers/agent-notice';
import { fixtureGit, fixtureWrite } from './helpers/module-repository';

const roots: string[] = [];
function fixture() { const root = agentNoticeFixture(); roots.push(root); return root; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('AgentNotice', () => {
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
    const key = createHash('sha256').update(JSON.stringify(['feature', measured.report.items.map(item => item.id).sort()])).digest('hex');
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
    expect(collectAgentNotice(root, () => null)).toEqual({});
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
  });

  test('failures, timeouts and unsafe markers emit only one diagnostic and can retry', () => {
    const root = fixture();
    const ownership = noticeOwnership(root);
    const failed = collectAgentNotice(root, () => ownership, { env: noticeEnv(root), run: () => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true }) });
    expect(failed.content).toBeUndefined();
    expect(failed.systemMessage).toBeUndefined();
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
});
