import { SEAT_ENV, isResetSeat } from './seat-reset';

/**
 * The reader trace of a seat comment: `Seat: <seat id> <hc address>`. The line only tells a reader which seat wrote the
 * comment (#2051). No decoder reads it and nothing is accepted or refused by it. A session without both env values adds nothing.
 */
export function withSeatLine(body: string, env: NodeJS.ProcessEnv = process.env): string {
  const seat = env[SEAT_ENV];
  const terminal = env.HC_TERMINAL_ID;
  return isResetSeat(seat) && terminal ? `${body}\nSeat: ${seat} ${terminal}` : body;
}
