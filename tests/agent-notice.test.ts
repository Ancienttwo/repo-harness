import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ERROR_CATALOG } from 'archctx-contracts';
import { collectAgentNotice, renderAgentNotice } from '../src/cli/hook/agent-notice';
import { ArchctxClient, checkpointArchitectureDebt } from '../src/effects/architecture/archctx-provider';
import { ARCHCTX_REQUIRED_VERSION } from '../src/core/architecture/projection';
import type { ArchctxProviderOptions } from '../src/core/architecture/contracts';
import type { CapabilityOwnership } from '../src/core/capabilities/registry';
import { resolveCapabilityOwnership } from '../src/effects/state/resolve-effective-state';
import { agentNoticeFixture, noticeOwnership, noticeEnv, registryNoticeFixture, registryProjectedFixture, unignoreNoticeState, writeNoticeRegistry, NOTICE_CAPABILITY } from './helpers/agent-notice';
import { fixtureCommit, fixtureGit, fixtureWrite, writeStateMachine, STATE_MACHINE_ID } from './helpers/module-repository';

const roots: string[] = [];
function fixture() { const root = agentNoticeFixture(); roots.push(root); return root; }
function registryFixture() { const root = registryNoticeFixture(); roots.push(root); return root; }
function projectedFixture() { const root = registryProjectedFixture(); roots.push(root); return root; }
const noCheckpoint = () => { throw new Error('checkpoint must not run'); };
const timedOut = () => ({ status: null, signal: 'SIGTERM' as const, stdout: '', stderr: '', timedOut: true });
const NOTICE_TIMEOUT = 'repo-harness: architecture notice: not finished in its time budget; the next hook measures again';
const killed = () => ({ status: null, signal: 'SIGKILL' as const, stdout: '', stderr: '' });
const STATUS = 'rh architecture-projection status --json';
const NO_MODEL = 'no ArchContext model (.archcontext/manifest.yaml is missing)';
const UNIGNORED = '[Architecture] notice unavailable: .ai/harness/state/ is not Git-ignored. Fix: run rh update to write the runtime-state block to the user-level Git excludes file.';
const UNIGNORED_MESSAGE = 'Architecture: notice unavailable (.ai/harness/state/ is not Git-ignored); run rh update.';
const ARCHIMAP = 'docs/architecture/archimap.html';
const ARCHIMAP_MARKER = '.ai/harness/state/agent-notice-archimap';
const ARCHIMAP_HEADER = `[Archimap] ${ARCHIMAP} was not updated, but this branch changed the architecture model.`;
const ARCHIMAP_FOOTER = 'Refresh the map with the repo-harness-archimap skill before the PR is ready.';
const ARCHIMAP_MESSAGE = `Archimap: the architecture model changed on this branch; refresh ${ARCHIMAP}.`;
/** Commits only the map and moves main to it, so the map exists but this branch has not changed it. */
function adoptArchimap(root: string): void {
  fixtureWrite(root, ARCHIMAP, '<!doctype html><title>Map</title>\n');
  fixtureGit(root, ['add', ARCHIMAP]);
  fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=t@t', 'commit', '-qm', 'map']);
  fixtureGit(root, ['branch', '-f', 'main', 'HEAD']);
}
const touchRegistry = (root: string) => fixtureWrite(root, '.ai/context/capabilities.json', `${readFileSync(join(root, '.ai/context/capabilities.json'), 'utf8')}\n`);
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
        const data = args[0] === 'resolve' ? { results: paths.map(path => ({ path, matched: true, ambiguous: false, stableId: NOTICE_CAPABILITY, owningCapabilityId: NOTICE_CAPABILITY })) } : report;
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

  test('#2491: a deadline or Git timeout in the checkpoint or the archimap read gives one fixed diagnostic and no block', () => {
    type Case = (root: string) => { readonly options: ArchctxProviderOptions; readonly ownership?: (options: ArchctxProviderOptions) => CapabilityOwnership | null };
    // Only `git merge-base` hangs and gets killed by its timeout; the fixed clock keeps the deadline from running out first.
    const slowMergeBase = (root: string): ArchctxProviderOptions => {
      const slowGit = join(root, 'home/slow-git');
      writeFileSync(slowGit, `#!/bin/sh\ncase "$*" in *merge-base*) echo >> "${join(root, 'home/merge-base.log')}"; exec sleep 10;; esac\nexec git "$@"\n`, { mode: 0o755 });
      return { env: { ...noticeEnv(root), REPO_HARNESS_GIT_BIN: slowGit }, nowMs: () => 0 };
    };
    const cases: Record<string, Case> = {
      'checkpoint git': root => ({ options: slowMergeBase(root) }),
      'archimap git': root => {
        adoptArchimap(root);
        // No owned path, so the checkpoint returns before Git; only the archimap read times out.
        return { options: slowMergeBase(root), ownership: () => ({ ...noticeOwnership(root), capabilities: [] }) };
      },
      'archimap and checkpoint git': root => {
        adoptArchimap(root);
        return { options: slowMergeBase(root) };
      },
      'before the process': root => ({ options: { env: noticeEnv(root), deadlineMs: Date.now() - 1, run: noCheckpoint } }),
      'after decode': root => {
        let now = 0;
        return {
          options: {
            env: noticeEnv(root), nowMs: () => now,
            run: (_binary, args) => {
              // The real report for the same paths, outside the notice budget; the clock then passes the deadline.
              const data = new ArchctxClient(root, ARCHCTX_REQUIRED_VERSION, { env: noticeEnv(root) }).data(args, 60_000);
              now = 5_000;
              return { status: 0, signal: null, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'checkpoint', data }), stderr: '' };
            },
          },
        };
      },
    };
    const mergeBaseCalls = { 'checkpoint git': 1, 'archimap git': 1, 'archimap and checkpoint git': 2 } as Record<string, number>;
    for (const [name, setup] of Object.entries(cases)) {
      const root = fixture();
      const { options, ownership } = setup(root);
      const result = collectAgentNotice(root, ownership ?? (() => noticeOwnership(root)), options);
      expect([name, result]).toEqual([name, { diagnostics: `${NOTICE_TIMEOUT}\n` }]);
      const log = join(root, 'home/merge-base.log');
      expect([name, existsSync(log) ? readFileSync(log, 'utf8').length : 0]).toEqual([name, mergeBaseCalls[name] ?? 0]);
    }
  });

  test('#2491: a timeout at each Git call under the host hook timeout, in archctx or in the resolve gives one fixed diagnostic; a resolve failure keeps its block', () => {
    const ownership = (root: string) => (options: ArchctxProviderOptions) => resolveCapabilityOwnership(root, undefined, options);
    // The ownership reads take the Git binary from the process environment, so the fake must be set there too.
    // It logs each call and hangs at call `hang`; the fixed clock keeps the notice deadline from running out first.
    const fakeGit = (root: string, hang: number) => {
      const path = join(root, 'home/counting-git');
      const home = join(root, 'home');
      writeFileSync(path, `#!/bin/sh\nn=$(( $(cat "${home}/git.count" 2>/dev/null || echo 0) + 1 ))\necho $n > "${home}/git.count"\necho "$*" >> "${home}/git.log"\n[ $n -eq ${hang} ] && { echo $n > "${home}/git.hung"; exec sleep 40; }\nexec git "$@"\n`, { mode: 0o755 });
      return path;
    };
    const run = (root: string, hang: number) => {
      const git = fakeGit(root, hang);
      const previous = process.env.REPO_HARNESS_GIT_BIN;
      process.env.REPO_HARNESS_GIT_BIN = git;
      try { return collectAgentNotice(root, ownership(root), { env: { ...noticeEnv(root), REPO_HARNESS_GIT_BIN: git }, nowMs: () => 0 }); }
      finally { if (previous === undefined) delete process.env.REPO_HARNESS_GIT_BIN; else process.env.REPO_HARNESS_GIT_BIN = previous; }
    };
    const baseline = fixture();
    expect(run(baseline, 0).content).toContain('[ArchitectureDebt]');
    const calls = readFileSync(join(baseline, 'home/git.log'), 'utf8').trim().split('\n');
    // The review subject reads (`--literal-pathspecs`) use the 120 s Git default; the 30 s host hook timeout kills the hook first.
    const rows = calls.flatMap((args, index) => args.includes('--literal-pathspecs') ? [] : [index + 1]);
    expect(rows.length).toBeGreaterThan(0);
    for (const hang of rows) {
      const root = fixture();
      const result = run(root, hang);
      expect([hang, calls[hang - 1], readFileSync(join(root, 'home/git.hung'), 'utf8').trim(), result])
        .toEqual([hang, calls[hang - 1], String(hang), { diagnostics: `${NOTICE_TIMEOUT}\n` }]);
    }
    const archctxRoot = fixture();
    expect(collectAgentNotice(archctxRoot, () => noticeOwnership(archctxRoot), { env: noticeEnv(archctxRoot), run: timedOut })).toEqual({ diagnostics: `${NOTICE_TIMEOUT}\n` });
    const resolveRoot = fixture();
    expect(collectAgentNotice(resolveRoot, ownership(resolveRoot), { env: noticeEnv(resolveRoot), run: timedOut })).toEqual({ diagnostics: `${NOTICE_TIMEOUT}\n` });
    const failedRoot = fixture();
    const resolveFailed = collectAgentNotice(failedRoot, ownership(failedRoot), { env: noticeEnv(failedRoot), run: killed });
    expect(resolveFailed.content).toStartWith('[Architecture] notice unavailable (error): capability_ownership:unavailable ARCHCONTEXT_RESOLVE_FAILED: ');
    expect(resolveFailed.systemMessage).toBe('Architecture: notice unavailable (error); run rh architecture-debt --json.');
    expect(resolveFailed.diagnostics).toStartWith('repo-harness: architecture notice unavailable: capability_ownership:unavailable ARCHCONTEXT_RESOLVE_FAILED: ');
  }, 240_000);

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
    expect(first.content).toContain('Run: rh architecture-projection anchors --json');
    expect(first.content).not.toMatch(/Run: archctx /);
    expect(first.content).toContain('human');
    expect(Buffer.byteLength(first.content!)).toBeLessThanOrEqual(800);
    expect(first.systemMessage).toBe(`Architecture: 1 debt item in ${NOTICE_CAPABILITY}; run rh architecture-debt --json.`);
    expect(first.diagnostics).toBeUndefined();
    const key = createHash('sha256').update(JSON.stringify(['feature', measured.report.items.map(item => item.id).sort(), []])).digest('hex');
    expect(readFileSync(join(root, '.ai/harness/state/agent-notice'), 'utf8').trim()).toBe(key);
    expect(collectAgentNotice(root, () => ownership, options)).toEqual({});
    fixtureWrite(root, 'docs/architecture/.projection-manifest.json', '{"profile":"repo-harness/v1","targets":{}}\n');
    expect(collectAgentNotice(root, () => ownership, options)).toEqual({});
    fixtureWrite(root, 'docs/architecture/modules/test/module.md', '## 3. Decisions\nRead `src/module/read.ts:998`.\n');
    expect(collectAgentNotice(root, () => ownership, options).content).toContain('[ArchitectureDebt]');
    fixtureGit(root, ['checkout', '-qb', 'other']);
    expect(collectAgentNotice(root, () => ownership, options).content).toContain('[ArchitectureDebt]');
  });

  test('a changed state machine anchor prints one row with the machine; a broken rule with a finding mark prints none', () => {
    const root = fixture();
    const ownership = noticeOwnership(root);
    const options = { env: noticeEnv(root) };
    writeStateMachine(root);
    const check = new ArchctxClient(root, ARCHCTX_REQUIRED_VERSION, options).data(['state-machines', 'check', '--json'], 60_000);
    const [anchor] = (check as { machines: { anchors: { digest: string }[] }[] }).machines[0]!.anchors;
    writeStateMachine(root, anchor!.digest);
    expect(collectAgentNotice(root, () => ownership, options).content).not.toContain('state-machine');
    fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 3;\n');
    const stale = collectAgentNotice(root, () => ownership, options).content!;
    expect(stale.split('\n').filter(line => line.startsWith('- state-machine'))).toEqual([
      `- state-machine-stale ${NOTICE_CAPABILITY}; ${STATE_MACHINE_ID} src/module/read.ts anchor-changed. Run: rh architecture-debt --json`]);
    fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\n');
    expect(collectAgentNotice(root, () => ownership, options).content).not.toContain('state-machine');
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
    expect(failed.content).toBeUndefined();
    expect(failed.systemMessage).toBeUndefined();
    expect(failed.diagnostics).toBe(`${NOTICE_TIMEOUT}\n`);
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
    expect(rendered.content).toContain('(+5 more: rh architecture-debt --json)');
    expect(rendered.content).toContain('human prose');
    expect(rendered.content).toContain('Run: rh architecture-projection anchors --json');
    const huge = renderAgentNotice({ ...report, items: [{ ...item, action: 'x'.repeat(1024) }] })!;
    expect(Buffer.byteLength(huge.content!)).toBeLessThanOrEqual(800);
    expect(huge.content).toContain('(+1 more: rh architecture-debt --json)');
    expect(huge.content).not.toContain('Run: x');
    expect(renderAgentNotice({ ...report, items: [] })).toBeNull();
  });

  test('a debt row names a repo-harness command, never a bare archctx from PATH', () => {
    const root = fixture();
    const report = checkpointArchitectureDebt(root, noticeOwnership(root), { env: noticeEnv(root) })!.report;
    const item = report.items.find(entry => entry.kind === 'stale-anchor')!;
    const anchors = renderAgentNotice({ ...report, items: [{ ...item, action: 'archctx docs anchors --json' }] })!;
    expect(anchors.content).toContain('Run: rh architecture-projection anchors --json');
    expect(anchors.content).not.toContain('archctx docs anchors');
    expect(anchors.content).not.toMatch(/Run: archctx /);
    const padded = renderAgentNotice({ ...report, items: [{ ...item, action: '  archctx docs anchors --json\n' }] })!;
    expect(padded.content).toContain('Run: rh architecture-projection anchors --json');
    expect(padded.content).not.toContain('archctx docs anchors');
    const bare = renderAgentNotice({ ...report, items: [{ ...item, action: '\tarchctx\n' }] })!;
    expect(bare.content).toEndWith('Run: rh architecture-debt --json');
    // archctx 0.9.1 gives ownership items this action. repo-harness has no equivalent command.
    const plan = 'archctx plan --id changeset.<id> --operations-file <ownership-operations.json>';
    const owner = renderAgentNotice({ ...report, items: [{ ...item, kind: 'unowned-path', action: plan, details: { modelField: 'source.include/source.exclude/parent' } }] })!;
    expect(owner.content).toContain('Run: rh architecture-debt --json');
    expect(owner.content).not.toContain('archctx plan');
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
    writeNoticeRegistry(root);
    const notice = collectAgentNotice(root, () => noticeOwnership(root), { env: noticeEnv(root) });
    expect(notice.content).toStartWith(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}\n`);
    expect(notice.content).not.toContain('[Architecture]');
    expect(notice.diagnostics).toBeUndefined();
  });

  test('#850: an archcontext repository leaves unowned-path judgment to archctx', () => {
    const root = fixture();
    const ownership = { ...noticeOwnership(root), unowned_paths: ['.archcontext/model/nodes/capability.test.module.yaml'] };
    const notice = collectAgentNotice(root, () => ownership, { env: noticeEnv(root) });
    expect(notice.content).toStartWith(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}\n`);
    expect(notice.content).not.toContain('unowned changed path');
    expect(notice.systemMessage).not.toContain('unowned changed path');
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
    expect(missing.content).toBe(`[Architecture] inactive: global architecture configuration is missing; run rh update. Run: ${STATUS}`);
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
    const failed = collectAgentNotice(root, () => ownership, { env, run: killed });
    expect(failed.content).toBe('[Architecture] notice unavailable (error): archctx checkpoint process failed: signal SIGKILL');
    expect(failed.systemMessage).toBe('Architecture: notice unavailable (error); run rh architecture-debt --json.');
    expect(failed.diagnostics!.trim().split('\n')).toHaveLength(1);
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
    const repeated = collectAgentNotice(root, () => ownership, { env, run: killed });
    expect(repeated.content).toBeUndefined();
    expect(repeated.systemMessage).toBeUndefined();
    expect(repeated.diagnostics).toContain('checkpoint process failed: signal SIGKILL');
    const recovered = collectAgentNotice(root, () => ownership, { env });
    expect(recovered.content).toStartWith(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}\n`);
    expect(recovered.content).not.toContain('[Architecture]');
    // Recovery ends the failure state, so the same failure prints again.
    expect(collectAgentNotice(root, () => ownership, { env, run: killed }).content).toContain('notice unavailable (error)');
  });

  test('#850: a CodeGraph index that is not ready is a setup state', () => {
    const root = fixture();
    const catalog = ERROR_CATALOG.AC_CODE_FACTS_NOT_READY;
    const error = { ...catalog, message: 'code facts are not ready', reasonCode: 'code-facts-not-ready', action: 'codegraph-index' };
    const notice = collectAgentNotice(root, () => noticeOwnership(root), {
      env: noticeEnv(root),
      run: () => ({ status: 1, signal: null, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: false, requestId: 'checkpoint', error }), stderr: '' }),
    });
    expect(notice.content).toBe(`[Architecture] inactive: AC_CODE_FACTS_NOT_READY, action codegraph-index. Run: ${STATUS}`);
    expect(notice.diagnostics).toBeUndefined();
  });

  test('#850: a checkpoint failure with registry unowned paths does not consume the debt marker', () => {
    const root = fixture();
    fixtureWrite(root, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'registry' } }));
    writeNoticeRegistry(root);
    fixtureWrite(root, 'packages/new-core/index.ts', 'export const core = 1;\n');
    const ownership = { ...noticeOwnership(root), unowned_paths: ['packages/new-core/index.ts'] };
    const env = noticeEnv(root);
    const failed = collectAgentNotice(root, () => ownership, { env, run: timedOut });
    expect(failed.content).toBeUndefined();
    expect(failed.diagnostics).toBe(`${NOTICE_TIMEOUT}\n`);
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
    const recovered = collectAgentNotice(root, () => ownership, { env });
    expect(recovered.content).toStartWith('[ArchitectureDebt] 1 unowned changed path\n');
    expect(recovered.content).toContain(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}\n`);
  });

  test('#852: registry unowned paths that this branch did not change stay out of the notice', () => {
    const root = projectedFixture();
    const env = noticeEnv(root);
    const ownership = (scoped: ArchctxProviderOptions) => resolveCapabilityOwnership(root, undefined, scoped);
    // The ownership answer measures from the manifest commit, so it still lists the path that main changed.
    expect(ownership({ env })!.unowned_paths).toEqual(['packages/old-core/index.ts']);
    const options = { env, run: noCheckpoint };
    expect(collectAgentNotice(root, ownership, options)).toEqual({
      content: `[Architecture] inactive: ${NO_MODEL}. Run: ${STATUS}`,
      systemMessage: `Architecture: inactive (${NO_MODEL}); run ${STATUS}.`,
    });
    fixtureWrite(root, 'packages/new-core/index.ts', 'export const core = 1;\n');
    expect(collectAgentNotice(root, ownership, options).content).toBe([
      '[ArchitectureDebt] 1 unowned changed path',
      '- unowned-path packages/new-core/index.ts; no capability owns it. Fix: add an owner in .ai/context/capabilities.json',
    ].join('\n'));
    // On a branch ahead of main, committed unowned paths stay in the notice.
    fixtureWrite(root, 'packages/new-core/extra.ts', 'export const extra = 1;\n');
    fixtureCommit(root);
    const ahead = collectAgentNotice(root, ownership, options).content!;
    expect(ahead).toStartWith('[ArchitectureDebt] 2 unowned changed paths\n');
    expect(ahead).toContain('- unowned-path packages/new-core/extra.ts;');
    expect(ahead).not.toContain('packages/old-core');
  });

  test('#852: a state directory that Git does not ignore gives a visible line at SessionStart only', () => {
    const root = registryFixture();
    unignoreNoticeState(root);
    const options = { env: noticeEnv(root), run: noCheckpoint };
    const ownership = (scoped: ArchctxProviderOptions) => resolveCapabilityOwnership(root, undefined, scoped);
    const turn = collectAgentNotice(root, ownership, options);
    expect(turn.content).toBeUndefined();
    expect(turn.systemMessage).toBeUndefined();
    expect(turn.diagnostics!.trim().split('\n')).toHaveLength(1);
    expect(turn.diagnostics).toContain('.ai/harness/state/agent-notice-status is not Git-ignored');
    // No marker can record a delivery, so each SessionStart repeats the line.
    for (const session of [1, 2]) {
      expect(collectAgentNotice(root, ownership, options, 'session-start'), `session ${session}`).toMatchObject({ content: UNIGNORED, systemMessage: UNIGNORED_MESSAGE });
    }
    expect(existsSync(join(root, '.ai/harness/state/agent-notice-status'))).toBe(false);
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
  });

  test('#855 review: SessionStart checks the ignore rule even when it writes no marker', () => {
    // Markers that are already current. The rule lives in .git/info/exclude, so
    // removing it after the first delivery changes no tracked path and no notice key.
    const registry = registryFixture();
    unignoreNoticeState(registry);
    fixtureWrite(registry, '.git/info/exclude', '.ai/harness/state/\n');
    const options = { env: noticeEnv(registry), run: noCheckpoint };
    const ownership = (scoped: ArchctxProviderOptions) => resolveCapabilityOwnership(registry, undefined, scoped);
    expect(collectAgentNotice(registry, ownership, options, 'session-start').content).toStartWith('[Architecture] inactive:');
    fixtureWrite(registry, '.git/info/exclude', '');
    expect(collectAgentNotice(registry, ownership, options, 'session-start')).toEqual({ content: UNIGNORED, systemMessage: UNIGNORED_MESSAGE });
    expect(collectAgentNotice(registry, ownership, options)).toEqual({});
    // An active loop with no debt and no marker.
    const active = fixture();
    fixtureCommit(active);
    fixtureGit(active, ['branch', '-f', 'main', 'HEAD']);
    unignoreNoticeState(active);
    const quiet = { env: noticeEnv(active), run: noCheckpoint };
    expect(collectAgentNotice(active, () => noticeOwnership(active), quiet)).toEqual({});
    expect(collectAgentNotice(active, () => noticeOwnership(active), quiet, 'session-start')).toEqual({ content: UNIGNORED, systemMessage: UNIGNORED_MESSAGE });
  });

  test('#855 review: a failed unowned filter keeps the setup state and reports on stderr only', () => {
    const root = registryFixture();
    const broken = () => ({ review_base: 'refs/heads/absent', capability_ids: [], capabilities: [], unowned_paths: ['packages/new-core/index.ts'] });
    const inactive = collectAgentNotice(root, broken, { env: noticeEnv(root), run: noCheckpoint });
    expect(inactive.content).toBe(`[Architecture] inactive: ${NO_MODEL}. Run: ${STATUS}`);
    expect(inactive.diagnostics).toContain('refs/heads/absent');
    expect(existsSync(join(root, '.ai/harness/state/agent-notice'))).toBe(false);
    fixtureWrite(root, 'home/.repo-harness/config.json', JSON.stringify({ architecture: { projection_provider: 'disabled', projection_apply: 'disabled' } }));
    const disabled = collectAgentNotice(root, broken, { env: noticeEnv(root), run: noCheckpoint });
    expect(disabled.content).toBeUndefined();
    expect(disabled.systemMessage).toBeUndefined();
    expect(disabled.diagnostics).toContain('refs/heads/absent');
  });

  test('archimap: a model change without a map refresh prints once per trigger set while archctx is inactive', () => {
    const root = registryFixture();
    adoptArchimap(root);
    touchRegistry(root);
    const options = { env: noticeEnv(root), run: noCheckpoint };
    const ownership = (scoped: ArchctxProviderOptions) => resolveCapabilityOwnership(root, undefined, scoped);
    const first = collectAgentNotice(root, ownership, options);
    expect(first.diagnostics).toBeUndefined();
    expect(first.content).toStartWith(`[Architecture] inactive: ${NO_MODEL}. Run: ${STATUS}\n`);
    expect(first.content).toEndWith([ARCHIMAP_HEADER, '- .ai/context/capabilities.json', ARCHIMAP_FOOTER].join('\n'));
    expect(first.systemMessage).toEndWith(`\n${ARCHIMAP_MESSAGE}`);
    expect(existsSync(join(root, ARCHIMAP_MARKER))).toBe(true);
    expect(collectAgentNotice(root, ownership, options)).toEqual({});
    // A new trigger set prints again, bounded to three rows with an exact overflow count.
    for (const name of ['a', 'b', 'c', 'd']) fixtureWrite(root, `.archcontext/model/nodes/${name}.yaml`, '{}\n');
    const second = collectAgentNotice(root, ownership, options).content!;
    expect(second).toEndWith([
      ARCHIMAP_HEADER, '- .ai/context/capabilities.json', '- .archcontext/model/nodes/a.yaml', '- .archcontext/model/nodes/b.yaml',
      '(+2 more architecture model paths)', ARCHIMAP_FOOTER,
    ].join('\n'));
    expect(second).not.toContain('[Architecture] inactive');
    expect(collectAgentNotice(root, ownership, options).content ?? '').not.toContain('[Archimap]');
  });

  test('archimap: no notice without a map file or when the branch also changed the map', () => {
    const root = registryFixture();
    touchRegistry(root);
    const options = { env: noticeEnv(root), run: noCheckpoint };
    const ownership = (scoped: ArchctxProviderOptions) => resolveCapabilityOwnership(root, undefined, scoped);
    const absent = collectAgentNotice(root, ownership, options);
    expect(absent.content).not.toContain('[Archimap]');
    expect(absent.systemMessage).not.toContain('Archimap');
    // The untracked map is a change on this branch.
    fixtureWrite(root, ARCHIMAP, '<!doctype html><title>Map</title>\n');
    expect(collectAgentNotice(root, ownership, options)).toEqual({});
    expect(existsSync(join(root, ARCHIMAP_MARKER))).toBe(false);
  });

  test('archimap: an active loop prints the map line beside the debt, and a disabled provider keeps it', () => {
    const root = fixture();
    adoptArchimap(root);
    fixtureWrite(root, '.ai/context/capabilities.json', '{}\n');
    const notice = collectAgentNotice(root, () => noticeOwnership(root), { env: noticeEnv(root) });
    expect(notice.diagnostics).toBeUndefined();
    expect(notice.content).toStartWith(`[ArchitectureDebt] 1 new in ${NOTICE_CAPABILITY}\n`);
    expect(notice.content).toEndWith([ARCHIMAP_HEADER, '- .ai/context/capabilities.json', ARCHIMAP_FOOTER].join('\n'));
    const disabled = registryFixture();
    adoptArchimap(disabled);
    touchRegistry(disabled);
    fixtureWrite(disabled, 'home/.repo-harness/config.json', JSON.stringify({ architecture: { projection_provider: 'disabled', projection_apply: 'disabled' } }));
    const quiet = collectAgentNotice(disabled, scoped => resolveCapabilityOwnership(disabled, undefined, scoped), { env: noticeEnv(disabled), run: noCheckpoint });
    expect(quiet.content).not.toContain('[Architecture]');
    expect(quiet.content).toEndWith(ARCHIMAP_FOOTER);
    expect(quiet.systemMessage).toContain(ARCHIMAP_MESSAGE);
  });

  test('archimap: an archctx ownership timeout in archcontext mode keeps the map line and gives only a diagnostic for the timeout', () => {
    const root = fixture();
    adoptArchimap(root);
    fixtureWrite(root, '.archcontext/model/nodes/extra.yaml', '{}\n');
    const options = { env: noticeEnv(root), run: timedOut };
    const ownership = (scoped: ArchctxProviderOptions) => resolveCapabilityOwnership(root, undefined, scoped);
    const failed = collectAgentNotice(root, ownership, options);
    // #2491: a resolve timeout is a notice-path timeout, so it gives no block and its diagnostic names no command.
    expect(failed.content).toBe([ARCHIMAP_HEADER, '- .archcontext/model/nodes/extra.yaml', ARCHIMAP_FOOTER].join('\n'));
    expect(failed.systemMessage).toBe(ARCHIMAP_MESSAGE);
    expect(failed.diagnostics).toBe(`${NOTICE_TIMEOUT}\n`);
    // #1429: the ownership reader still asks for a retry, not an update.
    expect(() => ownership(options)).toThrow('ARCHCONTEXT_RESOLVE_TIMEOUT: archctx resolve timed out; the architecture notice is skipped for this turn; fix: rh state resolve --json');
    expect(existsSync(join(root, ARCHIMAP_MARKER))).toBe(true);
    // The map line has its own marker, so the repeated failure prints neither line again.
    const repeated = collectAgentNotice(root, ownership, options);
    expect(repeated.content).toBeUndefined();
    expect(repeated.diagnostics).toBe(`${NOTICE_TIMEOUT}\n`);
  });

  test('#1429: only a package-local archctx mismatch tells the ownership reader to update', () => {
    const root = fixture();
    fixtureWrite(root, 'home/consumer/node_modules/archctx/package.json', JSON.stringify({ name: 'archctx', version: '0.0.0' }));
    const options = { env: noticeEnv(root), consumerRoot: join(root, 'home/consumer') };
    expect(() => resolveCapabilityOwnership(root, undefined, options))
      .toThrow(/^capability_ownership:unavailable ARCHCONTEXT_RESOLVE_FAILED: RH_ARCHCTX_PACKAGE_MISMATCH: .*; fix: rh update$/);
  });

  test('archimap: a failed shared diff is one diagnostic and keeps the setup line; no review base prints nothing', () => {
    const root = registryFixture();
    adoptArchimap(root);
    touchRegistry(root);
    const broken = () => ({ review_base: 'refs/heads/absent', capability_ids: [], capabilities: [], unowned_paths: ['packages/new-core/index.ts'] });
    const failed = collectAgentNotice(root, broken, { env: noticeEnv(root), run: noCheckpoint });
    expect(failed.content).toBe(`[Architecture] inactive: ${NO_MODEL}. Run: ${STATUS}`);
    expect(failed.diagnostics!.trim().split('\n')).toHaveLength(1);
    // The archimap check alone reads the diff and reports its own failure.
    const alone = collectAgentNotice(root, () => ({ ...broken(), unowned_paths: [] }), { env: noticeEnv(root), run: noCheckpoint });
    expect(alone.content).toBeUndefined();
    expect(alone.diagnostics).toContain('refs/heads/absent');
    const unbased = collectAgentNotice(root, () => ({ ...broken(), review_base: null }), { env: noticeEnv(root), run: noCheckpoint });
    expect(unbased).toEqual({});
    expect(existsSync(join(root, ARCHIMAP_MARKER))).toBe(false);
    // Without the map the unowned filter reads the same diff, so the shared failure is not repeated.
    rmSync(join(root, ARCHIMAP));
    expect(collectAgentNotice(root, broken, { env: noticeEnv(root), run: noCheckpoint }).diagnostics).toBe(failed.diagnostics);
  });
});
