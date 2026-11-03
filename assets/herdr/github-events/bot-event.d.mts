export declare const BOT_EVENT_PROTOCOL: 'repo-harness.bot-event/v1';
export declare const NAME_PATTERN: RegExp;
export interface BotEvent {
  readonly protocol: 'repo-harness.bot-event/v1';
  readonly source: 'herdr' | 'github';
  readonly repository: string | null;
  readonly kind: string;
  readonly ts: string;
  readonly data: Readonly<Record<string, unknown>>;
}
export declare function assertBotEvent(value: unknown): BotEvent;
export declare function botEvent(input: Omit<BotEvent, 'protocol'>): BotEvent;
