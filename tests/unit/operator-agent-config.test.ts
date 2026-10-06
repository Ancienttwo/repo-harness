import { describe, expect, test } from 'bun:test';
import {
  AGENT_CONFIG_CORE_MAX_BYTES, compareAgentRules, decodeAgentConfigCoreProjection,
  projectAgentConfigCore, projectAgentConfigPolicy, publicAgentConfigText,
} from '../../src/core/operator/agent-config';

const rule = (id: string, text: string) => `<!-- repo-harness:shared-rule ${id} -->\n${text}\n<!-- /repo-harness:shared-rule -->`;
const project = (agents: string | null, claude: string | null = agents, policy: unknown = {}) => projectAgentConfigCore({ agents, claude, policy });
const credentialFixtures = [
  { label: 'Basic authorization', text: 'Authorization: Basic U1lOVEhFVElDOlNFQ1JFVA==', value: 'U1lOVEhFVElDOlNFQ1JFVA==' },
  { label: 'Digest authorization', text: 'Proxy-Authorization: Digest username=synthetic, response=FAKE_DIGEST_VALUE', value: 'FAKE_DIGEST_VALUE' },
  { label: 'Bearer header', text: 'Authorization: Bearer FAKE_BEARER_VALUE', value: 'FAKE_BEARER_VALUE' },
  { label: 'short auth payload', text: 'Basic abc', value: 'abc' },
  { label: 'encrypted PEM', text: '-----BEGIN ENCRYPTED PRIVATE KEY-----\nFAKE_PEM_BODY\n-----END ENCRYPTED PRIVATE KEY-----', value: 'FAKE_PEM_BODY' },
  { label: 'OpenSSH PEM', text: '-----BEGIN OPENSSH PRIVATE KEY-----\nFAKE_SSH_BODY\n-----END OPENSSH PRIVATE KEY-----', value: 'FAKE_SSH_BODY' },
  { label: 'unterminated PEM', text: '-----BEGIN PRIVATE KEY-----\nFAKE_UNCLOSED_BODY', value: 'FAKE_UNCLOSED_BODY' },
  { label: 'CLI api key', text: 'curl --api-key FAKE_CLI_VALUE', value: 'FAKE_CLI_VALUE' },
  { label: 'CLI quoted password', text: 'tool --password "FAKE_QUOTED_VALUE with spaces"', value: 'FAKE_QUOTED_VALUE' },
  { label: 'CLI key option', text: 'tool --key=FAKE_KEY_VALUE', value: 'FAKE_KEY_VALUE' },
  { label: 'curl short user option', text: 'curl -u user:FAKE_USER_PASSWORD', value: 'FAKE_USER_PASSWORD' },
  { label: 'curl short header option', text: 'curl -H \"X-Key: FAKE_HEADER_VALUE\"', value: 'FAKE_HEADER_VALUE' },
  { label: 'multiline assignment', text: 'password: |\n  FAKE_FIRST_LINE\n  FAKE_LAST_LINE', value: 'FAKE_LAST_LINE' },
  { label: 'escaped quote assignment', text: 'token="prefix\\"FAKE_SUFFIX_VALUE"', value: 'FAKE_SUFFIX_VALUE' },
  { label: 'cookie header', text: 'Set-Cookie: session=FAKE_COOKIE_VALUE; HttpOnly', value: 'FAKE_COOKIE_VALUE' },
  { label: 'connection credentials', text: 'postgres://user:FAKE_CONNECTION_VALUE@example.invalid/db', value: 'FAKE_CONNECTION_VALUE' },
  { label: 'Slack webhook', text: 'https://hooks.slack.com/services/TFAKE/BFAKE/FAKE_WEBHOOK_VALUE', value: 'FAKE_WEBHOOK_VALUE' },
  { label: 'Discord webhook', text: 'https://discord.com/api/webhooks/123/FAKE_DISCORD_VALUE', value: 'FAKE_DISCORD_VALUE' },
  { label: 'Telegram bot URL', text: 'https://api.telegram.org/bot123456:FAKE_TELEGRAM_VALUE/getMe', value: 'FAKE_TELEGRAM_VALUE' },
  { label: 'URL query secret', text: 'https://example.invalid/endpoint?token=FAKE_QUERY_VALUE', value: 'FAKE_QUERY_VALUE' },
  { label: 'GitHub token', text: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456', value: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' },
  { label: 'OpenAI-shaped token', text: 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456', value: 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' },
  { label: 'AWS-shaped key', text: 'AKIAABCDEFGHIJKLMNOP', value: 'AKIAABCDEFGHIJKLMNOP' },
  { label: 'Slack-shaped token', text: 'xoxb-FAKE-SLACK-VALUE', value: 'xoxb-FAKE-SLACK-VALUE' },
  { label: 'JWT-shaped token', text: 'eyJabcdefghijk.abcdefghijklm.abcdefghijklm', value: 'eyJabcdefghijk.abcdefghijklm.abcdefghijklm' },
] as const;

