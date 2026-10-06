/**
 * Pure Agent-config library primitives. This is not an Operator reader or a
 * complete Agent-config feature. Callers supply text and parsed policy values.
 * This module has no filesystem, process, registry, collector, or UI integration.
 */
export const AGENT_CONFIG_CORE_MAX_BYTES = 256 * 1024;
const MAX_ITEMS = 256;
const MAX_DEPTH = 12;
const REDACTED = '[configured]';
const UNAVAILABLE = '[unavailable]';
// The same label vocabulary covers policy keys, assignments, and CLI options.
const CREDENTIAL_LABEL = String.raw`(?:token|secret|password|passwd|passphrase|(?:api|private|access|signing)[ \t_-]*key|credential|webhook|endpoint|authorization|authentication|cookie|auth|signature|dsn|connection)`;
const SENSITIVE_NAME = new RegExp(`${CREDENTIAL_LABEL}|url|uri`, 'iu');
const CREDENTIAL_CARRIERS = [
  /-----BEGIN[^\r\n]*PRIVATE[ \t]+KEY-----/iu,
  /\b(?:proxy[-_ ]?)?(?:authorization|authentication)["']?\s*[:=]/iu,
  /\b(?:bearer|basic|digest|negotiate)\s+\S+/iu,
  new RegExp(String.raw`(?:--?|\b)[\w-]*${CREDENTIAL_LABEL}[\w-]*["']?(?:\s*[:=]|[ \t]+(?=["'\w]))`, 'iu'),
  /(?:--(?:auth|key|user|header|oauth2-bearer)|-[uH])(?:[=\s]|$)/iu,
  /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/iu,
  /https?:\/\/(?:hooks\.slack\.com\/services|(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot)/iu,
  /https?:\/\/[^\s"'<>]*[?&](?:token|key|secret|auth|signature|sig|code)=/iu,
  /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+|\d{6,}:[A-Za-z0-9_-]{25,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/u,
];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => object(v)
  && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const invalid = (): never => { throw new Error('agent_config_core_invalid'); };

/**
 * Suppress the whole field when it contains a credential carrier. Do not guess
 * where a quoted, encoded, or multiline payload ends. This can hide safe prose.
 * It is a conservative display filter, not proof that arbitrary prose is public.
 */
export function publicAgentConfigText(text: string): string {
  if (bytes(text) > AGENT_CONFIG_CORE_MAX_BYTES || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)) return UNAVAILABLE;
  if (text !== REDACTED && CREDENTIAL_CARRIERS.some(pattern => pattern.test(text))) return REDACTED;
  return text.replace(/(^|[\s("'=:])(?:\/(?:[^\s"')<>]+)|[A-Za-z]:[\\/][^\s"')<>]+)/gu, '$1[private path]');
}

export type PublicPolicyValue = null | boolean | number | string | readonly PublicPolicyValue[] | { readonly [key: string]: PublicPolicyValue };
export interface AgentConfigPolicyProjection {
  readonly guards: PublicPolicyValue;
  readonly enforcement: PublicPolicyValue;
  readonly merge_gate: PublicPolicyValue;
}
/** Select only the declared policy sections. Sensitive keys expose presence only. */
export function projectAgentConfigPolicy(value: unknown): AgentConfigPolicyProjection {
  try { value = detachedJsonData(value ?? {}); }
  catch { return { guards: UNAVAILABLE, enforcement: UNAVAILABLE, merge_gate: UNAVAILABLE }; }
  let remaining = AGENT_CONFIG_CORE_MAX_BYTES, remainingNodes = 4096;
  const ancestors = new Set<object>();
  const visit = (item: unknown, depth: number): PublicPolicyValue => {
    if (depth > MAX_DEPTH || remaining <= 0 || --remainingNodes < 0) return UNAVAILABLE;
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return item;
    if (typeof item === 'string') {
      remaining -= bytes(item);
      return remaining < 0 ? UNAVAILABLE : publicAgentConfigText(item);
    }
    if (!object(item) && !Array.isArray(item)) return null;
    if (ancestors.has(item)) return UNAVAILABLE;
    const entries = Object.entries(item);
    if (entries.length > MAX_ITEMS) return UNAVAILABLE;
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        const result: PublicPolicyValue[] = [];
        for (const child of item) {
          result.push(visit(child, depth + 1));
          if (remainingNodes < 0) return UNAVAILABLE;
        }
        return result;
      }
      const result: Record<string, PublicPolicyValue> = {};
      for (const [index, [key, child]] of entries.entries()) {
        remaining -= bytes(key);
        if (remaining < 0) return UNAVAILABLE;
        const safeKey = publicAgentConfigText(key);
        const outputKey = safeKey === key ? key : `[redacted field ${index + 1}]`;
        const projected = SENSITIVE_NAME.test(key)
          ? (child === null || child === '' || child === false || child === undefined ? 'missing' : 'configured')
          : visit(child, depth + 1);
        // A data key such as __proto__ must stay data and must not change a prototype.
        if (remainingNodes < 0) return UNAVAILABLE;
        Object.defineProperty(result, outputKey, { value: projected, enumerable: true, configurable: true, writable: true });
      }
      return result;
    } finally { ancestors.delete(item); }
  };
  const input = object(value) ? value : {};
  return { guards: visit(input.guards, 0), enforcement: visit(input.enforcement, 0), merge_gate: visit(input.merge_gate, 0) };
}

export type RuleDrift = 'equal' | 'drift' | 'not-declared' | 'invalid' | 'unknown' | 'redacted';
export interface AgentRuleComparison {
  readonly drift: RuleDrift;
  readonly blocks: readonly { readonly rule_id: string; readonly drift: 'equal' | 'drift'; readonly agents: string | null; readonly claude: string | null }[];
  readonly sections: readonly { readonly section_id: number; readonly heading: string; readonly scope: 'not-declared' | 'host-specific'; readonly agents: string | null; readonly claude: string | null }[];
}
interface RuleDocument { blocks: Map<string, string>; sections: Map<string, string>; invalid: boolean }
const hostSection = (heading: string): boolean => heading === 'Codex' || heading === 'Claude Code';
const ruleId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id) && publicAgentConfigText(id) === id;
/** Markers: <!-- repo-harness:shared-rule stable.id --> … <!-- /repo-harness:shared-rule -->. */
function ruleDocument(text: string): RuleDocument {
  const blocks = new Map<string, string>(), sections = new Map<string, string>();
  if (text === '') return { blocks, sections, invalid: false };
  let section = '', body: string[] = [], active: string | null = null, block: string[] = [], invalid = false;
  let fence: { marker: string; length: number } | null = null;
  const flush = () => {
    if (body.length) sections.set(section, [sections.get(section), body.join('\n')].filter(v => v !== undefined).join('\n'));
    body = [];
  };
  for (const line of text.replace(/\r\n/gu, '\n').split('\n')) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/u.exec(line);
    if (fence !== null) {
      body.push(line);
      if (active !== null) block.push(line);
      if (fenceMatch && fenceMatch[1]![0] === fence.marker && fenceMatch[1]!.length >= fence.length
        && line.slice(fenceMatch[0].length).trim() === '') fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = { marker: fenceMatch[1]![0]!, length: fenceMatch[1]!.length };
      body.push(line); if (active !== null) block.push(line); continue;
    }
    const heading = /^ {0,3}##(?!#)[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u.exec(line)?.[1];
    if (heading) {
      if (active !== null) invalid = true; // A shared block cannot cross section ownership.
      flush(); section = heading;
    }
    body.push(line);
    if (hostSection(section)) continue;
    const start = /^<!-- repo-harness:shared-rule ([A-Za-z0-9][A-Za-z0-9._-]{0,127}) -->$/u.exec(line);
    if (start) {
      if (active !== null || blocks.has(start[1]!) || !ruleId(start[1])) invalid = true;
      active = start[1]!; block = []; continue;
    }
    if (line === '<!-- /repo-harness:shared-rule -->') {
      if (active === null) invalid = true;
      else { blocks.set(active, block.join('\n')); active = null; }
      continue;
    }
    if (line.includes('repo-harness:shared-rule')) invalid = true;
    if (active !== null) block.push(line);
  }
  flush();
  return { blocks, sections, invalid: invalid || active !== null || blocks.size > MAX_ITEMS || sections.size > MAX_ITEMS };
}
export function compareAgentRules(agents: string | null, claude: string | null): AgentRuleComparison {
  if (agents === null || claude === null) return { drift: 'unknown', blocks: [], sections: [] };
  if (bytes(agents) + bytes(claude) > AGENT_CONFIG_CORE_MAX_BYTES) return { drift: 'invalid', blocks: [], sections: [] };
  // A suppressed document has no safe derived metadata. Omit its headings,
  // rule IDs, and comparisons too; do not invent replacement declared IDs.
  const admitted = [publicAgentConfigText(agents), publicAgentConfigText(claude)];
  if (admitted.includes(REDACTED)) return { drift: 'redacted', blocks: [], sections: [] };
  if (admitted.includes(UNAVAILABLE)) return { drift: 'invalid', blocks: [], sections: [] };
  const a = ruleDocument(agents), c = ruleDocument(claude);
  if (a.blocks.size + c.blocks.size > MAX_ITEMS || a.sections.size + c.sections.size > MAX_ITEMS) return { drift: 'invalid', blocks: [], sections: [] };
  const blocks = [...new Set([...a.blocks.keys(), ...c.blocks.keys()])].sort().map(rule_id => ({
    rule_id, drift: a.blocks.has(rule_id) && c.blocks.has(rule_id) && a.blocks.get(rule_id) === c.blocks.get(rule_id) ? 'equal' as const : 'drift' as const,
    agents: a.blocks.has(rule_id) ? publicAgentConfigText(a.blocks.get(rule_id)!) : null,
    claude: c.blocks.has(rule_id) ? publicAgentConfigText(c.blocks.get(rule_id)!) : null,
  }));
  return {
    drift: a.invalid || c.invalid ? 'invalid' : blocks.length === 0 ? 'not-declared' : blocks.some(b => b.drift === 'drift') ? 'drift' : 'equal',
    blocks: a.invalid || c.invalid ? [] : blocks,
    sections: [...new Set([...a.sections.keys(), ...c.sections.keys()])].map((heading, index) => ({
      section_id: index + 1, heading: publicAgentConfigText(heading), scope: hostSection(heading) ? 'host-specific' as const : 'not-declared' as const,
      agents: a.sections.has(heading) ? publicAgentConfigText(a.sections.get(heading)!) : null,
      claude: c.sections.has(heading) ? publicAgentConfigText(c.sections.get(heading)!) : null,
    })),
  };
}

