import { useCallback, useState } from 'react';
import { decodeSetupSnapshot } from '../core/setup/decode';
import type {
  SetupCheck,
  SetupHost,
  SetupHostFacts,
  SetupSkill,
  SetupSkillHostRow,
  SetupSnapshotV1,
} from '../core/setup/types';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of `GET /api/v1/setup`. The server runs `repo-harness setup
 * check` in the background and caches its result; this module only reads and
 * orders what that result already decided. It never runs a command.
 */
export type SetupReader = (signal: AbortSignal) => Promise<SetupSnapshotV1>;

/** The one command that produces everything these pages show. */
export const SETUP_CHECK_COMMAND = 'repo-harness setup check';

export async function fetchSetup(signal: AbortSignal): Promise<SetupSnapshotV1> {
  const response = await fetch('/api/v1/setup', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('setup_unavailable');
  return decodeSetupSnapshot(await response.json());
}

/** A failed refresh keeps the last good snapshot and says so. */
export type SetupView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'ready'; readonly snapshot: SetupSnapshotV1; readonly refreshFailed: boolean };

/** Reads only while a setup page is shown; a return to the page reads at once. */
export function useSetup(read: SetupReader, initial: SetupSnapshotV1 | undefined, generation: number, enabled: boolean): SetupView {
  const [view, setView] = useState<SetupView>(() => initial ? { kind: 'ready', snapshot: initial, refreshFailed: false } : { kind: 'loading' });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    try {
      const snapshot = await read(signal);
      if (signal.aborted) return false;
      setView({ kind: 'ready', snapshot, refreshFailed: false });
      return true;
    } catch {
      if (signal.aborted) return false;
      setView(current => current.kind === 'ready' ? { ...current, refreshFailed: true } : { kind: 'unreachable' });
      return false;
    }
  }, [read]);
  useObservationRefresh(observe, JSON.stringify(['setup', generation]), { enabled, immediate: initial === undefined || generation > 0 });
  return view;
}

/** What a setup page can show: a wait, a failure, or data (possibly old). */
export type SetupPageState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly reason: 'unreachable' | Exclude<SetupSnapshotV1['reason'], null> }
  | { readonly kind: 'data'; readonly snapshot: SetupSnapshotV1; readonly refreshFailed: boolean };

export function setupPageState(view: SetupView): SetupPageState {
  if (view.kind === 'loading') return { kind: 'pending' };
  if (view.kind === 'unreachable') return { kind: 'failed', reason: 'unreachable' };
  const { snapshot } = view;
  if (snapshot.status === 'unavailable') {
    return snapshot.reason === 'collection_pending' || snapshot.reason === null ? { kind: 'pending' } : { kind: 'failed', reason: snapshot.reason };
  }
  return { kind: 'data', snapshot, refreshFailed: view.refreshFailed };
}

const CHECK_RANK: Readonly<Record<SetupCheck['status'], number>> = { fail: 0, needs_agent: 1, warn: 2 };

/** Failures first, then agent work, then warnings; setup check order within each. */
export function orderChecks(checks: readonly SetupCheck[]): readonly SetupCheck[] {
  return checks.map((check, index) => ({ check, index }))
    .sort((left, right) => CHECK_RANK[left.check.status] - CHECK_RANK[right.check.status] || left.index - right.index)
    .map(entry => entry.check);
}

export function skillAbnormal(skill: SetupSkill): boolean {
  return Object.values(skill.hosts).some(row => row !== null && !row.ok);
}

/** Abnormal skills first; setup check order within each group. */
export function orderSkills(skills: readonly SetupSkill[]): readonly SetupSkill[] {
  return skills.filter(skillAbnormal).concat(skills.filter(skill => !skillAbnormal(skill)));
}

/**
 * The words for one host row. An ok state that is not ok means the install
 * ledger records drift for that skill; every other state is setup check's own.
 */
export type SkillCell = 'not_expected' | 'drift' | SetupSkillHostRow['state'];

export function skillCell(row: SetupSkillHostRow | null): SkillCell {
  if (row === null) return 'not_expected';
  if (!row.ok && row.state.startsWith('ok ')) return 'drift';
  return row.state;
}

/** The setup check whose command repairs this host's adapter, when one carries a command. */
export function hostCommand(checks: readonly SetupCheck[], host: SetupHost): SetupCheck | null {
  return checks.find(check => check.command !== null && (check.id === `status.adapter.${host}` || check.id === `doctor.${host}-adapter`)) ?? null;
}

export type HostSentence =
  | { readonly kind: 'not_reported' }
  | { readonly kind: 'not_detected' }
  | { readonly kind: 'not_inspected' }
  | { readonly kind: 'not_configured'; readonly managed: number; readonly expected: number }
  | { readonly kind: 'connected'; readonly managed: number; readonly expected: number; readonly projection: 'consistent' | 'drift' | null; readonly mismatches: number };

/** One plain sentence per host, from the status report only. Nothing is inferred for an unreported host. */
export function hostSentence(host: SetupHostFacts): HostSentence {
  if (!host.reported) return { kind: 'not_reported' };
  if (host.detected === false) return { kind: 'not_detected' };
  const adapter = host.adapter;
  if (adapter === null) return { kind: 'not_inspected' };
  if (!adapter.configured) return { kind: 'not_configured', managed: adapter.managed_entries, expected: adapter.expected_entries };
  return { kind: 'connected', managed: adapter.managed_entries, expected: adapter.expected_entries, projection: adapter.projection, mismatches: adapter.mismatches.length };
}
