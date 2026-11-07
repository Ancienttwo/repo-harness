import { AGENT_RUNTIME_CAPABILITIES, decodeAgentsSettings, type AgentsSettingsV1 } from '../../core/board/agents-settings';
import { isReviewRuntimeId } from '../../core/review/review-runtimes';
import { DEFAULT_SEATS_CONFIG, SEAT_IDS, decodeSeatsSettings, type SeatsConfigV1, type SeatsSettingsRequestV1, type SeatsSettingsV1 } from '../../core/board/seats-settings';
import type { DocumentationLanguage, DocumentationLanguageReader, DocumentationLanguageWriter, LanguageRead, LanguageReader, LanguageWriter, ReportingHost, ReportingPreset } from '../language-settings';
import type { OperatorApiErrorV1 } from '../operator-api-error';
import type { AgentsSettingsRead, AgentsSettingsWrite, AgentsSettingsPost, SettingsRead, SettingsWrite } from '../settings';

const REVISION = `sha256:${'4'.repeat(64)}`;

const entry = (id: string, group: 'default' | 'community' | 'host_dependency', installation: Record<string, unknown>) => ({
  id, group, installation, review_supported: isReviewRuntimeId(id), docs_supported: false, capabilities: AGENT_RUNTIME_CAPABILITIES,
});

/** The probe of one machine: the 7 OAR defaults, Mister Morph, and the two runtimes that need optional packages. */
function entries() {
  return [
    entry('antigravity', 'default', { kind: 'not_found' }),
    entry('claude', 'default', { kind: 'available', via: 'executable', version: '2.1.3' }),
    entry('codex', 'default', { kind: 'available', via: 'executable', version: '0.71.0' }),
    entry('grok', 'default', { kind: 'not_found' }),
    entry('kimi', 'default', { kind: 'available', via: 'executable', version: '1.4.0' }),
    entry('opencode', 'default', { kind: 'unsupported', reason: 'opencode v2 needs a newer server' }),
    entry('pi', 'default', { kind: 'available', via: 'bundled', version: null }),
    entry('morph', 'community', { kind: 'host_setup_required' }),
    entry('cursor', 'host_dependency', { kind: 'dependency_missing', package: '@cursor/sdk' }),
    entry('pi-durable', 'host_dependency', { kind: 'dependency_missing', package: '@earendil-works/pi-durable' }),
  ];
}

/** busy: codex reviews and claude reviews. degraded: the last probe timed out, and the section names a runtime the probe no longer lists. No runtime is docs-supported: the docs host is closed. */
export function agentsSettingsFixture(now: number, fixture: 'busy' | 'degraded'): AgentsSettingsV1 {
  const collected = new Date(now - (fixture === 'busy' ? 4 : 47) * 60_000).toISOString();
  return decodeAgentsSettings({
    protocol: 1,
    kind: 'operator_agents_settings',
    config: fixture === 'busy'
      ? { revision: REVISION, enabled: ['claude', 'codex'], uses: { docs: [], review: ['claude', 'codex'] }, default_docs: null }
      : { revision: REVISION, enabled: ['claude', 'gemini'], uses: { docs: [], review: ['claude'] }, default_docs: null },
    runtimes: fixture === 'busy'
      ? { status: 'ready', reason: null, collected_at: collected, entries: entries() }
      : { status: 'stale', reason: 'probe_timeout', collected_at: collected, entries: entries() },
  });
}

const SUB_AGENTS = [
  { name: 'explorer', writable: false }, { name: 'deep-reasoner', writable: false }, { name: 'fast-worker', writable: true },
  { name: 'deep-worker', writable: true }, { name: 'gatekeeper', writable: false }, { name: 'root-cause-prover', writable: true },
  { name: 'harness-evaluator', writable: true },
];

