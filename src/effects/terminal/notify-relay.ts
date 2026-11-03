// The notify relay: a long-lived repo-harness process in a labeled hc terminal. It follows
// `hc events --json --label repo-harness.notify=on` (RH_NOTIFY_LABELS) and sends one bot event per blocked or
// done turn to the Bot webhook and the selected human channels.

import { hostname } from 'node:os';
import { NOTIFY_CHANNEL_SECRET_KEYS } from '../../core/decision/notify-secret-keys';
import { NAME_PATTERN, botEvent } from '../../../assets/herdr/github-events/bot-event.mjs';
import {
  EMPTY_RELAY_DELIVERIES,
  NOTIFY_INSTALL_COMMAND,
  NOTIFY_CHANNELS,
  type NotifyChannel,
  type RelayAttemptV1,
  type RelayDeliveriesV1,
} from '../../core/operator/notify-status';
import { RH_LABEL, RH_NOTIFY_LABELS, hcEvents, type HcEventStream, type HcLabels, type HcStreamItem } from './herdr-core';
import { writePrivateFile } from './herdr-notify-install';
import { NOTIFY_DONE_KEYS, NotifyConfigError, notifyDeliveriesPath, readNotifyConfig, readRelayDeliveries, type NotifyConfig } from './notify-read';

const TIMEOUT_MS = 5_000;
const ID_PATTERN = /^[\w.:@/-]{1,128}$/;
const CHANNEL_NAMES: Readonly<Record<NotifyChannel, string>> = { webhook: 'WEBHOOK', slack: 'SLACK', discord: 'DISCORD', telegram: 'TELEGRAM' };

/** The one serializer of the config file; install writes it and the relay reads it per event. */
export function renderNotifyConfig(config: NotifyConfig): string {
  return [...NOTIFY_CHANNEL_SECRET_KEYS, ...NOTIFY_DONE_KEYS].map(key => `${key}='${config[key]}'`).join('\n') + '\n';
}

interface TerminalFacts {
  readonly name: string | null;
  readonly labels: HcLabels;
  readonly app: string | null;
  readonly kind: string | null;
}

