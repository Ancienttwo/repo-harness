export type PaneOption = 'done' | 'stuck' | 'model_error' | 'quota' | 'unclear';
export interface PaneState { agent: 'claude' | 'codex' | 'pi'; herdr_status: 'done'; pane_title: string; tail_lines: number; tail_truncated: boolean; tail: string }
export type ClefAnswer = { status: 'invalid' } | { status: 'ok'; choice: PaneOption; probabilities: Record<PaneOption, number>; confidence: number; input_tokens: number; evidence: Record<string, number> };
export declare const POLICY_VERSION: string;
export declare const OPTIONS: readonly PaneOption[];
export declare const POLICY: { readonly review: number; readonly shadow: number; readonly labels: Readonly<Record<'stuck' | 'model_error' | 'quota', { readonly suggest: null; readonly apply: null }>>; readonly escalate: readonly string[] };
export declare function paneStatusRequest(state: PaneState, model?: 'clef-flash' | 'clef'): { model: string; state: PaneState; questions: Record<string, unknown> };
export declare function decodeClefAnswer(value: unknown, model?: string): ClefAnswer;
export declare function decisionBand(answer: ClefAnswer, mode?: 'shadow' | 'suggest' | 'apply'): 'act' | 'review' | 'abstain';
