import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, symlinkSync, renameSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { decodeRuntimeCaptureSnapshot, RUNTIME_CAPTURE_PROTOCOL, RUNTIME_CAPTURE_MAX_FRAME_BYTES, type RuntimeCaptureSnapshot } from '../../src/core/operator/runtime-capture';
import { CodexRuntimeDecoder, OscRuntimeDecoder, OSC7501_QUERY } from '../../src/core/operator/runtime-capture-decoders';
import { RuntimeCaptureWriter } from '../../src/effects/operator/runtime-capture-writer';
import { runRuntimeCapture } from '../../src/effects/operator/runtime-capture';

const roots: string[] = [];
function root(): string { const path = mkdtempSync(join(tmpdir(), 'runtime-capture-test-')); roots.push(path); return path; }
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
const time = '2026-10-09T00:00:00.000Z';
function snapshot(provider: 'codex' | 'claude' | 'pi' = 'codex'): RuntimeCaptureSnapshot { return { protocol: RUNTIME_CAPTURE_PROTOCOL, source_id: 'test-source', generation: '123e4567-e89b-42d3-a456-426614174000', sequence: 0, provider, format: provider === 'codex' ? 'codex-app-server' : 'osc7501', capture_status: 'connected', heartbeat_at: time, observations: [] }; }
function event(method: string, params: unknown, id?: number): Uint8Array { return Buffer.from(JSON.stringify({ method, params, ...(id === undefined ? {} : { id }) }) + '\n'); }
function osc(body: string, bel = false): string { return '\x1b]' + body + (bel ? '\x07' : '\x1b\\'); }
async function until(check: () => boolean): Promise<void> { const end = Date.now() + 5000; while (!check()) { if (Date.now() > end) throw new Error('fixture_timeout'); await Bun.sleep(10); } }

describe('closed capture schema', () => {
  test('rejects payloads, provider/format disagreement, invalid dates and scope identities', () => {
    const s = snapshot(); expect(decodeRuntimeCaptureSnapshot(s)).toEqual(s);
    for (const patch of [{ prompt: 'secret' }, { format: 'osc7501' }, { provider: 'unknown' }, { sequence: -1 }, { sequence: 1.5 }, { generation: 'not-a-uuid' }, { source_id: '/private/path' }, { heartbeat_at: '2026-02-30T00:00:00.000Z' }]) expect(() => decodeRuntimeCaptureSnapshot({ ...s, ...patch })).toThrow();
    const observation: RuntimeCaptureSnapshot['observations'][number] = { scope: 'session', session_id: 'thread-1', turn_id: null, state: 'idle', reason: 'unknown', event_received_at: time, changed_at: null };
    expect(decodeRuntimeCaptureSnapshot({ ...s, observations: [observation] }).observations).toEqual([observation]);
    for (const patch of [{ args: [] }, { state: 'clear' }, { session_id: null }, { session_id: '/secret/path' }, { reason: 'permission' }, { changed_at: 'not-a-time' }]) expect(() => decodeRuntimeCaptureSnapshot({ ...s, observations: [{ ...observation, ...patch }] })).toThrow();
    expect(() => decodeRuntimeCaptureSnapshot({ ...s, observations: Array(65).fill(observation) })).toThrow();
    expect(() => decodeRuntimeCaptureSnapshot({ ...s, observations: [observation, observation] })).toThrow();
    expect(() => decodeRuntimeCaptureSnapshot({ ...snapshot('pi'), observations: [observation] })).toThrow();
  });
});