/** The ranges the server derives from the fleet role profiles, written out for the in-page store. */
function seatsRanges(enabled: readonly string[]) {
  const all = ['read', 'edit', 'shell', 'net', 'tasks', 'mcp', 'gh'];
  return {
    runtimes: [
      { id: 'claude', enabled: enabled.includes('claude'), models: ['opus', 'sonnet', 'haiku', 'fable'], effort: true, fleet: true },
      { id: 'codex', enabled: enabled.includes('codex'), models: ['gpt-6-luna', 'gpt-6-astra', 'gpt-6.1-sol'], effort: true, fleet: true },
      { id: 'pi', enabled: enabled.includes('pi'), models: [], effort: false, fleet: false },
    ],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    roles: SUB_AGENTS,
    seats: {
      orchestrator: { fleet: SUB_AGENTS.filter(role => !role.writable).map(role => role.name), tools: all.filter(tool => tool !== 'edit') },
      advisor: { fleet: SUB_AGENTS.filter(role => !role.writable).map(role => role.name), tools: all.filter(tool => tool !== 'edit' && tool !== 'gh') },
      worker: { fleet: SUB_AGENTS.map(role => role.name), tools: all },
    },
  };
}

type SeatsWrite = SeatsSettingsRequestV1 & { readonly request_id: string };

/**
 * In-page stand-ins for the two settings routes. They share one file, as the
 * real routes do: one revision, and the seats ranges read `enabled` from the
 * agents section. busy applies each change, so a save shows on the next read.
 * empty: no file and no finished detection, so nothing can be saved yet.
 * degraded: every agents save meets the write channel's `reconcile_required`,
 * the stored worker runtime is not enabled, and a seats save meets a revision conflict.
 */
export function settingsStores(now: number, fixture: 'busy' | 'empty' | 'degraded') {
  let agents = fixture === 'empty'
    ? decodeAgentsSettings({
      protocol: 1, kind: 'operator_agents_settings',
      config: { revision: 'absent', enabled: [], uses: { docs: [], review: [] }, default_docs: null },
      runtimes: { status: 'unavailable', reason: 'collection_pending', collected_at: null, entries: [] },
    })
    : agentsSettingsFixture(now, fixture);
  let seats: SeatsConfigV1 = fixture === 'busy'
    ? { ...DEFAULT_SEATS_CONFIG, worker: { ...DEFAULT_SEATS_CONFIG.worker, runtime: 'claude', model: 'sonnet' } }
    : DEFAULT_SEATS_CONFIG;
  let serial = 0;
  const nextRevision = () => { serial += 1; return `sha256:${serial.toString(16).padStart(64, '0')}`; };
  const conflict: SettingsWrite = { state: 'refused', status: 409, error: {
    code: 'revision_conflict', message: 'The configuration changed after it was read.', next_action: 'Reload the settings, then apply your change again.',
  } };
  const seatsSettings = () => decodeSeatsSettings({
    protocol: 1, kind: 'operator_seats_settings', config: { revision: agents.config.revision, ...seats },
    defaults: DEFAULT_SEATS_CONFIG, ranges: seatsRanges(agents.config.enabled),
  });

  const readAgents = (): Promise<AgentsSettingsRead> => Promise.resolve({ state: 'ok', settings: agents });
  const writeAgents = (body: AgentsSettingsPost): Promise<AgentsSettingsWrite> => {
    if (fixture === 'empty') {
      return Promise.resolve({ state: 'refused', status: 503, error: {
        code: 'runtimes_unavailable', message: 'The runtime list is not collected yet. Nothing was changed.',
        next_action: 'Wait for the runtime probe, then send the change with a new request_id.',
      } });
    }
    if (fixture === 'degraded') {
      return Promise.resolve({ state: 'refused', status: 409, error: {
        code: 'reconcile_required', message: 'The action may have run, but its result is not recorded.',
        next_action: 'Check the target state before you retry. Do not send the request again with a new request_id.',
      } });
    }
    if (body.expected_revision !== agents.config.revision) return Promise.resolve(conflict);
    const { config } = agents;
    const enabled = new Set(config.enabled);
    const docs = new Set(config.uses.docs);
    const review = new Set(config.uses.review);
    for (const change of body.changes) {
      if (change.enabled) enabled.add(change.runtime); else enabled.delete(change.runtime);
      for (const [use, set] of [['docs', docs], ['review', review]] as const) {
        if (change.uses.includes(use)) set.add(change.runtime); else set.delete(change.runtime);
      }
    }
    const revision = nextRevision();
    const next = {
      enabled: [...enabled].sort(), uses: { docs: [...docs].sort(), review: [...review].sort() },
      default_docs: body.default_docs_runtime === undefined ? config.default_docs : body.default_docs_runtime,
    };
    const changedKeys = [
      ...(next.enabled.join() === config.enabled.join() ? [] : ['agents.enabled']),
      ...(next.uses.docs.join() === config.uses.docs.join() ? [] : ['agents.uses.docs']),
      ...(next.uses.review.join() === config.uses.review.join() ? [] : ['agents.uses.review']),
      ...(next.default_docs === config.default_docs ? [] : ['agents.default_docs']),
    ];
    agents = decodeAgentsSettings({ ...agents, config: { revision, ...next } });
    return Promise.resolve({ state: 'saved', result: { config_revision: revision, changed_keys: changedKeys } });
  };

  const readSeats = (): Promise<SettingsRead<SeatsSettingsV1>> => Promise.resolve({ state: 'ok', settings: seatsSettings() });
  const writeSeats = (body: SeatsWrite): Promise<SettingsWrite> => {
    if (fixture === 'degraded' || body.expected_revision !== agents.config.revision) return Promise.resolve(conflict);
    // The route checks every seat against agents.enabled before it writes.
    const off = SEAT_IDS.find(id => !agents.config.enabled.includes(body.seats[id].runtime));
    if (off !== undefined) {
      return Promise.resolve({ state: 'refused', status: 422, error: {
        code: 'seat_runtime_not_enabled', message: `The ${off} seat runtime ${body.seats[off].runtime} is not enabled in Agent settings.`,
        next_action: 'Enable the runtime in Agent settings, or choose an enabled runtime.',
      } });
    }
    const revision = nextRevision();
    const changed = SEAT_IDS.flatMap(id => (['runtime', 'model', 'effort', 'tools', 'fleet'] as const)
      .filter(field => String(seats[id][field]) !== String(body.seats[id][field])).map(field => `seats.${id}.${field}`));
    seats = body.seats;
    agents = decodeAgentsSettings({ ...agents, config: { ...agents.config, revision } });
    return Promise.resolve({ state: 'saved', result: { config_revision: revision, changed_keys: changed } });
  };
  return { agents: { read: readAgents, write: writeAgents }, seats: { read: readSeats, write: writeSeats }, ...languageStores(fixture) };
}