export interface AgentConfigCoreProjection {
  readonly protocol: 1;
  readonly kind: 'agent_config_core_projection';
  readonly rules: AgentRuleComparison;
  readonly policy: AgentConfigPolicyProjection;
}
const safeText = (value: unknown): boolean => value === null || (typeof value === 'string' && publicAgentConfigText(value) === value);
/** Take one bounded data-only snapshot before validation; never invoke input getters or toJSON. */
function detachedJsonData(input: unknown): unknown {
  let nodes = 8192, budget = AGENT_CONFIG_CORE_MAX_BYTES * 3;
  const ancestors = new Set<object>();
  const copy = (item: unknown, depth: number): unknown => {
    if (--nodes < 0 || depth > MAX_DEPTH + 4) return invalid();
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return item;
    if (typeof item === 'string') { budget -= bytes(item); if (budget < 0) return invalid(); return item; }
    if (!object(item) && !Array.isArray(item)) return invalid();
    if (ancestors.has(item)) return invalid();
    const prototype = Object.getPrototypeOf(item);
    if (Array.isArray(item) ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype) return invalid();
    const descriptors = Object.getOwnPropertyDescriptors(item) as PropertyDescriptorMap;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string')) return invalid();
    const array = Array.isArray(item);
    const length = array ? descriptors.length?.value : null;
    if (array && (!Number.isSafeInteger(length) || length < 0 || length > MAX_ITEMS || keys.length !== length + 1)) return invalid();
    if (!array && keys.length > MAX_ITEMS) return invalid();
    ancestors.add(item);
    try {
      if (array) {
        const result: unknown[] = [];
        for (let index = 0; index < length; index++) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return invalid();
          result.push(copy(descriptor.value, depth + 1));
        }
        return result;
      }
      const result: Record<string, unknown> = {};
      for (const key of keys as string[]) {
        const descriptor = descriptors[key]!;
        if (!('value' in descriptor) || !descriptor.enumerable) return invalid();
        budget -= bytes(key); if (budget < 0) return invalid();
        Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true });
      }
      return result;
    } finally { ancestors.delete(item); }
  };
  try { return copy(input, 0); } catch { return invalid(); }
}
/** Decode only this pure library result; no filesystem or runtime claims are admitted. */
export function decodeAgentConfigCoreProjection(value: unknown): AgentConfigCoreProjection {
  value = detachedJsonData(value);
  if (!exact(value, ['protocol', 'kind', 'rules', 'policy']) || value.protocol !== 1 || value.kind !== 'agent_config_core_projection'
    || !exact(value.rules, ['drift', 'blocks', 'sections']) || !['equal', 'drift', 'not-declared', 'invalid', 'unknown', 'redacted'].includes(value.rules.drift as string)
    || !Array.isArray(value.rules.blocks) || value.rules.blocks.length > MAX_ITEMS || !Array.isArray(value.rules.sections) || value.rules.sections.length > MAX_ITEMS
    || !exact(value.policy, ['guards', 'enforcement', 'merge_gate'])) return invalid();
  const ids = new Set<string>();
  for (const block of value.rules.blocks) {
    if (!exact(block, ['rule_id', 'drift', 'agents', 'claude']) || !ruleId(block.rule_id) || ids.has(block.rule_id)
      || !['equal', 'drift'].includes(block.drift as string) || !safeText(block.agents) || !safeText(block.claude)
      || (block.agents === null && block.claude === null)
      || (block.drift === 'equal' && (block.agents === null || block.claude === null || block.agents !== block.claude))) return invalid();
    ids.add(block.rule_id);
  }
  if ((['unknown', 'invalid', 'not-declared', 'redacted'].includes(value.rules.drift as string) && value.rules.blocks.length !== 0)
    || (['unknown', 'redacted'].includes(value.rules.drift as string) && value.rules.sections.length !== 0)
    || (value.rules.drift === 'equal' && (value.rules.blocks.length === 0 || value.rules.blocks.some(b => b.drift !== 'equal')))
    || (value.rules.drift === 'drift' && !value.rules.blocks.some(b => b.drift === 'drift'))) return invalid();
  const sectionIds = new Set<number>();
  for (const section of value.rules.sections) {
    if (!exact(section, ['section_id', 'heading', 'scope', 'agents', 'claude']) || typeof section.heading !== 'string' || !safeText(section.heading)
      || !Number.isSafeInteger(section.section_id) || (section.section_id as number) < 1 || (section.section_id as number) > MAX_ITEMS || sectionIds.has(section.section_id as number)
      || !['not-declared', 'host-specific'].includes(section.scope as string) || !safeText(section.agents) || !safeText(section.claude)
      || (section.scope === 'host-specific') !== hostSection(section.heading) || (section.agents === null && section.claude === null)) return invalid();
    sectionIds.add(section.section_id as number);
  }
  const ancestors = new Set<object>();
  let remainingNodes = 8192;
  const policyValue = (item: unknown, depth = 0): boolean => {
    if (depth > MAX_DEPTH + 1 || --remainingNodes < 0) return false;
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return true;
    if (typeof item === 'string') return safeText(item);
    if (!object(item) && !Array.isArray(item)) return false;
    if (ancestors.has(item) || Object.keys(item).length > MAX_ITEMS || (Array.isArray(item) && item.length > MAX_ITEMS)) return false;
    ancestors.add(item);
    try {
      return Array.isArray(item) ? item.every(v => policyValue(v, depth + 1)) : Object.entries(item).every(([key, child]) => safeText(key)
        && (SENSITIVE_NAME.test(key) ? child === 'configured' || child === 'missing' : policyValue(child, depth + 1)));
    } finally { ancestors.delete(item); }
  };
  if (!policyValue(value.policy) || bytes(JSON.stringify(value)) > AGENT_CONFIG_CORE_MAX_BYTES * 3) return invalid();
  return structuredClone(value) as unknown as AgentConfigCoreProjection;
}
/** Create a display projection from caller-supplied data; it grants no execution authority. */
export function projectAgentConfigCore(input: { readonly agents: string | null; readonly claude: string | null; readonly policy: unknown }): AgentConfigCoreProjection {
  let fields: PropertyDescriptorMap;
  try {
    if (!object(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return invalid();
    fields = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(fields).length !== 3 || !['agents', 'claude', 'policy'].every(key => {
      const field = fields[key]; return field && 'value' in field && field.enumerable;
    })) return invalid();
  } catch { return invalid(); }
  const agents: unknown = fields.agents!.value, claude: unknown = fields.claude!.value;
  if ((agents !== null && typeof agents !== 'string') || (claude !== null && typeof claude !== 'string')) return invalid();
  return decodeAgentConfigCoreProjection({ protocol: 1, kind: 'agent_config_core_projection',
    rules: compareAgentRules(agents, claude), policy: projectAgentConfigPolicy(fields.policy!.value) });
}