describe('pure Agent-config rule comparison', () => {
  test('matching headings or content do not declare sharing', () => {
    expect(compareAgentRules('## Workflow\nSame', '## Workflow\nSame').drift).toBe('not-declared');
    const value = project('## Workflow\nBefore', '## Workflow\nAfter');
    expect(value.rules.drift).toBe('not-declared');
    expect(value.rules.sections[0]).toEqual({ section_id: 1, heading: 'Workflow', scope: 'not-declared', agents: '## Workflow\nBefore', claude: '## Workflow\nAfter' });
  });
  test('stable IDs determine equality, drift, and a missing counterpart', () => {
    expect(project(rule('safe.1', 'Same')).rules.drift).toBe('equal');
    expect(project(rule('safe.1', 'Same'), rule('safe.1', 'Changed')).rules.drift).toBe('drift');
    expect(project(rule('safe.1', 'Same'), '').rules.blocks[0]).toMatchObject({ drift: 'drift', claude: null });
  });
  test('ID order is stable and IDs do not match by similar text', () => {
    const value = project(`${rule('b', 'Same')}\n${rule('a', 'Same')}`, `${rule('a', 'Same')}\n${rule('c', 'Same')}`);
    expect(value.rules.blocks.map(b => [b.rule_id, b.drift])).toEqual([['a', 'equal'], ['b', 'drift'], ['c', 'drift']]);
  });
  test('host-specific sections stay separate from shared-rule drift', () => {
    const value = project(`${rule('safe.1', 'Same')}\n## Codex\nFirst`, `${rule('safe.1', 'Same')}\n## Claude Code\nSecond`);
    expect(value.rules.drift).toBe('equal');
    expect(value.rules.sections.filter(s => s.scope === 'host-specific')).toHaveLength(2);
    expect(project(`## Codex\n${rule('host', 'a')}`, `## Claude Code\n${rule('host', 'b')}`).rules.drift).toBe('not-declared');
  });
  test('duplicate, nested, malformed, cross-section and unclosed markers are invalid', () => {
    for (const text of [rule('a', 'one') + '\n' + rule('a', 'two'), rule('a', rule('b', 'nested')),
      '<!-- repo-harness:shared-rule -->', '<!-- repo-harness:shared-rule a -->\nopen',
      rule('a', '## Another section\ntext'), '<!-- /repo-harness:shared-rule -->']) {
      const value = project(text, rule('a', 'one'));
      expect(value.rules.drift).toBe('invalid'); expect(value.rules.blocks).toEqual([]);
    }
  });
  test('null source is unknown, empty source is not-declared', () => {
    expect(project(null, '').rules).toEqual({ drift: 'unknown', blocks: [], sections: [] });
    expect(project('', '').rules).toEqual({ drift: 'not-declared', blocks: [], sections: [] });
  });
  test('duplicate headings retain all source text', () => {
    expect(project('## Workflow\nFirst\n## Workflow\nSecond').rules.sections[0]!.agents).toContain('First\n## Workflow\nSecond');
  });
  test('fenced examples are text, not active declarations or host headings', () => {
    for (const fence of ['```', '~~~~']) {
      const value = project(`## Workflow\n${fence}markdown\n${rule('example', 'text')}\n## Codex\n${fence}\n${rule('actual', 'Same')}`);
      expect(value.rules.drift).toBe('equal');
      expect(value.rules.blocks.map(b => b.rule_id)).toEqual(['actual']);
      expect(value.rules.sections).toHaveLength(1);
    }
  });
  test('recognizes ordinary ATX host headings with indentation or closing hashes', () => {
    for (const heading of ['## Codex ##', '  ## Codex', '   ## Claude Code ###', '## Codex\t##']) {
      const value = project(`${heading}\n${rule('host.rule', 'a')}`, `${heading}\n${rule('host.rule', 'b')}`);
      expect(value.rules.drift).toBe('not-declared');
      expect(value.rules.sections[0]!.scope).toBe('host-specific');
    }
  });
  test('redacted heading collisions use structural IDs, not label uniqueness', () => {
    const value = project('## /Users/synthetic/one\na\n## /Users/synthetic/two\nb');
    expect(value.rules.sections.map(section => [section.section_id, section.heading])).toEqual([[1, '[private path]'], [2, '[private path]']]);
    expect(value.rules.drift).toBe('not-declared');
  });
  test('normalizes CRLF while preserving content whitespace', () => {
    expect(project(rule('a', 'same').replaceAll('\n', '\r\n'), rule('a', 'same')).rules.drift).toBe('equal');
    expect(project(rule('a', 'same '), rule('a', 'same')).rules.drift).toBe('drift');
  });
  test('oversized sources and declaration counts fail closed', () => {
    expect(project('x'.repeat(AGENT_CONFIG_CORE_MAX_BYTES), 'x').rules.drift).toBe('invalid');
    expect(project(Array.from({ length: 257 }, (_, n) => rule(`rule.${n}`, 'text')).join('\n'), '').rules.drift).toBe('invalid');
  });
});

