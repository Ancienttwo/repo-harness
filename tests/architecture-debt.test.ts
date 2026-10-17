import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { digestJson, errorEnvelope, type ArchitectureDebtItemV1, type ArchitectureDebtReportV1, type Json } from 'archctx-contracts';
import { ARCHCTX_REQUIRED_VERSION, decodeArchitectureDebtReport, type ArchitectureProjectionPolicy } from '../src/core/architecture/projection';
import { ArchctxClientError, completeArchitectureDebt, type ArchctxProcessResult, type RunArchctxProcess } from '../src/effects/architecture/archctx-provider';
import { architectureDebtReport, architectureDebtSummary } from '../src/cli/commands/architecture-debt';

/**
 * Recorded from archctx@0.8.0 `complete --head-sha <sha> --json` in a disposable
 * repository with one capability, one unproven flow and one unowned source path.
 */
const recorded = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'architecture-debt', 'complete-envelope.archctx-0.8.0.json'), 'utf8')) as {
  data: { snapshot: { headSha: string }; debt: ArchitectureDebtReportV1 } & Record<string, unknown>;
} & Record<string, unknown>;
const recordedDebt = recorded.data.debt;
const policy: ArchitectureProjectionPolicy = { provider: 'archctx', applyMode: 'manual', requiredVersion: ARCHCTX_REQUIRED_VERSION, timeoutMs: 120_000 };
const roots: string[] = [];

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const clone = <T>(value: T): T => structuredClone(value);
/** Re-binds a derived report so that only the property under test is invalid. */
function redigest(report: Omit<ArchitectureDebtReportV1, 'digest'> & { digest?: string }): ArchitectureDebtReportV1 {
  const { digest: _digest, ...body } = report;
  return { ...body, digest: digestJson(body as unknown as Json) };
}
function withItems(items: ArchitectureDebtItemV1[]): ArchitectureDebtReportV1 {
  return redigest({ ...clone(recordedDebt), items, actionsRequired: [...new Set(items.map((item) => item.action))].sort() });
}
const ok = (value: unknown): ArchctxProcessResult => ({ status: 0, signal: null, stdout: JSON.stringify(value), stderr: '' });
const failed = (value: unknown): ArchctxProcessResult => ({ status: 1, signal: null, stdout: JSON.stringify(value), stderr: '' });
const completeEnvelope = (headSha: string, debt: unknown) => ({ ...clone(recorded), data: { ...clone(recorded.data), snapshot: { ...recorded.data.snapshot, headSha }, debt } });
// The code facts shape comes from package-local archctx@0.8.0 doctor in a disposable repository.
const doctorEnvelope = (state = 'ready', issues: Array<{ code: string; message: string }> = []) => ({
  schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'doctor',
  data: { codeFacts: { schemaVersion: 'archcontext.repository-code-facts/v1', state, indexPresent: state !== 'index-missing', requiredVersion: '1.6.2', codeGraphVersion: '1.6.2', issues } },
});

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).trim();
}

/** A fake package-local archctx with its declared CodeGraph, and a real two-commit Git repository. */
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-architecture-debt-')));
  roots.push(root);
  const consumerRoot = join(root, 'consumer');
  const archctxRoot = join(consumerRoot, 'node_modules', 'archctx');
  const codegraphRoot = join(consumerRoot, 'node_modules', '@colbymchenry', 'codegraph');
  mkdirSync(join(archctxRoot, 'bin'), { recursive: true });
  mkdirSync(codegraphRoot, { recursive: true });
  writeFileSync(join(archctxRoot, 'package.json'), JSON.stringify({ name: 'archctx', version: ARCHCTX_REQUIRED_VERSION, engines: { node: '>=22.22 <26' }, bin: { archctx: './bin/archctx' }, dependencies: { '@colbymchenry/codegraph': '1.6.2' } }));
  writeFileSync(join(archctxRoot, 'bin', 'archctx'), '#!/bin/sh\nexit 99\n');
  chmodSync(join(archctxRoot, 'bin', 'archctx'), 0o755);
  writeFileSync(join(codegraphRoot, 'package.json'), JSON.stringify({ name: '@colbymchenry/codegraph', version: '1.6.2', bin: { codegraph: 'npm-shim.js' } }));
  writeFileSync(join(codegraphRoot, 'npm-shim.js'), 'process.exit(99);\n');
  const repoRoot = join(root, 'repo');
  mkdirSync(join(repoRoot, 'src'), { recursive: true });
  git(repoRoot, ['init', '-q']);
  writeFileSync(join(repoRoot, 'src', 'a.ts'), 'export const a = 1;\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base']);
  const baseSha = git(repoRoot, ['rev-parse', 'HEAD']);
  writeFileSync(join(repoRoot, 'src', 'b.ts'), 'export const b = 2;\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'head']);
  const headSha = git(repoRoot, ['rev-parse', 'HEAD']);
  // The index at HEAD is the operator's; the base index is built by the command.
  mkdirSync(join(repoRoot, '.codegraph'));
  return { consumerRoot, repoRoot, baseSha, headSha, codegraphBin: realpathSync(join(codegraphRoot, 'npm-shim.js')) };
}

