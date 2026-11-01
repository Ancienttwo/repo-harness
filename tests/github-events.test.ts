// The shipped GitHub events Worker and `repo-harness events install`. Fixtures replace only
// external I/O: the Bot webhook, Cloudflare KV and Queue bindings, `wrangler` and the GitHub API.
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createHash, createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installEvents } from '../src/cli/commands/events';

const ROOT = join(import.meta.dir, '..');
const { default: worker } = await import(join(ROOT, 'assets/herdr/github-events/worker.mjs'));
const { PROTOCOL_HEADERS } = await import(join(ROOT, 'assets/herdr/github-events/filter.mjs'));
const { assertBotEvent } = await import(join(ROOT, 'assets/herdr/webhook-notify/bot-event.mjs'));
const SECRET = 'fixture-webhook-secret';
const repository = { id: 7, name: 'repo-harness', default_branch: 'main' };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function workerFixture(botStatus = 200) {
  const state = new Map<string, string>();
  const queued: { body: any; options?: { delaySeconds?: number } }[] = [];
  const sent: any[] = [];
  const fixture = { state, queued, sent, botStatus };
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    expect(url).toBe('https://bot.example/routine');
    expect(new Headers(init.headers).get('x-webhook-key')).toBe('bot-key');
    if (fixture.botStatus === 200) sent.push(JSON.parse(String(init.body)));
    return new Response('', { status: fixture.botStatus });
  }) as typeof fetch;
  const env = {
    GITHUB_WEBHOOK_SECRET: SECRET, BOT_WEBHOOK_URL: 'https://bot.example/routine', BOT_WEBHOOK_KEY: 'bot-key', ORCHESTRATOR_LOGIN: 'coord-bot',
    EVENTS_STATE: { get: async (key: string) => state.get(key) ?? null, put: async (key: string, value: string) => { state.set(key, value); } },
    EVENTS_QUEUE: { send: async (body: unknown, options?: { delaySeconds?: number }) => { queued.push({ body: structuredClone(body), options }); } },
  };
  const post = async (event: string, delivery: string, payload: object, secret = SECRET) => {
    const body = JSON.stringify({ repository, ...payload });
    const response = await worker.fetch(new Request('https://events.example/', { method: 'POST', body, headers: {
      'x-github-event': event, 'x-github-delivery': delivery,
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` } }), env);
    return { status: response.status, text: await response.text() };
  };
  const drainQueue = async () => {
    const acks: string[] = [];
    const messages = queued.splice(0).map(({ body }) => ({ body, ack: () => acks.push('ack'), retry: () => acks.push('retry') }));
    await worker.queue({ messages }, env);
    return acks;
  };
  return { ...fixture, fixture, env, post, drainQueue };
}

const comment = (login: string, body: string) => ({ action: 'created', sender: { login }, issue: { number: 1283 },
  comment: { body, html_url: 'https://github.com/o/r/issues/1283#c1' } });
const checkRun = (action: string, name: string, conclusion: string | null) => ({ action,
  check_run: { name, conclusion, head_sha: 'abc123', html_url: 'https://github.com/o/r/runs/9', pull_requests: [{ number: 1341 }] } });
const push = (sha: string) => ({ action: 'synchronize', pull_request: { number: 5, html_url: 'https://github.com/o/r/pull/5', head: { sha } } });

describe('GitHub events Worker', () => {
  test('a request with a wrong signature is rejected and sends nothing', async () => {
    const run = workerFixture();
    expect(await run.post('issue_comment', 'd-1', comment('worker-a', 'repo-harness issue claim status'), 'other-secret')).toEqual({ status: 401, text: 'Invalid signature.' });
    expect(run.sent).toEqual([]);
    expect(run.queued).toEqual([]);
  });

  test('a repeated X-GitHub-Delivery sends once', async () => {
    const run = workerFixture();
    const payload = comment('worker-a', 'repo-harness issue claim status\nStatus: ready for review');
    expect((await run.post('issue_comment', 'd-1', payload)).text).toBe('sent');
    expect((await run.post('issue_comment', 'd-1', payload)).text).toBe('duplicate');
    expect(run.sent).toHaveLength(1);
  });

  test('a protocol comment from the orchestrator login is dropped; the same comment from a worker is sent', async () => {
    const run = workerFixture();
    expect((await run.post('issue_comment', 'd-1', comment('coord-bot', 'repo-harness decision\nDecision: x'))).status).toBe(204);
    expect(run.sent).toEqual([]);
    await run.post('issue_comment', 'd-2', comment('worker-a', 'repo-harness decision\nDecision: x'));
    expect(run.sent.map((event) => [event.kind, event.data.header])).toEqual([['issue.comment', 'repo-harness decision']]);
  });

  test('one Required / CI run sends one event with its final conclusion and head SHA', async () => {
    const run = workerFixture();
    expect((await run.post('check_run', 'd-1', checkRun('created', 'Required / CI', null))).status).toBe(204);
    expect((await run.post('check_run', 'd-2', checkRun('completed', 'Affected tests (shard 1/3)', 'failure'))).status).toBe(204);
    expect((await run.post('check_run', 'd-3', checkRun('completed', 'Required / CI', 'failure'))).status).toBe(200);
    expect(run.sent.map((event) => [event.kind, event.data])).toEqual([['ci.pr',
      { pull_requests: [1341], url: 'https://github.com/o/r/runs/9', head_sha: 'abc123', conclusion: 'failure' }]]);
  });

  test('the Worker sends the shared bot event envelope and refuses a payload the envelope schema rejects', async () => {
    const run = workerFixture();
    await run.post('issues', 'd-1', { action: 'opened', issue: { number: 9, title: '[CI repair] x', html_url: 'https://github.com/o/r/issues/9' } });
    expect(assertBotEvent(run.sent[0])).toMatchObject({ source: 'github', repository: 'repo-harness', kind: 'issue.ci_repair' });
    const invalid = { action: 'opened', repository: { ...repository, name: 'not/a/name' }, issue: { number: 10, title: 'x', html_url: 'u' } };
    await expect(run.post('issues', 'd-2', invalid)).rejects.toThrow('invalid bot event: repository');
    expect(run.sent).toHaveLength(1);
  });

  test('a failed Bot delivery returns 502 and the queue retries it once', async () => {
    const run = workerFixture(503);
    const payload = comment('worker-a', 'repo-harness boundary question');
    expect((await run.post('issue_comment', 'd-1', payload)).status).toBe(502);
    expect(run.queued).toHaveLength(1);
    run.fixture.botStatus = 200;
    expect(await run.drainQueue()).toEqual(['ack']);
    expect((await run.post('issue_comment', 'd-1', payload)).text).toBe('duplicate');
    expect(run.sent).toHaveLength(1);
  });

  test('pushes to one PR within the debounce window send one event for the last push', async () => {
    const run = workerFixture();
    expect((await run.post('pull_request', 'd-1', push('s1'))).status).toBe(202);
    await Bun.sleep(2);
    expect((await run.post('pull_request', 'd-2', push('s2'))).status).toBe(202);
    expect(run.queued.map(({ options }) => options?.delaySeconds)).toEqual([60, 60]);
    expect(await run.drainQueue()).toEqual(['ack', 'ack']);
    expect(run.sent.map((event) => [event.kind, event.data.head_sha])).toEqual([['pr.pushed', 's2']]);
  });

  test('comments without a protocol header are dropped; the header list matches templates.md', async () => {
    const run = workerFixture();
    expect((await run.post('issue_comment', 'd-1', comment('worker-a', 'Looks good to me.'))).status).toBe(204);
    expect(run.sent).toEqual([]);
    const templates = readFileSync(join(ROOT, 'assets/skills/repo-harness-issue-flow/references/templates.md'), 'utf8');
    const headers = [...templates.matchAll(/^```text\n(repo-harness [a-z ]+)\n/gm)].map((match) => match[1]);
    expect([...new Set(headers)].sort()).toEqual([...PROTOCOL_HEADERS].sort());
  });
});