const refusal = (status: number, error: OperatorApiErrorV1) => Promise.resolve({ state: 'refused' as const, status, error });

/**
 * The language routes in the page. degraded: a rules file with unbalanced markers refuses every
 * reporting save; empty: no repository has a policy file yet.
 */
function languageStores(fixture: 'busy' | 'empty' | 'degraded') {
  let preset: ReportingPreset = 'follow';
  const hosts = (): readonly ReportingHost[] => ['claude', 'codex'].map(host => ({
    host, state: fixture === 'degraded' && host === 'codex' ? 'unbalanced' : 'managed-current', preset,
  }));
  const readReporting: LanguageReader<readonly ReportingHost[]> = () => Promise.resolve<LanguageRead<readonly ReportingHost[]>>({ state: 'ok', value: hosts() });
  const writeReporting: LanguageWriter<ReportingPreset> = (next) => {
    if (fixture === 'degraded') {
      return refusal(409, { code: 'report_language_refused', message: 'The codex rules file has unbalanced markers.', next_action: 'Repair the reported rules file or path, then save the reporting language again.' });
    }
    preset = next;
    return Promise.resolve({ state: 'ok', value: { changed_hosts: ['claude', 'codex'] } });
  };
  const languages = new Map<string, DocumentationLanguage>();
  const missing: OperatorApiErrorV1 = { code: 'policy_missing', message: 'The repository policy file is missing.', next_action: 'repo-harness init' };
  const readDocumentation: DocumentationLanguageReader = repositoryId => () => Promise.resolve<LanguageRead<DocumentationLanguage | null>>(
    fixture === 'empty' ? { state: 'refused', error: missing } : { state: 'ok', value: languages.get(repositoryId) ?? 'en' });
  const writeDocumentation: DocumentationLanguageWriter = repositoryId => (language) => {
    if (fixture === 'empty') return refusal(409, missing);
    languages.set(repositoryId, language);
    return Promise.resolve({ state: 'ok', value: { language } });
  };
  return { reporting: { read: readReporting, write: writeReporting }, documentation: { read: readDocumentation, write: writeDocumentation } };
}
