import { useCallback, useRef, useState } from 'react';
import { ADVISOR_BOSS_COMMAND_TABLE, decodeAdvisorSeatSend, type AdvisorBossCommand, type AdvisorBossCommandRequestV1 } from '../core/board/advisor-seat';
import { postOperatorWrite, type OperatorWriteFailure } from './operator-write';

/**
 * Browser side of `POST /api/v1/seats/advisor/boss-commands` (#1757). The web
 * sends the command id; the server owns the text, the cooldown and the turn
 * lock. The cooldown stays in component memory only: a reload forgets it, and
 * the next refusal states it again.
 */
const BOSS_COMMANDS_PATH = '/api/v1/seats/advisor/boss-commands';

export type BossCommandPost = AdvisorBossCommandRequestV1 & { readonly request_id: string };
export type BossCommandWrite = { readonly state: 'sent' } | OperatorWriteFailure;
export type BossCommandWriter = (body: BossCommandPost) => Promise<BossCommandWrite>;

export const postBossCommand: BossCommandWriter = async (body) => {
  const answer = await postOperatorWrite(BOSS_COMMANDS_PATH, body, decodeAdvisorSeatSend);
  return answer.state === 'ok' ? { state: 'sent' } : answer;
};

/** A cooldown runs per command, so the answer keeps the command that it refused. */
export type BossNotice = Exclude<BossCommandWrite, { readonly state: 'sent' }> & { readonly command: AdvisorBossCommand };

export interface BossCommands {
  /** The time each cooldown ends, from the last server answer. */
  readonly cooldowns: Partial<Readonly<Record<AdvisorBossCommand, number>>>;
  readonly sending: boolean;
  readonly notice: BossNotice | null;
  /** The command the room plays, from a 200 answer. */
  readonly effect: { readonly command: AdvisorBossCommand; readonly at: number } | null;
  readonly send: (command: AdvisorBossCommand) => void;
}

export function useBossCommands(write: BossCommandWriter, repositoryId: string, parent: number | null): BossCommands {
  const [cooldowns, setCooldowns] = useState<BossCommands['cooldowns']>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<BossNotice | null>(null);
  const [effect, setEffect] = useState<BossCommands['effect']>(null);
  const inFlight = useRef(false);
  const send = useCallback((command: AdvisorBossCommand) => {
    if (parent === null || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setNotice(null);
    void write({ request_id: crypto.randomUUID(), repository_id: repositoryId, parent, command }).then((answer) => {
      inFlight.current = false;
      setSending(false);
      const now = Date.now();
      if (answer.state === 'sent') {
        setCooldowns(current => ({ ...current, [command]: now + ADVISOR_BOSS_COMMAND_TABLE[command].cooldown_seconds * 1000 }));
        setEffect({ command, at: now });
        return;
      }
      setNotice({ ...answer, command });
      if (answer.state === 'refused' && answer.retry_after_seconds !== undefined) {
        const seconds = answer.retry_after_seconds;
        setCooldowns(current => ({ ...current, [command]: now + seconds * 1000 }));
      }
    });
  }, [write, repositoryId, parent]);
  return { cooldowns, sending, notice, effect, send };
}