describe('pure secret-safe projection', () => {
  for (const fixture of credentialFixtures) {
    test(`suppresses the entire ${fixture.label} field through projection and decoder`, () => {
      expect(publicAgentConfigText(`before\n${fixture.text}\nafter`)).toBe('[configured]');
      const value = project(`## Workflow\n${fixture.text}`, '## Workflow\nSafe', { guards: { command: fixture.text } });
      expect(JSON.stringify(value)).not.toContain(fixture.value);
      expect(value.rules).toEqual({ drift: 'redacted', blocks: [], sections: [] });
      expect(value.policy.guards).toEqual({ command: '[configured]' });
      expect(decodeAgentConfigCoreProjection(value)).toEqual(value);
      const safe = project('## Workflow\nSafe');
      expect(() => decodeAgentConfigCoreProjection({ ...safe, rules: { ...safe.rules, sections: [{ ...safe.rules.sections[0], agents: fixture.text }] } })).toThrow('agent_config_core_invalid');
      expect(() => decodeAgentConfigCoreProjection({ ...value, policy: { ...value.policy, guards: { command: fixture.text } } })).toThrow('agent_config_core_invalid');
    });
  }
  test('credential-bearing documents expose no IDs or headings', () => {
    const secret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const value = project(`## ${secret}\n${rule(secret, 'text')}`);
    expect(value.rules).toEqual({ drift: 'redacted', blocks: [], sections: [] }); expect(JSON.stringify(value)).not.toContain(secret);
  });
  test('a credential carrier outside a section or rule block suppresses payload fragments', () => {
    for (const text of [
      `Authorization:\n${rule('payload', 'FAKE_SPLIT_AUTH_PAYLOAD')}`,
      `-----BEGIN ENCRYPTED PRIVATE KEY-----\n## Payload\n${rule('payload', 'FAKE_SPLIT_AUTH_PAYLOAD')}\n-----END ENCRYPTED PRIVATE KEY-----`,
    ]) {
      const value = project(text);
      expect(JSON.stringify(value)).not.toContain('FAKE_SPLIT_AUTH_PAYLOAD');
      expect(value.rules).toEqual({ drift: 'redacted', blocks: [], sections: [] });
    }
  });
  test('does not claim a comparison for suppressed documents', () => {
    const value = project(rule('a', 'password=FAKE_ONE'), rule('a', 'password=FAKE_TWO'));
    expect(value.rules).toEqual({ drift: 'redacted', blocks: [], sections: [] });
  });
  test('one suppressed document makes even safe-looking shared blocks unavailable', () => {
    const value = project(`${rule('same', 'Safe shared rule.')}\nAuthorization: Basic FAKE_VALUE`, rule('same', 'Safe shared rule.'));
    expect(value.rules).toEqual({ drift: 'redacted', blocks: [], sections: [] });
  });
  test('hides private absolute paths and control bytes, and is idempotent', () => {
    for (const text of ['/Users/synthetic/private', '/home/synthetic/private', 'C:\\Users\\synthetic\\private', '/tmp/synthetic']) {
      expect(publicAgentConfigText(text)).toBe('[private path]');
    }
    expect(publicAgentConfigText('bad\0text')).toBe('[unavailable]');
    for (const text of ['[configured]', '[private path]', '[unavailable]', 'Use tests before committing.']) expect(publicAgentConfigText(publicAgentConfigText(text))).toBe(publicAgentConfigText(text));
  });
  test('selects only policy sections and exposes sensitive-key presence', () => {
    const value = project('', '', { guards: { api_key: 'FAKE_VALUE', empty_token: null, password: '', cookie: false, authorization: null, auth: 'FAKE_AUTH_VALUE', access_key: 'FAKE_ACCESS_VALUE', enabled: true },
      enforcement: { count: 2 }, merge_gate: true, unrelated: 'FAKE_OUTSIDE_FIELD' });
    expect(value.policy).toEqual({ guards: { api_key: 'configured', empty_token: 'missing', password: 'missing', cookie: 'missing', authorization: 'missing', auth: 'configured', access_key: 'configured', enabled: true }, enforcement: { count: 2 }, merge_gate: true });
    expect(JSON.stringify(value)).not.toContain('FAKE_VALUE'); expect(JSON.stringify(value)).not.toContain('FAKE_OUTSIDE_FIELD');
  });
  test('shared credential labels recognize space, underscore, hyphen, and joined forms', () => {
    for (const words of [['API', 'key'], ['private', 'key'], ['access', 'key'], ['signing', 'key']]) {
      for (const separator of [' ', '_', '-', '']) {
        const label = words.join(separator);
        const value = project('', '', { guards: { [label]: 'SYNTHETIC_LABEL_VALUE' } });
        expect(value.policy.guards).toEqual({ [label]: 'configured' });
        expect(publicAgentConfigText(`${label}: SYNTHETIC_LABEL_VALUE`)).toBe('[configured]');
      }
    }
  });
  test('suppression omits secret payloads parsed as metadata', () => {
    for (const text of [
      '-----BEGIN ENCRYPTED PRIVATE KEY-----\n## SYNTHETIC_HEADING_PAYLOAD\nBody\n-----END ENCRYPTED PRIVATE KEY-----',
      `Authorization:\n${rule('SYNTHETIC_ID_PAYLOAD', 'body')}`,
    ]) {
      const value = project(text);
      expect(value.rules).toEqual({ drift: 'redacted', blocks: [], sections: [] });
      expect(JSON.stringify(value)).not.toContain('SYNTHETIC_');
    }
  });
  test('deep, cyclic, wide, and byte-heavy policy input is bounded without mutation', () => {
    const cycle: Record<string, unknown> = {}; cycle.loop = cycle;
    expect(projectAgentConfigPolicy({ guards: cycle }).guards).toBe('[unavailable]');
    let deep: unknown = 'leaf'; for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(JSON.stringify(projectAgentConfigPolicy({ guards: deep }))).toContain('[unavailable]');
    expect(projectAgentConfigPolicy({ guards: Array.from({ length: 257 }, () => true) }).guards).toBe('[unavailable]');
    expect(projectAgentConfigPolicy({ guards: 'x'.repeat(AGENT_CONFIG_CORE_MAX_BYTES + 1) }).guards).toBe('[unavailable]');
    let repeated: unknown = false; for (let i = 0; i < 8; i++) repeated = Array(256).fill(repeated);
    expect(projectAgentConfigPolicy({ guards: repeated }).guards).toBe('[unavailable]');
    const input = Object.freeze({ guards: Object.freeze({ enabled: true }) });
    expect(projectAgentConfigPolicy(input).guards).toEqual({ enabled: true });
  });
  test('prototype-shaped keys stay inert data, and secret keys do not leak', () => {
    const secret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const input = JSON.parse(`{"guards":{"__proto__":{"polluted":true},"${secret}":"value"}}`);
    const value = project('', '', input);
    expect(Object.prototype.hasOwnProperty.call(value.policy.guards, '__proto__')).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(JSON.stringify(value)).not.toContain(secret);
  });
});