const APP_EVENTS = ['check_run', 'issue_comment', 'issues', 'pull_request', 'pull_request_review', 'pull_request_review_comment', 'workflow_run'];

function installFixture(appEvents = APP_EVENTS) {
  const root = mkdtempSync(join(tmpdir(), 'rh-events-install-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const calls = join(root, 'wrangler.jsonl');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyFile = join(root, 'app.pem');
  writeFileSync(keyFile, privateKey.export({ type: 'pkcs1', format: 'pem' }), { mode: 0o600 });
  // The deploy entry matches wrangler 4.74 `writeOutput` (WRANGLER_OUTPUT_FILE_PATH).
  writeFileSync(join(bin, 'wrangler'), `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const files = Object.fromEntries([...readdirSync('.'), '../webhook-notify/bot-event.mjs'].map((name) => [name, createHash('sha256').update(readFileSync(name)).digest('hex')]));
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ args, cwd: process.cwd(), files, bot_key_in_env: 'WEBHOOK_KEY' in process.env,
  secrets: args[0] === 'deploy' ? JSON.parse(readFileSync('secrets.json', 'utf8')) : null }) + '\\n');
if (args[1] === 'info') process.exit(existsSync(process.env.FIXTURE_QUEUE) ? 0 : 1);
if (args[1] === 'create') appendFileSync(process.env.FIXTURE_QUEUE, 'created');
if (args[0] === 'deploy') appendFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: 'deploy', version: 1, worker_name: 'repo-harness-github-events',
  worker_tag: 't', version_id: 'v', targets: ['https://repo-harness-github-events.fixture.workers.dev'], timestamp: new Date().toISOString() }) + '\\n');
`);
  chmodSync(join(bin, 'wrangler'), 0o755);
  const api: { method: string; path: string; authorization: string; body: any }[] = [];
  const fetchFake = (async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.github.com', '');
    api.push({ method: init.method!, path, authorization: new Headers(init.headers).get('authorization')!, body: init.body ? JSON.parse(String(init.body)) : null });
    const reply = path === '/app' ? { slug: 'rh-events', events: appEvents } : path.startsWith('/app/installations') ? [{ account: { login: 'Ancienttwo' } }] : {};
    return Response.json(reply);
  }) as typeof fetch;
  const asked: string[] = [];
  const deps = (answer: string) => ({ fetch: fetchFake, now: Date.now,
    env: { PATH: `${bin}:${process.env.PATH}`, FIXTURE_CALLS: calls, FIXTURE_QUEUE: join(root, 'queue'), WEBHOOK_KEY: 'bot-key' },
    ask: async (question: string) => { asked.push(question); return answer; } });
  const options = { webhookUrl: 'https://bot.example/routine', appId: '123', privateKey: keyFile, orchestratorLogin: 'coord-bot' };
  const wranglerCalls = () => existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [];
  return { root, publicKey, api, asked, deps, options, wranglerCalls, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('repo-harness events install', () => {
  test('it lists the three approval points, asks once, and changes nothing on no', async () => {
    const fixture = installFixture();
    const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(installEvents(fixture.options, fixture.deps('n'))).rejects.toThrow('Installation canceled. No change was made.');
      const listed = stderr.mock.calls.map(([text]) => String(text)).join('');
      for (const point of ['1. Deploy Worker repo-harness-github-events', '2. Write the Worker secrets', '3. Point the webhook of GitHub App rh-events']) expect(listed).toContain(point);
      expect(fixture.asked.filter((question) => question.startsWith('Run these three steps'))).toHaveLength(1);
      expect(fixture.wranglerCalls()).toEqual([]);
      expect(fixture.api.map(({ method, path }) => `${method} ${path}`)).toEqual(['GET /app']);
    } finally { stderr.mockRestore(); fixture.cleanup(); }
  });

  test('an App without a required event subscription stops before any change', async () => {
    const fixture = installFixture(APP_EVENTS.filter((event) => event !== 'workflow_run'));
    try {
      await expect(installEvents({ ...fixture.options, nonInteractive: true, yes: true }, fixture.deps('y')))
        .rejects.toThrow('GitHub App rh-events does not subscribe to: workflow_run. Add them in the App settings. No change was made.');
      expect(fixture.wranglerCalls()).toEqual([]);
      expect(fixture.api).toHaveLength(1);
    } finally { fixture.cleanup(); }
  });

  test('an approved run deploys the shipped Worker with new secrets, points the App at it, and a repeat run replaces the config', async () => {
    const fixture = installFixture();
    const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const options = { ...fixture.options, nonInteractive: true, yes: true };
      await installEvents(options, fixture.deps(''));
      await installEvents(options, fixture.deps(''));
      const calls = fixture.wranglerCalls();
      expect(calls.map(({ args }) => args.slice(0, 2).join(' '))).toEqual(['queues info', 'queues create', 'deploy --config', 'queues info', 'deploy --config']);
      const deploys = calls.filter(({ args }) => args[0] === 'deploy');
      const hash = (path: string) => createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex');
      for (const deploy of deploys) {
        expect(deploy.args).toEqual(['deploy', '--config', 'wrangler.json', '--secrets-file', 'secrets.json', '--var', 'ORCHESTRATOR_LOGIN:coord-bot']);
        expect(deploy.files).toMatchObject({ 'worker.mjs': hash('assets/herdr/github-events/worker.mjs'), 'filter.mjs': hash('assets/herdr/github-events/filter.mjs'),
          'wrangler.json': hash('assets/herdr/github-events/wrangler.json'), '../webhook-notify/bot-event.mjs': hash('assets/herdr/webhook-notify/bot-event.mjs') });
        expect(deploy.secrets).toMatchObject({ BOT_WEBHOOK_URL: 'https://bot.example/routine', BOT_WEBHOOK_KEY: 'bot-key' });
        expect(deploy.secrets.GITHUB_WEBHOOK_SECRET).toMatch(/^[0-9a-f]{64}$/);
        expect(deploy.bot_key_in_env).toBe(false);
        expect(existsSync(deploy.cwd)).toBe(false);
      }
      expect(deploys[0].secrets.GITHUB_WEBHOOK_SECRET).not.toBe(deploys[1].secrets.GITHUB_WEBHOOK_SECRET);
      const hooks = fixture.api.filter(({ method }) => method === 'PATCH');
      expect(hooks.map(({ path, body }) => [path, body])).toEqual(deploys.map(({ secrets }) => ['/app/hook/config',
        { url: 'https://repo-harness-github-events.fixture.workers.dev', content_type: 'json', secret: secrets.GITHUB_WEBHOOK_SECRET, insecure_ssl: '0' }]));
      const [header, claims, signature] = hooks[0].authorization.replace('Bearer ', '').split('.');
      expect(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), fixture.publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
      expect(JSON.parse(Buffer.from(claims, 'base64url').toString()).iss).toBe(123);
      expect(stdout.mock.calls.map(([text]) => String(text)).join('')).toContain('Installations: Ancienttwo.');
    } finally { stdout.mockRestore(); stderr.mockRestore(); fixture.cleanup(); }
  });
});