describe('native event taps', () => {
  test('Codex fragmented notifications, timestamps, blocked request, completion and removal are whitelisted', () => {
    let observations: RuntimeCaptureSnapshot['observations'] = [], failures = 0;
    const decoder = new CodexRuntimeDecoder(v => observations = v, () => failures++);
    const started = event('thread/started', { thread: { id: 'thread-1', status: { type: 'idle' }, cwd: '/secret/path', preview: 'secret prompt' } });
    for (const byte of started) decoder.feed(Uint8Array.of(byte), time);
    expect(observations[0]).toEqual({ scope: 'session', session_id: 'thread-1', turn_id: null, state: 'idle', reason: 'unknown', event_received_at: time, changed_at: null });
    decoder.feed(event('turn/started', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'inProgress', startedAt: 100 } }), time);
    expect(observations[0]).toMatchObject({ turn_id: 'turn-1', state: 'working', changed_at: '1970-01-01T00:01:40.000Z' });
    decoder.feed(event('item/commandExecution/requestApproval', { threadId: 'thread-1', turnId: 'turn-1', startedAtMs: 1234, command: 'secret argument', reason: 'secret' }, 1), time);
    expect(observations[0]).toMatchObject({ state: 'blocked', reason: 'permission', changed_at: '1970-01-01T00:00:01.234Z' });
    decoder.feed(event('item/tool/requestUserInput', { threadId: 'thread-1', turnId: 'turn-1', isBlocking: false, questions: ['secret'] }, 2), time);
    expect(observations[0].reason).toBe('permission');
    decoder.feed(event('item/tool/requestUserInput', { threadId: 'thread-1', turnId: 'turn-1', isBlocking: true, questions: ['secret'] }, 3), time);
    expect(observations[0]).toMatchObject({ state: 'blocked', reason: 'question', changed_at: null });
    decoder.feed(event('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'interrupted', completedAt: null, items: ['secret output'] } }), time);
    expect(observations[0]).toMatchObject({ state: 'cancelled', changed_at: null });
    expect(JSON.stringify(observations)).not.toMatch(/secret|cwd|command|questions|items/);
    decoder.feed(event('thread/closed', { threadId: 'thread-1' }), time);
    expect(observations).toEqual([]); expect(failures).toBe(0);
  });
  test('unknown RPC and approval responses never imply progress; malformed/oversized input fails closed once', () => {
    let changes = 0, failures = 0;
    const d = new CodexRuntimeDecoder(() => changes++, () => failures++);
    d.feed(event('item/agentMessage/delta', { threadId: 'thread-1', delta: 'secret' }), time);
    d.feed(Buffer.from('{"id":1,"result":{"status":"done"}}\n'), time);
    expect(changes).toBe(0);
    d.feed(new Uint8Array(RUNTIME_CAPTURE_MAX_FRAME_BYTES + 1).fill(65), time);
    d.feed(event('thread/started', { thread: { id: 't', status: { type: 'idle' } } }), time);
    expect(failures).toBe(1); expect(changes).toBe(0);
    const d2 = new CodexRuntimeDecoder(() => changes++, () => failures++);
    d2.feed(Buffer.from('{"method":"thread/started"'), time); d2.end(); expect(failures).toBe(2);
  });
  test('activeFlags, errors and max session count are bounded', () => {
    let observations: RuntimeCaptureSnapshot['observations'] = [], failures = 0;
    const d = new CodexRuntimeDecoder(v => observations = v, () => failures++);
    d.feed(event('thread/status/changed', { threadId: 't', status: { type: 'active', activeFlags: ['waitingOnUserInput'] } }), time);
    expect(observations[0]).toMatchObject({ state: 'blocked', reason: 'question' });
    d.feed(event('error', { threadId: 't', turnId: 'turn', willRetry: true }), time);
    expect(observations[0].state).toBe('blocked');
    d.feed(event('error', { threadId: 't', turnId: 'turn', willRetry: false }), time); expect(observations[0].state).toBe('error');
    for (let i = 0; i < 64; i++) d.feed(event('thread/started', { thread: { id: `s${i}`, status: { type: 'idle' } } }), time);
    expect(failures).toBe(1);
  });
  test('OSC fixed fragmented query is consumed once; other bytes are exact', () => {
    let replies = 0;
    const d = new OscRuntimeDecoder(() => {}, () => replies++);
    const input = Buffer.concat([Buffer.from([0, 255, 128]), Buffer.from(OSC7501_QUERY), Buffer.from(osc('7501;?future')), Buffer.from(osc('0;title')), Buffer.from('\x1bP' + OSC7501_QUERY + '\x1b\\')]);
    const chunks: Uint8Array[] = [];
    for (const byte of input) chunks.push(d.feed(Uint8Array.of(byte), time));
    chunks.push(d.end(time));
    const expected = Buffer.concat([Buffer.from([0, 255, 128]), Buffer.from(osc('7501;?future')), Buffer.from(osc('0;title')), Buffer.from('\x1bP' + OSC7501_QUERY + '\x1b\\')]);
    expect(Buffer.concat(chunks)).toEqual(expected); expect(replies).toBe(1);
  });
  test('OSC root states, last-key wins, invalid child id, unknown kind, clear, RIS, prompt and EOF lifetime', () => {
    let observations: RuntimeCaptureSnapshot['observations'] = [];
    const d = new OscRuntimeDecoder(v => observations = v, () => {});
    const feed = (body: string) => d.feed(Buffer.from(osc('7501;' + body, true)), time);
    feed('state=blocked:kind=permission:state=idle'); expect(observations[0]).toMatchObject({ state: 'idle', reason: 'unknown', changed_at: null });
    feed('state=blocked:kind=auth'); expect(observations[0].reason).toBe('auth');
    feed('state=working:id=child'); expect(observations[0].state).toBe('blocked');
    feed('state=working:id=@invalid'); expect(observations[0].state).toBe('blocked');
    feed('state=blocked:kind=future'); expect(observations[0].reason).toBe('unknown');
    feed('state=future'); expect(observations[0].state).toBe('blocked');
    feed('state=done'); d.feed(Buffer.from(osc('133;A')), time); d.end(time); expect(observations[0].state).toBe('settled');
    d.feed(Buffer.from('\x1bc'), time); expect(observations).toEqual([]);
    feed('state=working'); d.feed(Buffer.from(osc('133;A')), time); expect(observations).toEqual([]);
    feed('state=blocked'); d.end(time); expect(observations).toEqual([]);
    feed('state=error'); d.end(time); expect(observations[0].state).toBe('error');
    feed('state=clear'); expect(observations).toEqual([]);
  });
  test('OSC discarded reports preserve bytes and cannot reset state; strings are opaque and bounded', () => {
    let observations: RuntimeCaptureSnapshot['observations'] = [];
    const d = new OscRuntimeDecoder(v => observations = v, () => { throw new Error('unexpected_reply'); });
    d.feed(Buffer.from(osc('7501;state=idle')), time);
    const frames = [osc('7501;state=working:msg=AA=='), osc('7501;state=working:msg=A'), osc('7501;state=working:title=' + 'YQ=='.repeat(70)), osc('7501;state=working:' + 'x'.repeat(5000)), '\x1bP' + osc('7501;state=working') + '\x1b\\', '\x1b_' + OSC7501_QUERY + '\x1b\\'];
    for (const frame of frames) {
      const actual = Buffer.concat([d.feed(Buffer.from(frame), time), d.end(time)]);
      expect(actual).toEqual(Buffer.from(frame)); expect(observations[0].state).toBe('idle');
    }
    expect(d.feed(Buffer.from('\x1b]75'), time).length).toBe(0); expect(Buffer.from(d.end(time)).toString()).toBe('\x1b]75');
  });
});

