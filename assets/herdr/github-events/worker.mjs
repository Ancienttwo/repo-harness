// GitHub App webhook receiver. It filters GitHub events in code and sends a short bot event
// to the Bot routine webhook. It never calls a GitHub API and makes no decision.
// `repo-harness events install` stages this directory and ../webhook-notify/bot-event.mjs in the same
// layout, and wrangler bundles them.
import { botEvent } from '../webhook-notify/bot-event.mjs';
import { classify } from './filter.mjs';

const DEBOUNCE_SECONDS = 60;
const DELIVERY_TTL_SECONDS = 7 * 24 * 60 * 60;
const MARK_TTL_SECONDS = 24 * 60 * 60;
const MAX_BODY_BYTES = 1024 * 1024;
const SEND_TIMEOUT_MS = 5_000;
const DELIVERY_PATTERN = /^[\w-]{1,128}$/;
const encoder = new TextEncoder();

function hexBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function signatureValid(secret, header, body) {
  const match = /^sha256=([0-9a-f]{64})$/.exec(header ?? '');
  if (!match) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, hexBytes(match[1]), body);
}

async function sendToBot(env, event) {
  const response = await fetch(env.BOT_WEBHOOK_URL, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.BOT_WEBHOOK_KEY}`, 'x-webhook-key': env.BOT_WEBHOOK_KEY },
    body: JSON.stringify(event),
  });
  if (!response.ok) throw new Error(`Bot webhook returned HTTP ${response.status}.`);
}

// KV is eventually consistent between locations. A stale read can repeat an event; it never drops one.
const wasSent = async (env, delivery) => await env.EVENTS_STATE.get(`delivery:${delivery}`) !== null;

async function deliver(env, { delivery, event, debounce, at }) {
  if (await wasSent(env, delivery)) return 'duplicate';
  if (debounce && Number(await env.EVENTS_STATE.get(debounce)) > at) return 'superseded';
  await sendToBot(env, event);
  await env.EVENTS_STATE.put(`delivery:${delivery}`, '1', { expirationTtl: DELIVERY_TTL_SECONDS });
  return 'sent';
}

const reply = (status, text) => new Response(text, { status });

export default {
  async fetch(request, env) {
    if (!env.GITHUB_WEBHOOK_SECRET || !env.BOT_WEBHOOK_URL || !env.BOT_WEBHOOK_KEY || !env.ORCHESTRATOR_LOGIN) return reply(500, 'Worker config is missing.');
    if (request.method !== 'POST') return reply(405, 'POST only.');
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return reply(413, 'Payload is too large.');
    if (!await signatureValid(env.GITHUB_WEBHOOK_SECRET, request.headers.get('x-hub-signature-256'), body)) return reply(401, 'Invalid signature.');
    const delivery = request.headers.get('x-github-delivery') ?? '';
    const name = request.headers.get('x-github-event') ?? '';
    if (!DELIVERY_PATTERN.test(delivery) || !name) return reply(400, 'Missing GitHub delivery headers.');
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(body)); } catch { return reply(400, 'Invalid JSON.'); }
    const match = classify(name, payload, env.ORCHESTRATOR_LOGIN);
    if (!match) return reply(204, null);
    const at = Date.now();
    const event = botEvent({ source: 'github', repository: payload.repository.name, kind: match.kind, ts: new Date(at).toISOString(), data: match.data });
    if (match.debounce) {
      if (await wasSent(env, delivery)) return reply(200, 'duplicate');
      // Each push moves the PR mark forward. The queued copy sends only when no later push arrived.
      await env.EVENTS_STATE.put(match.debounce, String(at), { expirationTtl: MARK_TTL_SECONDS });
      await env.EVENTS_QUEUE.send({ delivery, at, event, debounce: match.debounce }, { delaySeconds: DEBOUNCE_SECONDS });
      return reply(202, 'queued');
    }
    try {
      return reply(200, await deliver(env, { delivery, at, event }));
    } catch {
      // GitHub records the failed delivery for a redelivery, and the queue retries it now.
      await env.EVENTS_QUEUE.send({ delivery, at, event });
      return reply(502, 'Bot delivery failed.');
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try { await deliver(env, message.body); message.ack(); }
      catch { message.retry(); }
    }
  },
};
