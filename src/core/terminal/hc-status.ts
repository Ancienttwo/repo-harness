/**
 * The one reading of an hc status word (`status.state`, set by the program with OSC 7501). hc documents five
 * words: idle, working, done, blocked and error. `unreported`: the program never reported. `other`: a word
 * outside the hc docs, which no rule reads as one of the five. Core rules test the class, never the word (#1867).
 */
export type HcStatusClass = 'working' | 'blocked' | 'error' | 'done' | 'idle' | 'unreported' | 'other';

const DOCUMENTED: ReadonlySet<string> = new Set<HcStatusClass>(['working', 'blocked', 'error', 'done', 'idle']);

export function hcStatusClass(word: string | null): HcStatusClass {
  if (word === null) return 'unreported';
  return DOCUMENTED.has(word) ? word as HcStatusClass : 'other';
}