describe('snapshot writer ownership', () => {
  test('requires a new private path, refuses symlinks/shared directories, and atomically advances generation/sequence', () => {
    const path = join(root(), 'capture.json'); const s = snapshot(), writer = new RuntimeCaptureWriter(path, s);
    expect(lstatSync(path).mode & 0o777).toBe(0o600);
    writer.write({ ...s, sequence: 1 }); expect(JSON.parse(readFileSync(path, 'utf8')).sequence).toBe(1);
    expect(() => new RuntimeCaptureWriter(path, s)).toThrow();
    expect(() => writer.write({ ...s, sequence: 2, generation: '123e4567-e89b-42d3-a456-426614174001' })).toThrow();
    expect(JSON.parse(readFileSync(path, 'utf8')).sequence).toBe(1);
    const dir = root(); chmodSync(dir, 0o777);
    expect(() => new RuntimeCaptureWriter(join(dir, 'capture.json'), s)).toThrow(); expect(lstatSync(dir).mode & 0o777).toBe(0o777);
    const link = join(root(), 'link.json'); symlinkSync(path, link); expect(() => new RuntimeCaptureWriter(link, s)).toThrow();
  });
  test('replacement inode and changed same-generation content cannot be overwritten', () => {
    const dir = root(), path = join(dir, 'capture.json'), s = snapshot();
    const writer = new RuntimeCaptureWriter(path, s); const other = join(dir, 'other.json');
    writeFileSync(other, 'untouched', { mode: 0o600 }); renameSync(other, path);
    expect(() => writer.write({ ...s, sequence: 1 })).toThrow(); expect(readFileSync(path, 'utf8')).toBe('untouched');
    const path2 = join(dir, 'capture2.json'), writer2 = new RuntimeCaptureWriter(path2, s);
    writeFileSync(path2, JSON.stringify({ ...s, sequence: 99 }));
    expect(() => writer2.write({ ...s, sequence: 1 })).toThrow(); expect(JSON.parse(readFileSync(path2, 'utf8')).sequence).toBe(99);
  });
});

