// The one bot event envelope. Herdr notify and the GitHub event Worker both send it, so it
// stays plain ESM with no dependency and no Node-only API.
export const BOT_EVENT_PROTOCOL = 'repo-harness.bot-event/v1';
export const NAME_PATTERN = /^[\w.-]{1,128}$/;

const SOURCES = ['herdr', 'github'];
const KIND_PATTERN = /^[a-z]+(\.[a-z_]+)+$/;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function assertBotEvent(value) {
  const checks = [
    ['protocol', value?.protocol === BOT_EVENT_PROTOCOL],
    ['source', SOURCES.includes(value?.source)],
    ['repository', value?.repository === null || (typeof value?.repository === 'string' && NAME_PATTERN.test(value.repository))],
    ['kind', typeof value?.kind === 'string' && KIND_PATTERN.test(value.kind)],
    ['ts', isIsoTimestamp(value?.ts)],
    ['data', isPlainObject(value?.data)],
  ];
  const invalid = checks.find(([, valid]) => !valid);
  if (invalid) throw new Error(`invalid bot event: ${invalid[0]}`);
  return value;
}

export function botEvent({ source, repository, kind, ts, data }) {
  return assertBotEvent({ protocol: BOT_EVENT_PROTOCOL, source, repository, kind, ts, data });
}
