import { isOperatorMessageKey, relativeAge, type OperatorTranslate } from './i18n';
import type { VerifiedTask } from './repository-reads';

/** A server enum outside the dictionary renders as its own text, never as an invented label. */
export function enumLabel(key: string, fallback: string, t: OperatorTranslate): string {
  return isOperatorMessageKey(key) ? t(key) : fallback;
}

/** The agent of the first verified session, and how many more share the item's branch. */
export function ownerAgents(tasks: readonly VerifiedTask[], t: OperatorTranslate): string {
  const name = t(`setup.host.${tasks[0]!.agent}`);
  return tasks.length > 1 ? `${name} +${tasks.length - 1}` : name;
}

/** "3 h", without the "observed … ago" frame. */
export function ageWords(at: string, now: number, t: OperatorTranslate): string {
  const age = relativeAge(at, now);
  return age ? t(age.key, { count: age.count }) : t('status.observedUnknown');
}