interface Target {
  readonly channel: NotifyChannel;
  readonly url: string;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

const label = (labels: HcLabels, key: string, pattern: RegExp): string | undefined => {
  const value = labels[key];
  return value !== undefined && pattern.test(value) ? value : undefined;
};

function targets(config: NotifyConfig, state: 'blocked' | 'done', envelope: unknown, text: string): Target[] {
  const all: (Target | null)[] = [
    { channel: 'webhook', url: config.WEBHOOK_URL!, body: envelope,
      headers: { authorization: `Bearer ${config.WEBHOOK_KEY}`, 'x-webhook-key': config.WEBHOOK_KEY } },
    config.SLACK_WEBHOOK_URL ? { channel: 'slack', url: config.SLACK_WEBHOOK_URL,
      body: { text: text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') } } : null,
    config.DISCORD_WEBHOOK_URL ? { channel: 'discord', url: config.DISCORD_WEBHOOK_URL,
      body: { content: text.slice(0, 2000), allowed_mentions: { parse: [] } } } : null,
    config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID ? { channel: 'telegram', url: `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
      body: { chat_id: config.TELEGRAM_CHAT_ID, text: text.slice(0, 4096) } } : null,
  ];
  return all.filter((target): target is Target => target !== null
    && (state === 'blocked' || config[`${CHANNEL_NAMES[target.channel]}_NOTIFY_DONE` as typeof NOTIFY_DONE_KEYS[number]] === '1'));
}

export interface NotifyRelayDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly send?: typeof fetch;
  readonly now?: () => number;
  readonly host?: string;
  /** One line per attempt, for the relay terminal's screen. Never carries a config value. */
  readonly log?: (line: string) => void;
}

/**
 * The relay state machine over hc stream items. `handle` queues the item; `settled` resolves
 * when every queued item has been processed, so delivery-record writes never interleave.
 */
export function createNotifyRelay(deps: NotifyRelayDeps): { readonly handle: (item: HcStreamItem) => void; readonly settled: () => Promise<void> } {
  const send = deps.send ?? fetch;
  const now = deps.now ?? Date.now;
  const host = deps.host ?? hostname();
  const log = deps.log ?? ((line: string) => process.stderr.write(`[notify-relay] ${line}\n`));
  const terminals = new Map<string, TerminalFacts>();
  // Per terminal: the `<turn>:<state>:<channel>` keys that succeeded. A turn is sent at most once per
  // channel; a new hc turn is a new notice at once.
  const sent = new Map<string, Set<string>>();
  let queue = Promise.resolve();

  const remember = (address: string, raw: { readonly name?: unknown; readonly labels?: unknown; readonly status?: unknown }) => {
    const status = raw.status as { readonly app?: unknown; readonly kind?: unknown } | null | undefined;
    terminals.set(address, {
      name: typeof raw.name === 'string' ? raw.name : null,
      labels: typeof raw.labels === 'object' && raw.labels !== null ? raw.labels as HcLabels : {},
      app: typeof status?.app === 'string' ? status.app : null,
      kind: typeof status?.kind === 'string' ? status.kind : null,
    });
  };

  const deliver = async (address: string, turn: number, state: 'blocked' | 'done') => {
    let config;
    try { config = readNotifyConfig(deps.env); }
    catch (error) {
      log(error instanceof NotifyConfigError ? `The notify config is invalid: ${error.message} Run: ${NOTIFY_INSTALL_COMMAND}` : 'Cannot read the notify config.');
      return;
    }
    if (config === null) { log(`No notify config. Run: ${NOTIFY_INSTALL_COMMAND}`); return; }
    const facts = terminals.get(address) ?? { name: null, labels: {}, app: null, kind: null };
    const at = now();
    const task = label(facts.labels, RH_LABEL.task, ID_PATTERN);
    const request = label(facts.labels, RH_LABEL.request, ID_PATTERN);
    const repository = label(facts.labels, RH_LABEL.repository, NAME_PATTERN) ?? null;
    const data = {
      host, terminal: address, name: facts.name, agent: facts.app, blocked_kind: state === 'blocked' ? facts.kind : null,
      ...(task ? { task } : {}), ...(request ? { request_id: request } : {}),
    };
    const envelope = botEvent({ source: 'herdr', repository, kind: `agent.${state}`, ts: new Date(at).toISOString(), data });
    const trace = [repository && `repo ${repository}`, task && `task ${task}`, request && `request ${request}`].filter(Boolean).join(' · ');
    const text = `hc ${state}: ${facts.app ?? 'agent'} @ ${facts.name ?? address}\nterminal ${address} · ${host}` + (trace ? `\n${trace}` : '');
    const done = sent.get(address) ?? new Set<string>();
    sent.set(address, done);
    const results: Partial<Record<NotifyChannel, RelayAttemptV1>> = {};
    // Channels are independent: one failure or exception never skips or hides another channel.
    await Promise.all(targets(config, state, envelope, text).map(async target => {
      const key = `${turn}:${state}:${target.channel}`;
      if (done.has(key)) return;
      let ok = false;
      try {
        const response = await send(target.url, {
          method: 'POST', headers: { 'content-type': 'application/json', ...target.headers },
          body: JSON.stringify(target.body), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error',
        });
        ok = response.ok;
        // Telegram can refuse a message inside an HTTP 200.
        if (ok && target.channel === 'telegram') ok = (await response.json() as { ok?: unknown }).ok === true;
        log(`${CHANNEL_NAMES[target.channel]}: HTTP ${response.status}${response.ok && !ok ? ' app-failed' : ''}`);
      } catch { log(`${CHANNEL_NAMES[target.channel]}: delivery failed.`); }
      if (ok) done.add(key);
      results[target.channel] = { at: new Date(at).toISOString(), result: ok ? 'succeeded' : 'failed' };
    }));
    const attempts = Object.values(results);
    if (!attempts.length) return;
    let saved;
    try { saved = readRelayDeliveries(deps.env); }
    catch { saved = EMPTY_RELAY_DELIVERIES; log('The delivery record was unreadable. It is replaced.'); }
    const next: RelayDeliveriesV1 = {
      ...saved,
      last: { at: new Date(at).toISOString(), result: attempts.every(item => item.result === 'succeeded') ? 'succeeded' : 'failed' },
      channels: Object.fromEntries(NOTIFY_CHANNELS.map(channel => [channel, results[channel] ?? saved.channels[channel]])) as RelayDeliveriesV1['channels'],
    };
    try { writePrivateFile(notifyDeliveriesPath(deps.env), `${JSON.stringify(next)}\n`); }
    catch { log('Cannot write the delivery record.'); }
  };

  // Events at or below the newest snapshot seq are already in that snapshot.
  let snapshotSeq = -1;
  const step = async (item: HcStreamItem) => {
    // `missed`: hc dropped events for this subscriber, so the held state is stale and is replaced whole.
    if (item.type === 'snapshot' || item.type === 'missed') {
      terminals.clear();
      snapshotSeq = item.seq;
      for (const terminal of item.terminals) remember(terminal.address, terminal);
      for (const address of sent.keys()) if (!terminals.has(address)) sent.delete(address);
      return;
    }
    // `data` is null only for a foreground change, which the relay does not use.
    if (item.seq <= snapshotSeq || item.data === null) return;
    const { terminal: address, event, data } = item;
    if (event === 'created') remember(address, data);
    else if (event === 'removed') { terminals.delete(address); sent.delete(address); }
    // A terminal that gains the notify label later (for example a Herdr.app pane labeled after start)
    // arrives as a `labels` event that carries its whole `record`.
    else if (event === 'labels' && typeof data.record === 'object' && data.record !== null) remember(address, { ...data.record, labels: data.labels });
    else if (event === 'labels' && terminals.has(address)) {
      terminals.set(address, { ...terminals.get(address)!, labels: (data.labels ?? {}) as HcLabels });
    } else if (event === 'status' && terminals.has(address)) {
      const status = data.status as { readonly app?: unknown; readonly kind?: unknown } | null;
      const facts = terminals.get(address)!;
      terminals.set(address, { ...facts, app: typeof status?.app === 'string' ? status.app : facts.app, kind: typeof status?.kind === 'string' ? status.kind : null });
    } else if (event === 'turn' && (data.state === 'blocked' || data.state === 'done')) {
      if (Number.isSafeInteger(data.turn)) await deliver(address, data.turn as number, data.state);
      else log(`A ${data.state} event of terminal ${address} has no turn number. It is not sent.`);
    }
  };

  return {
    handle: item => { queue = queue.then(() => step(item)); },
    settled: () => queue,
  };
}

/**
 * Run until the stream ends. A hangup or termination closes the stream and returns. A stream
 * that ends on its own (the core stopped) rejects: the relay does not restart itself, and the
 * notify status then reports `relay_stopped`.
 */
export async function runNotifyRelay(deps: NotifyRelayDeps & { readonly events?: typeof hcEvents }): Promise<void> {
  const relay = createNotifyRelay(deps);
  let stopping = false;
  const stream: HcEventStream = (deps.events ?? hcEvents)(RH_NOTIFY_LABELS, relay.handle, { env: deps.env });
  const stop = () => { stopping = true; stream.close(); };
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
  try { await stream.done; }
  finally {
    for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const) process.off(signal, stop);
    await relay.settled();
  }
  if (!stopping) throw new Error('The hc event stream ended.');
}