function collect(): { stream: Writable; chunks: Buffer[] } { const chunks: Buffer[] = []; return { chunks, stream: new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }) }; }

describe('owned child transport (fixtures do not attest provider support)', () => {
  test('Codex stdio preserves binary stdin/stdout and child exit even after tap failure', async () => {
    const dir = root(), path = join(dir, 'capture.json'), input = new PassThrough(), output = collect(), diagnostic = collect();
    const bytes = Buffer.from([0, 255, 128, 27, 10, 99]); input.end(bytes);
    const code = await runRuntimeCapture({ provider: 'codex', source_id: 'stdio', snapshot_path: path, argv: [process.execPath, '-e', 'const b=await Bun.stdin.arrayBuffer(); await Bun.write(Bun.stdout,b); process.exit(7)'] }, { input, output: output.stream, diagnostics: diagnostic.stream });
    expect(code).toBe(7); expect(Buffer.concat(output.chunks)).toEqual(bytes);
    expect(decodeRuntimeCaptureSnapshot(JSON.parse(readFileSync(path, 'utf8')))).toMatchObject({ capture_status: 'unavailable', observations: [] });
    expect(Buffer.concat(diagnostic.chunks).toString()).not.toMatch(/255|stdio|capture.json/);
  });
  test('CLI -- preserves argv and stderr independently; existing target does not spawn', async () => {
    const dir = root(), path = join(dir, 'cli.json');
    const p = Bun.spawn([process.execPath, 'src/cli/index.ts', 'operator', 'capture', '--provider', 'codex', '--source-id', 'cli', '--snapshot', path, '--', process.execPath, '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write("independent stderr");process.exit(9)', '--', '--secret-arg'], { cwd: process.cwd(), stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    expect(code).toBe(9); expect(stdout).toBe('["--secret-arg"]'); expect(stderr).toContain('independent stderr');
    const p2 = Bun.spawn([process.execPath, 'src/cli/index.ts', 'operator', 'capture', '--provider', 'codex', '--source-id', 'cli', '--snapshot', path, '--', process.execPath, '-e', 'console.log("should not spawn")'], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    expect(await new Response(p2.stdout).text()).toBe(''); expect(await p2.exited).toBe(1);
  });
  test('Codex snapshot failure keeps the child output and exposes no payload', async () => {
    const dir = root(), path = join(dir, 'capture.json'), input = new PassThrough(), output = collect(), diagnostic = collect();
    const script = 'console.log(JSON.stringify({method:"thread/started",params:{thread:{id:"t",status:{type:"idle"},preview:"secret"}}})); await Bun.sleep(100); console.log("original-output");';
    const run = runRuntimeCapture({ provider: 'codex', source_id: 'safe', snapshot_path: path, argv: [process.execPath, '-e', script] }, { input, output: output.stream, diagnostics: diagnostic.stream });
    writeFileSync(path, 'replacement cache');
    expect(await run).toBe(0); expect(Buffer.concat(output.chunks).toString()).toContain('original-output'); expect(readFileSync(path, 'utf8')).toBe('replacement cache');
    expect(Buffer.concat(diagnostic.chunks).toString()).toContain('runtime_capture_snapshot_unavailable'); input.destroy();
  });
  test('heartbeat advances capture clock without changing native event time', async () => {
    const path = join(root(), 'capture.json'), input = new PassThrough(), output = collect(), diagnostic = collect();
    const run = runRuntimeCapture({ provider: 'codex', source_id: 'clock', snapshot_path: path, argv: [process.execPath, '-e', 'console.log(JSON.stringify({method:"thread/started",params:{thread:{id:"t",status:{type:"idle"}}}}));await Bun.sleep(1300)'] }, { input, output: output.stream, diagnostics: diagnostic.stream });
    await until(() => JSON.parse(readFileSync(path, 'utf8')).observations.length === 1);
    const first = JSON.parse(readFileSync(path, 'utf8')); await until(() => JSON.parse(readFileSync(path, 'utf8')).sequence > first.sequence);
    const later = JSON.parse(readFileSync(path, 'utf8')); expect(later.heartbeat_at > first.heartbeat_at).toBe(true); expect(later.observations[0].event_received_at).toBe(first.observations[0].event_received_at);
    expect(await run).toBe(0); input.destroy();
  });
  test('PTY consumes query and returns one reply; handles fragmented reports and real child exit', async () => {
    const path = join(root(), 'capture.json'), input = new PassThrough(), output = collect(), diagnostic = collect();
    const script = 'process.stdin.setRawMode(true);process.stdout.write("\\x1b]7501;");await Bun.sleep(20);process.stdout.write("?\\x1b\\\\");let s="";for await(const b of process.stdin){s+=b.toString();if(s.includes("\\x1b]7501;?\\x1b\\\\")){process.stdout.write("reply-once\\x1b]7501;state=done\\x07");process.exit(11)}}';
    const code = await runRuntimeCapture({ provider: 'pi', source_id: 'pty', snapshot_path: path, argv: [process.execPath, '-e', script] }, { input, output: output.stream, diagnostics: diagnostic.stream });
    expect(code).toBe(11); const bytes = Buffer.concat(output.chunks).toString(); expect(bytes).not.toContain('7501;?'); expect(bytes).toContain('reply-once');
    expect(decodeRuntimeCaptureSnapshot(JSON.parse(readFileSync(path, 'utf8')))).toMatchObject({ capture_status: 'disconnected', observations: [{ state: 'settled', changed_at: null }] }); input.destroy();
  });
  test('PTY input EOF disconnects owner, sends no synthetic input and waits for actual signal exit', async () => {
    const path = join(root(), 'capture.json'), input = new PassThrough(), output = collect(), diagnostic = collect();
    const run = runRuntimeCapture({ provider: 'claude', source_id: 'eof', snapshot_path: path, argv: [process.execPath, '-e', 'process.stdin.setRawMode(true);console.log("ready");process.on("SIGTERM",()=>process.exit(23));for await(const b of process.stdin){console.log("unexpected-input")};await Bun.sleep(30000)'] }, { input, output: output.stream, diagnostics: diagnostic.stream });
    await until(() => Buffer.concat(output.chunks).toString().includes('ready')); input.end(); expect(await run).toBe(23);
    expect(Buffer.concat(output.chunks).toString()).not.toContain('unexpected-input'); expect(JSON.parse(readFileSync(path, 'utf8')).capture_status).toBe('disconnected');
  });
  test('PTY slow sink and burst preserve bytes under real backpressure', async () => {
    const path = join(root(), 'capture.json'), input = new PassThrough(), chunks: Buffer[] = [], diagnostic = collect();
    const slow = new Writable({ highWaterMark: 1024, write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); setTimeout(callback, 2); } });
    const run = runRuntimeCapture({ provider: 'pi', source_id: 'slow', snapshot_path: path, argv: [process.execPath, '-e', 'const b=Buffer.alloc(1024,65);for(let i=0;i<1000;i++){await new Promise(r=>process.stdout.write(b,r))}process.exit(0)'] }, { input, output: slow, diagnostics: diagnostic.stream });
    expect(await run).toBe(0); expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(1024 * 1000, 65)); expect(diagnostic.chunks).toHaveLength(0); input.destroy();
  });
  test('PTY EOF is not process exit; close descriptors then preserve actual later exit code', async () => {
    const path = join(root(), 'capture.json'), input = new PassThrough(), output = collect(), diagnostic = collect();
    const script = 'const fs=require("node:fs");process.stdout.write("before-eof");await Bun.sleep(30);fs.closeSync(0);fs.closeSync(1);fs.closeSync(2);await Bun.sleep(120);process.exit(37)';
    const run = runRuntimeCapture({ provider: 'pi', source_id: 'pty-eof', snapshot_path: path, argv: [process.execPath, '-e', script] }, { input, output: output.stream, diagnostics: diagnostic.stream });
    expect(await run).toBe(37); expect(Buffer.concat(output.chunks).toString()).toContain('before-eof');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ capture_status: 'disconnected', observations: [] }); input.destroy();
  });
  test('real outer PTY restores stdin raw mode after owned signal shutdown', async () => {
    const dir = root(), path = join(dir, 'capture.json'), scriptPath = join(dir, 'raw-proof.ts');
    const modulePath = join(process.cwd(), 'src/effects/operator/runtime-capture.ts');
    writeFileSync(scriptPath, `import { runRuntimeCapture } from ${JSON.stringify(modulePath)};
      const before = process.stdin.isRaw ?? false;
      const code = await runRuntimeCapture({provider:'pi',source_id:'raw',snapshot_path:${JSON.stringify(path)},argv:[process.execPath,'-e','process.on("SIGTERM",()=>process.exit(17));console.log("signal-ready");await Bun.sleep(30000)']});
      console.log(JSON.stringify({code,before,after:process.stdin.isRaw}));`);
    const chunks: Buffer[] = [];
    const p = Bun.spawn([process.execPath, scriptPath], { terminal: { data(_term, bytes) { chunks.push(Buffer.from(bytes)); } } });
    try {
      await until(() => Buffer.concat(chunks).toString().includes('signal-ready'));
      process.kill(p.pid, 'SIGTERM'); expect(await p.exited).toBe(0);
      expect(Buffer.concat(chunks).toString()).toContain('{"code":17,"before":false,"after":false}');
    } finally { if (p.exitCode === null) process.kill(p.pid, 'SIGKILL'); p.terminal?.close(); }
  });
  test('PTY feeds bounded real stdin chunks after each drain without duplicate bytes', async () => {
    const path = join(root(), 'capture.json'), input = new PassThrough(), output = collect(), diagnostic = collect();
    const total = 256 * 1024;
    const script = 'process.stdin.setRawMode(true);process.stdout.write("input-ready");let n=0;for await(const b of process.stdin){for(const c of b){if(c!==65)process.exit(41)}n+=b.length;if(n===262144){process.stdout.write("input-exact");process.exit(0)}if(n>262144)process.exit(42)}';
    const run = runRuntimeCapture({ provider: 'pi', source_id: 'input', snapshot_path: path, argv: [process.execPath, '-e', script] }, { input, output: output.stream, diagnostics: diagnostic.stream });
    await until(() => Buffer.concat(output.chunks).toString().includes('input-ready'));
    // An actual readable yields bounded chunks. It waits for producer drain between writes.
    for (let offset = 0; offset < total; offset += 8192) {
      if (!input.write(Buffer.alloc(8192, 65))) await new Promise<void>(resolve => input.once('drain', resolve));
    }
    expect(await run).toBe(0); expect(Buffer.concat(output.chunks).toString()).toContain('input-exact'); input.destroy();
  });
  test('a failed outer sink closes only its owned child and restores capture handles', async () => {
    const path = join(root(), 'capture.json'), input = new PassThrough(), diagnostic = collect();
    const output = new Writable({ write(_chunk, _encoding, callback) { callback(new Error('controlled_sink_failure')); } });
    const listeners = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
    const run = runRuntimeCapture({ provider: 'pi', source_id: 'sink', snapshot_path: path, argv: [process.execPath, '-e', 'console.log("sink-trigger");await Bun.sleep(30000)'] }, { input, output, diagnostics: diagnostic.stream });
    await expect(run).rejects.toThrow('runtime_capture_transport_unavailable');
    expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(listeners);
    expect(input.listenerCount('data')).toBe(0); expect(JSON.parse(readFileSync(path, 'utf8')).capture_status).toBe('disconnected'); input.destroy();
  });

  test('a signal bounds shutdown when an outer sink never drains', async () => {
    const dir = root(), path = join(dir, 'capture.json'), scriptPath = join(dir, 'stalled-proof.ts');
    const modulePath = join(process.cwd(), 'src/effects/operator/runtime-capture.ts');
    writeFileSync(scriptPath, `import { Writable } from 'node:stream';
      import { runRuntimeCapture } from ${JSON.stringify(modulePath)};
      const sink = new Writable({highWaterMark:1,write(){console.log('sink-stalled')}});
      try { await runRuntimeCapture({provider:'pi',source_id:'stalled',snapshot_path:${JSON.stringify(path)},argv:[process.execPath,'-e','console.log("child-output");await Bun.sleep(30000)']},{input:process.stdin,output:sink,diagnostics:process.stderr});process.exit(44) }
      catch { console.log('bounded-shutdown') }`);
    const p = Bun.spawn([process.execPath, scriptPath], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    const reader = p.stdout.getReader(), chunks: Buffer[] = [];
    const reading = (async () => { for (;;) { const next = await reader.read(); if (next.done) break; chunks.push(Buffer.from(next.value)); } })();
    try {
      await until(() => Buffer.concat(chunks).toString().includes('sink-stalled'));
      const start = Date.now(); process.kill(p.pid, 'SIGTERM');
      expect(await p.exited).toBe(0); expect(Date.now() - start).toBeLessThan(4000); await reading;
      expect(Buffer.concat(chunks).toString()).toContain('bounded-shutdown');
      expect(JSON.parse(readFileSync(path, 'utf8')).capture_status).toBe('disconnected');
    } finally { if (p.exitCode === null) process.kill(p.pid, 'SIGKILL'); p.stdin.end(); reader.releaseLock(); }
  });

});