type Call = { tool: 'archctx' | 'codegraph'; args: readonly string[]; cwd: string };

/** Answers like archctx@0.8.0: the debt depends on which checkout runs `complete`. */
function fakeProvider(f: ReturnType<typeof fixture>, debt: { head: ArchitectureDebtReportV1; base: ArchitectureDebtReportV1 | ArchctxProcessResult }, daemonStop: 'ok' | 'fail' = 'ok') {
  const calls: Call[] = [];
  let baseCheckout: string | null = null;
  const run: RunArchctxProcess = (binary, args, options) => {
    const tool = binary === f.codegraphBin ? 'codegraph' : 'archctx';
    calls.push({ tool, args, cwd: options.cwd });
    if (tool === 'codegraph') {
      mkdirSync(join(options.cwd, '.codegraph'));
      return { status: 0, signal: null, stdout: '', stderr: '' };
    }
    if (args[0] === 'doctor') return ok(doctorEnvelope());
    if (args[0] === 'complete') {
      const sha = args[args.indexOf('--head-sha') + 1]!;
      if (options.cwd === f.repoRoot) return ok(completeEnvelope(sha, debt.head));
      baseCheckout = options.cwd;
      return 'status' in debt.base ? debt.base : ok(completeEnvelope(sha, debt.base));
    }
    if (args[0] === 'daemon' && args[1] === 'list') {
      const daemons = baseCheckout === null ? [] : [{ stateDir: '/state/base', connection: 'valid', root: baseCheckout }, { stateDir: '/state/head', connection: 'valid', root: f.repoRoot }];
      return ok({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.list', data: { stateRoot: '/state', daemons } });
    }
    if (args[0] === 'daemon' && args[1] === 'stop') {
      return daemonStop === 'ok'
        ? ok({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.stop', data: { stopping: true } })
        : failed(errorEnvelope('daemon.stop', 'AC_RUNTIME_UNAVAILABLE', 'no connection file'));
    }
    throw new Error(`unexpected archctx call ${args.join(' ')}`);
  };
  return { calls, run, baseCheckout: () => baseCheckout };
}

function worktrees(repoRoot: string): string[] {
  return git(repoRoot, ['worktree', 'list', '--porcelain']).split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));
}

describe('architecture debt report decoder', () => {
  test('accepts the recorded archctx@0.8.0 report unchanged', () => {
    expect(decodeArchitectureDebtReport(clone(recordedDebt))).toEqual(recordedDebt);
    expect(recordedDebt.items.map((item) => item.kind)).toEqual(['flow-proof-failed', 'unowned-path']);
  });

  test('rejects a tampered digest, unsorted items, an unknown kind and extra keys', () => {
    expect(() => decodeArchitectureDebtReport({ ...clone(recordedDebt), digest: `sha256:${'0'.repeat(64)}` })).toThrow('digest must bind the debt report');
    expect(() => decodeArchitectureDebtReport(redigest({ ...clone(recordedDebt), items: [...clone(recordedDebt.items)].reverse() }))).toThrow('items must be sorted and unique');
    const unknownKind = clone(recordedDebt);
    (unknownKind.items[0] as { kind: string }).kind = 'made-up-debt';
    expect(() => decodeArchitectureDebtReport(redigest(unknownKind))).toThrow('architecture debt report invalid');
    expect(() => decodeArchitectureDebtReport(redigest({ ...clone(recordedDebt), extra: true } as never))).toThrow('additional property denied');
    const itemExtra = clone(recordedDebt);
    (itemExtra.items[0] as unknown as Record<string, unknown>).extra = true;
    expect(() => decodeArchitectureDebtReport(redigest(itemExtra))).toThrow('additional property denied');
  });
});

describe('completeArchitectureDebt', () => {
  test('doctor not-ready stops debt with a typed fix before complete or base indexing', () => {
    const f = fixture();
    const calls: Array<readonly string[]> = [];
    const issues = [{ code: 'version-mismatch', message: 'CodeGraph repository status version mismatch' }, { code: 'pending-source-changes', message: 'CodeGraph repository index has pending source changes' }];
    const provider = fakeProvider(f, { head: recordedDebt, base: recordedDebt });
    const run: RunArchctxProcess = (binary, args, options) => {
      calls.push(args);
      return args[0] === 'doctor' ? ok(doctorEnvelope('not-ready', issues)) : provider.run(binary, args, options);
    };
    let caught: unknown;
    try { architectureDebtReport(f.repoRoot, 'HEAD~1', { consumerRoot: f.consumerRoot, policy, run }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ArchctxClientError);
    expect(caught).toMatchObject({ code: 'RH_ARCHCTX_CODE_FACTS_NOT_READY', reasonCode: 'code-facts-not-ready', details: { state: 'not-ready', issues } });
    expect((caught as Error).message).toContain('version-mismatch, pending-source-changes');
    expect((caught as Error).message).toContain('codegraph index .');
    expect((caught as Error).message).toContain(f.repoRoot);
    expect(calls).toEqual([['doctor', '--json']]);
    expect(worktrees(f.repoRoot)).toEqual([f.repoRoot]);
  });

  test('doctor unknown or malformed code facts fail closed before complete', () => {
    const f = fixture();
    const valid = doctorEnvelope();
    const variants = [
      { ...valid, requestId: 'other' },
      { ...valid, data: {} },
      doctorEnvelope('unknown'),
      { ...valid, data: { codeFacts: { ...valid.data.codeFacts, schemaVersion: 'archcontext.repository-code-facts/v2' } } },
      { ...valid, data: { codeFacts: { ...valid.data.codeFacts, issues: [{ code: 1 }] } } },
      { ...valid, data: { codeFacts: { ...valid.data.codeFacts, issues: undefined } } },
    ];
    for (const envelope of variants) {
      const calls: Array<readonly string[]> = [];
      const run: RunArchctxProcess = (_binary, args) => { calls.push(args); return ok(envelope); };
      expect(() => completeArchitectureDebt(f.repoRoot, f.headSha, { consumerRoot: f.consumerRoot, policy, run })).toThrow('RH_ARCHCTX_DOCTOR_INVALID');
      expect(calls).toEqual([['doctor', '--json']]);
    }
  });

  test('a ready doctor keeps the recorded complete report unchanged', () => {
    const f = fixture();
    const calls: Array<readonly string[]> = [];
    const run: RunArchctxProcess = (_binary, args) => { calls.push(args); return ok(args[0] === 'doctor' ? doctorEnvelope() : recorded); };
    expect(completeArchitectureDebt(f.repoRoot, recorded.data.snapshot.headSha, { consumerRoot: f.consumerRoot, policy, run })).toEqual(recordedDebt);
    expect(calls).toEqual([['doctor', '--json'], ['complete', '--head-sha', recorded.data.snapshot.headSha, '--json']]);
  });

  test('an error envelope stays a typed ArchctxClientError', () => {
    const f = fixture();
    const run: RunArchctxProcess = (_binary, args) => args[0] === 'doctor' ? ok(doctorEnvelope()) : failed(errorEnvelope('complete', 'AC_UNCLASSIFIED_FAILURE', 'code facts unavailable', 'code-facts-unavailable'));
    let caught: unknown;
    try { completeArchitectureDebt(f.repoRoot, f.headSha, { consumerRoot: f.consumerRoot, policy, run }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ArchctxClientError);
    expect({ code: (caught as ArchctxClientError).code, action: (caught as ArchctxClientError).action, reasonCode: (caught as ArchctxClientError).reasonCode })
      .toEqual({ code: 'AC_UNCLASSIFIED_FAILURE', action: 'inspect-diagnostics', reasonCode: 'code-facts-unavailable' });
  });

  test('malformed, missing or unbound debt fails closed', () => {
    const f = fixture();
    const attempt = (envelope: unknown, sha = f.headSha): ArchctxClientError => {
      const run: RunArchctxProcess = (_binary, args) => ok(args[0] === 'doctor' ? doctorEnvelope() : envelope);
      try { completeArchitectureDebt(f.repoRoot, sha, { consumerRoot: f.consumerRoot, policy, run }); } catch (error) { return error as ArchctxClientError; }
      throw new Error('expected a failure');
    };
    const malformed = attempt(completeEnvelope(f.headSha, { ...clone(recordedDebt), coverage: 'complete' }));
    expect([malformed.code, malformed.reasonCode]).toEqual(['RH_ARCHCTX_DEBT_INVALID', 'architecture-debt-invalid']);
    const { debt: _debt, ...withoutDebt } = completeEnvelope(f.headSha, undefined).data;
    const missing = attempt({ ...clone(recorded), data: { ...withoutDebt, result: 'fail_action_required', actionsRequired: ['archctx validate'] } });
    expect([missing.code, missing.reasonCode, missing.details]).toEqual(['RH_ARCHCTX_DEBT_MISSING', 'architecture-debt-missing', { headSha: f.headSha, result: 'fail_action_required', actionsRequired: ['archctx validate'] }]);
    const otherCommit = attempt(completeEnvelope(f.baseSha, clone(recordedDebt)));
    expect([otherCommit.code, otherCommit.reasonCode]).toEqual(['RH_ARCHCTX_DEBT_INVALID', 'review-result-mismatch']);
  });

  test('a wrong pinned version or a disabled provider fails before any process call', () => {
    const f = fixture();
    const calls: Array<readonly string[]> = [];
    const run: RunArchctxProcess = (_binary, args) => { calls.push(args); return ok(recorded); };
    const manifest = join(f.consumerRoot, 'node_modules', 'archctx', 'package.json');
    const pinned = readFileSync(manifest, 'utf8');
    writeFileSync(manifest, JSON.stringify({ ...JSON.parse(pinned), version: '0.0.1' }));
    expect(() => completeArchitectureDebt(f.repoRoot, f.headSha, { consumerRoot: f.consumerRoot, policy, run })).toThrow(`expected archctx@${ARCHCTX_REQUIRED_VERSION}, got archctx@0.0.1`);
    writeFileSync(manifest, pinned);
    expect(() => completeArchitectureDebt(f.repoRoot, f.headSha, { consumerRoot: f.consumerRoot, policy: { ...policy, provider: 'disabled', applyMode: 'disabled' }, run }))
      .toThrow('architecture projection provider is disabled');
    expect(calls).toEqual([]);
  });

  test('doctor index-missing and unavailable use the same typed error without complete', () => {
    const f = fixture();
    const unavailable = { ...doctorEnvelope(), data: { codeFacts: { schemaVersion: 'archcontext.repository-code-facts/v1', state: 'unavailable', requiredVersion: '1.6.2', reasonCode: 'codegraph-unavailable', message: 'CodeGraph binary is unavailable' } } };
    for (const envelope of [doctorEnvelope('index-missing'), unavailable]) {
      const calls: Array<readonly string[]> = [];
      const run: RunArchctxProcess = (_binary, args) => { calls.push(args); return ok(envelope); };
      let caught: unknown;
      try { completeArchitectureDebt(f.repoRoot, f.headSha, { consumerRoot: f.consumerRoot, policy, run }); } catch (error) { caught = error; }
      expect(caught).toMatchObject({ code: 'RH_ARCHCTX_CODE_FACTS_NOT_READY', details: { state: envelope.data.codeFacts.state } });
      expect((caught as Error).message).toContain(envelope.data.codeFacts.state === 'index-missing' ? 'codegraph init -y .' : 'repo-harness update');
      expect((caught as Error).message).toContain(envelope.data.codeFacts.state === 'unavailable' ? 'codegraph-unavailable' : 'index-missing');
      if (envelope.data.codeFacts.state === 'unavailable') {
        expect((caught as ArchctxClientError).action).toBe('update-repo-harness');
        expect((caught as Error).message).toContain('CodeGraph binary is unavailable');
      }
      expect(calls).toEqual([['doctor', '--json']]);
    }
  });
});

describe('architecture-debt command', () => {
  const [flowItem, unownedItem] = recordedDebt.items as [ArchitectureDebtItemV1, ArchitectureDebtItemV1];
  const goneItem: ArchitectureDebtItemV1 = { ...clone(unownedItem), id: `debt.${'c'.repeat(64)}`, paths: ['src/gone.ts'] };

  test('without a base it reports only the HEAD debt', () => {
    const f = fixture();
    const provider = fakeProvider(f, { head: recordedDebt, base: recordedDebt });
    const output = architectureDebtReport(f.repoRoot, undefined, { consumerRoot: f.consumerRoot, policy, run: provider.run });
    expect(output).toEqual({ kind: 'repo-harness-architecture-debt', head: { sha: f.headSha, debt: recordedDebt }, base: null, introduced: null, resolvedIds: null });
    expect(provider.calls.map(({ tool, args, cwd }) => [tool, args[0], cwd])).toEqual([['archctx', 'doctor', f.repoRoot], ['archctx', 'complete', f.repoRoot]]);
    expect(architectureDebtSummary(output)).toContain('2 items, coverage partial');
  });

  test('with a base it reports debt new at HEAD and base ids gone at HEAD, then closes the base checkout', () => {
    const f = fixture();
    const base = withItems([flowItem, goneItem]);
    const provider = fakeProvider(f, { head: recordedDebt, base });
    const output = architectureDebtReport(f.repoRoot, 'HEAD~1', { consumerRoot: f.consumerRoot, policy, run: provider.run });
    expect(output.base).toEqual({ ref: 'HEAD~1', sha: f.baseSha, debtDigest: base.digest, coverage: base.coverage, coverageReasonCodes: base.coverageReasonCodes });
    expect(output.introduced).toEqual([unownedItem]);
    expect(output.resolvedIds).toEqual([goneItem.id]);
    const checkout = provider.baseCheckout()!;
    expect(provider.calls.filter((call) => call.cwd === checkout).map(({ tool, args }) => [tool, ...args])).toEqual([
      ['codegraph', 'init', '-y', '.'], ['archctx', 'doctor', '--json'], ['archctx', 'complete', '--head-sha', f.baseSha, '--json'],
    ]);
    // The R5 closeout helper stops only the daemon of the base checkout, by state directory.
    expect(provider.calls.filter((call) => call.args[0] === 'daemon').map(({ args }) => args)).toEqual([['daemon', 'list', '--json'], ['daemon', 'stop', '--state-dir', '/state/base', '--json']]);
    expect(existsSync(dirname(checkout))).toBe(false);
    expect(worktrees(f.repoRoot)).toEqual([f.repoRoot]);
    expect(architectureDebtSummary(output)).toContain('introduced 1, resolved 1');
  });

  test('a failed base run still stops and removes the base checkout', () => {
    const f = fixture();
    const provider = fakeProvider(f, { head: recordedDebt, base: failed(errorEnvelope('complete', 'AC_UNCLASSIFIED_FAILURE', 'base failed')) });
    expect(() => architectureDebtReport(f.repoRoot, f.baseSha, { consumerRoot: f.consumerRoot, policy, run: provider.run })).toThrow('AC_UNCLASSIFIED_FAILURE');
    const checkout = provider.baseCheckout()!;
    expect(provider.calls.some((call) => call.args[1] === 'stop' && call.args[3] === '/state/base')).toBe(true);
    expect(existsSync(dirname(checkout))).toBe(false);
    expect(worktrees(f.repoRoot)).toEqual([f.repoRoot]);
  });

  test('a daemon stop failure is reported after the checkout is removed', () => {
    const f = fixture();
    const provider = fakeProvider(f, { head: recordedDebt, base: recordedDebt }, 'fail');
    let caught: unknown;
    try { architectureDebtReport(f.repoRoot, 'HEAD~1', { consumerRoot: f.consumerRoot, policy, run: provider.run }); } catch (error) { caught = error; }
    expect((caught as ArchctxClientError).code).toBe('RH_ARCHITECTURE_DEBT_CLEANUP_FAILED');
    expect((caught as ArchctxClientError).message).toContain('archctx daemon stop /state/base: AC_RUNTIME_UNAVAILABLE');
    expect(existsSync(dirname(provider.baseCheckout()!))).toBe(false);
    expect(worktrees(f.repoRoot)).toEqual([f.repoRoot]);
  });

  test('cleanup removes only its own checkout and never prunes other registrations', () => {
    const f = fixture();
    const stale = join(dirname(f.repoRoot), 'stale-worktree');
    git(f.repoRoot, ['worktree', 'add', '--detach', stale, 'HEAD']);
    rmSync(stale, { recursive: true, force: true });
    const provider = fakeProvider(f, { head: recordedDebt, base: recordedDebt });
    architectureDebtReport(f.repoRoot, 'HEAD~1', { consumerRoot: f.consumerRoot, policy, run: provider.run });
    expect(existsSync(dirname(provider.baseCheckout()!))).toBe(false);
    const listed = worktrees(f.repoRoot);
    expect(listed).toContain(stale);
    expect(listed).not.toContain(provider.baseCheckout()!);
  });

  test('an unresolvable base fails before archctx runs', () => {
    const f = fixture();
    const provider = fakeProvider(f, { head: recordedDebt, base: recordedDebt });
    expect(() => architectureDebtReport(f.repoRoot, 'no-such-ref', { consumerRoot: f.consumerRoot, policy, run: provider.run })).toThrow('RH_ARCHITECTURE_DEBT_REF_UNRESOLVED');
    expect(provider.calls).toEqual([]);
  });
});
