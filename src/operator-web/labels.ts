import { isOperatorMessageKey, relativeAge, type OperatorTranslate } from './i18n';
import type { DotTone } from './ui';

/** A server enum outside the dictionary renders as its own text, never as an invented label. */
export function enumLabel(key: string, fallback: string, t: OperatorTranslate): string {
  return isOperatorMessageKey(key) ? t(key) : fallback;
}

export function runtimeStateLabel(state: string, t: OperatorTranslate): string {
  return state === 'settled' ? t('runtimeNative.settled') : enumLabel(`runtimeObservation.state.${state}`, state, t);
}

export function phaseLabel(phase: string, t: OperatorTranslate): string {
  return enumLabel(`pipeline.phase.${phase}`, phase, t);
}

/** Runtime states as a dot. Colour always sits next to the state's own words. */
export function runtimeTone(state: string | null): DotTone {
  if (state === 'working') return 'active';
  if (state === 'blocked') return 'warn';
  if (state === 'error') return 'danger';
  return 'neutral';
}

/** "3 h", without the "observed … ago" frame. */
export function ageWords(at: string, now: number, t: OperatorTranslate): string {
  const age = relativeAge(at, now);
  return age ? t(age.key, { count: age.count }) : t('status.observedUnknown');
}

/** Runtime block reasons are a closed vocabulary; ledger reasons are the record's own words. */
export function blockReasonLabel(block: { readonly source: 'ledger' | 'runtime'; readonly reason: string }, t: OperatorTranslate): string {
  return block.source === 'runtime' ? enumLabel(`runtimeObservation.reason.${block.reason}`, block.reason, t) : block.reason;
}