describe('pure core schema boundary', () => {
  test('the result admits no collection, filesystem, identity, or runtime-loading claim', () => {
    const value = project('## Workflow\nSafe');
    expect(Object.keys(value)).toEqual(['protocol', 'kind', 'rules', 'policy']);
    for (const field of ['snapshot', 'repository_id', 'path', 'loaded', 'runtime_loaded', 'herdr', 'collected_at']) {
      expect(() => decodeAgentConfigCoreProjection({ ...value, [field]: 'fake' })).toThrow();
    }
    expect(() => decodeAgentConfigCoreProjection({ ...value, protocol: 2 })).toThrow();
    expect(() => decodeAgentConfigCoreProjection({ ...value, kind: 'operator_agent_config' })).toThrow();
  });
  test('rejects unexpected fields and false or duplicate comparison claims', () => {
    const value = project(rule('a', 'same'));
    for (const rules of [
      { ...value.rules, extra: 'field' }, { ...value.rules, blocks: [...value.rules.blocks, ...value.rules.blocks] },
      { ...value.rules, sections: [...value.rules.sections, ...value.rules.sections] },
      { ...value.rules, drift: 'not-declared' }, { ...value.rules, drift: 'drift' },
      { ...value.rules, blocks: [{ ...value.rules.blocks[0], claude: 'different' }] },
      { ...value.rules, sections: [{ ...value.rules.sections[0], scope: 'host-specific' }] },
    ]) expect(() => decodeAgentConfigCoreProjection({ ...value, rules })).toThrow();
  });
  test('rejects malformed, non-finite, cyclic and unsafe policy values', () => {
    const value = project(''); const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const guards of [{ password: 'FAKE_RAW_VALUE' }, Infinity, undefined, cycle, () => true]) {
      expect(() => decodeAgentConfigCoreProjection({ ...value, policy: { guards, enforcement: null, merge_gate: null } })).toThrow();
    }
    for (const input of [null, [], {}, { ...value, policy: { ...value.policy, extra: false } }]) expect(() => decodeAgentConfigCoreProjection(input)).toThrow();
  });
  test('rejects accessors before invocation and never rereads input during cloning', () => {
    const value = project(''); let reads = 0;
    const guards = { get command() { reads++; return reads < 3 ? 'Safe' : 'Authorization: Basic SYNTHETIC_SECRET'; } };
    expect(() => decodeAgentConfigCoreProjection({ ...value, policy: { guards, enforcement: null, merge_gate: null } })).toThrow('agent_config_core_invalid');
    expect(reads).toBe(0);
    const getter = { get rules() { reads++; return value.rules; }, protocol: 1, kind: value.kind, policy: value.policy };
    expect(() => decodeAgentConfigCoreProjection(getter)).toThrow(); expect(reads).toBe(0);
  });
  test('policy projection suppresses unsupported objects without calling getters or exposing errors', () => {
    let calls = 0;
    const badPolicy = { get guards() { calls++; throw new Error('SYNTHETIC_PRIVATE_ERROR'); } };
    const badGuards = { get command() { calls++; return 'Authorization: Basic SYNTHETIC_SECRET'; } };
    const serialization = { toJSON() { calls++; throw new Error('SYNTHETIC_PRIVATE_ERROR'); } };
    for (const input of [badPolicy, { guards: badGuards }, { guards: serialization }, { guards: Object.create({ inherited: true }) }, { guards: { missing: undefined } }]) {
      expect(projectAgentConfigPolicy(input)).toEqual({ guards: '[unavailable]', enforcement: '[unavailable]', merge_gate: '[unavailable]' });
      expect(JSON.stringify(projectAgentConfigPolicy(input))).not.toContain('SYNTHETIC_');
    }
    expect(calls).toBe(0);
  });
  test('the combined projection never invokes top-level input accessors', () => {
    let calls = 0;
    const input = { get agents(): string { calls++; throw new Error('SYNTHETIC_PRIVATE_ERROR'); }, claude: '', policy: {} };
    expect(() => projectAgentConfigCore(input)).toThrow('agent_config_core_invalid');
    expect(calls).toBe(0);
  });
  test('rejects custom serialization, inherited data, symbols, and hidden properties', () => {
    const value = project(''); let calls = 0;
    const toJSON = { toJSON() { calls++; return 'Authorization: Basic SYNTHETIC_SECRET'; } };
    const inherited = Object.create({ command: 'Authorization: Basic SYNTHETIC_SECRET' });
    const hidden = Object.defineProperty({}, 'command', { value: 'hidden', enumerable: false });
    const symbol = { [Symbol('secret')]: 'SYNTHETIC_SECRET' };
    for (const guards of [toJSON, inherited, hidden, symbol, new Date()]) {
      expect(() => decodeAgentConfigCoreProjection({ ...value, policy: { guards, enforcement: null, merge_gate: null } })).toThrow();
    }
    expect(calls).toBe(0);
  });
  test('rejects sparse, oversized, and extended arrays before JSON serialization', () => {
    const value = project(''); const extended = [true]; Object.defineProperty(extended, 'extra', { value: true, enumerable: true });
    const accessor = [true]; let reads = 0;
    Object.defineProperty(accessor, '0', { get() { reads++; return true; }, enumerable: true });
    for (const guards of [Array(257), Array(1_000_000_000), Array(2), [...Array(257)].map(() => true), extended, accessor]) {
      expect(() => decodeAgentConfigCoreProjection({ ...value, policy: { guards, enforcement: null, merge_gate: null } })).toThrow();
    }
    expect(reads).toBe(0);
  });
  test('returns detached data and never changes caller input', () => {
    const input = { guards: { modes: ['safe'] } }; const copy = structuredClone(input);
    const value = project('## Workflow\nSafe', '## Workflow\nSafe', input);
    expect(input).toEqual(copy);
    const decoded = decodeAgentConfigCoreProjection(value);
    expect(decoded).toEqual(value); expect(decoded).not.toBe(value); expect(decoded.rules).not.toBe(value.rules);
  });
});
