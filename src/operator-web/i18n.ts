import { useCallback, useState } from 'react';

/**
 * The operator board ships its own dictionary instead of an i18n library: the
 * surface is one page, the key set is closed, and a third-party runtime would
 * add a dependency to a bundle that must stay auditable. `zh` is typed against
 * the `en` key set, so a missing translation is a typecheck failure rather than
 * a runtime fallback.
 */
export type OperatorLocale = 'en' | 'zh';

export const OPERATOR_LOCALES: readonly OperatorLocale[] = ['en', 'zh'];
export const DEFAULT_OPERATOR_LOCALE: OperatorLocale = 'en';
export const OPERATOR_LOCALE_STORAGE_KEY = 'repo-harness:operator-locale';

const en = {
  'app.subtitle': 'control board',
  'app.skipToWorklist': 'Skip to worklist',

  'status.observedAgo': 'observed {age} ago',
  'status.observedUnknown': 'observation time unavailable',
  'status.sequence': 'seq',
  'status.consistency': 'consistency',
  'status.consistency.stable': 'stable',
  'status.consistency.changed_during_read': 'changed during read',
  'status.consistency.degraded': 'degraded',
  'status.repositories': '{count} repos',
  'status.unreadable': '{count} unreadable',
  'status.refresh': 'Refresh',
  'status.refreshing': 'Refreshing',
  'status.stale': 'stale data',
  'status.language': 'Language',
  'status.languageEnglish': 'EN',
  'status.languageChinese': '中',

  'age.seconds': '{count}s',
  'age.minutes': '{count}m',
  'age.hours': '{count}h',
  'age.days': '{count}d',

  'worklist.title': 'Worklist',
  'worklist.filters': 'Worklist filters',
  'worklist.filterAll': 'All',
  'worklist.empty': 'Nothing in this snapshot needs a decision.',
  'worklist.groupEmpty': 'No tasks in this group.',
  'worklist.expand': 'Expand {group}',
  'worklist.collapse': 'Collapse {group}',

  'group.needs_you': 'Needs you',
  'group.ready_to_merge': 'Ready to merge',
  'group.unreadable': 'Unreadable repos',
  'group.unclassified': 'Unclassified',
  'group.agent_working': 'Agent working',
  'group.external': 'External',
  'group.done': 'Done',

  'row.unread': '{count} unread',
  'row.feedback': '{count} feedback',
  'row.changedDuringRead': 'changed during read',
  'row.noProgress': 'no progress',
  'row.noCause': 'no blocker recorded',

  'attention.user': 'you',
  'attention.agent': 'agent',
  'attention.external': 'external',
  'attention.none': 'no attention',
  'attention.owned': '{owner} attention',

  'stage.available': 'available',
  'stage.working': 'working',
  'stage.in_review': 'in review',
  'stage.ready_to_merge': 'ready to merge',
  'stage.done': 'done',
  'stage.unclassified': 'unclassified',

  'lease.available': 'available',
  'lease.reserving': 'reserving',
  'lease.bound': 'bound',
  'lease.completing': 'completing',
  'lease.reviewing': 'reviewing',
  'lease.released': 'released',
  'lease.unknown': 'unknown',

  'execution.execution_ready': 'execution ready',
  'execution.planning_required': 'planning required',
  'execution.inline_ready': 'inline ready',
  'execution.unsupported': 'unsupported',

  'detail.overviewTitle': 'Fleet overview',
  'detail.overviewHint': 'Select a task to see why it needs a decision.',
  'detail.matrixTitle': 'Tasks by repository and stage',
  'detail.matrixRepository': 'repository',
  'detail.repositoryHealth': 'Repository health',
  'detail.taskDetail': 'Task detail',
  'detail.close': 'Close task details',
  'detail.revisionChanged': 'Task definition changed since last snapshot',
  'detail.revisionChangedBody': 'The row is still on the board; its revision moved from {previous} to {current}.',
  'detail.cause': 'Why this is here',
  'detail.causeEmpty': 'No blocker, no stalled feedback, and no unread message in this snapshot.',
  'detail.blockerOwner': '{owner} owns this',
  'detail.noProgressTitle': 'Feedback reports no progress',
  'detail.noProgressBody': 'Fleet marked this task as not progressing. The snapshot carries the flag only, not how long it has been stalled.',
  'detail.repairTitle': 'Recovery paths recorded by Fleet',
  'detail.identity': 'Identity and lease',
  'detail.signals': 'Signals',
  'detail.signalFeedback': 'feedback',
  'detail.signalInbox': 'inbox',
  'detail.signalBlockers': 'blockers',
  'detail.changedDuringRead': 'This task changed while the snapshot was read. Re-observe before acting.',

  'field.taskId': 'task id',
  'field.repository': 'repository',
  'field.revision': 'revision',
  'field.claim': 'claim',
  'field.generation': 'generation',
  'field.lease': 'lease',
  'field.execution': 'execution',
  'field.publication': 'publication',
  'field.headSha': 'head sha',
  'field.notClaimed': 'not claimed',
  'field.notApplicable': 'not applicable',
  'field.none': '—',

  'copy.action': 'Copy {label}',
  'copy.idle': 'Copy',
  'copy.copied': 'Copied',
  'copy.failed': 'Copy failed',
  'copy.copiedStatus': '{label} copied',
  'copy.failedStatus': '{label} could not be copied',
  'copy.missing': 'No {label} recorded',

  'repo.accessMode.read_only': 'read only',
  'repo.accessMode.read_write': 'read write',
  'repo.status.unreadable': 'unreadable',
  'repo.tasks': '{count} tasks',

  'blocker.receipt_unavailable': 'The publication receipt cannot be read',
  'blocker.publication_claim_mismatch': 'The lease on this task is not the one the receipt was written for',
  'blocker.publication_pointer_mismatch': 'The publication pointer no longer points at this receipt',
  'blocker.lease_not_reviewing': 'The lease is not in the reviewing state',
  'blocker.provider_unavailable': 'The Git provider could not be read',
  'blocker.provider_data_incomplete': 'The provider returned incomplete data',
  'blocker.changed_during_read': 'The publication changed while it was being read',
  'blocker.pr_not_open': 'The pull request is not open',
  'blocker.draft': 'The pull request is still a draft',
  'blocker.head_moved': 'The head commit moved after verification',
  'blocker.base_moved_since_verification': 'The base branch moved after verification',
  'blocker.review_subject_mismatch': 'The reviewed subject does not match the receipt',
  'blocker.verification_evidence_stale': 'The verification evidence is stale or does not match the receipt',
  'blocker.checks_failed': 'Required checks failed',
  'blocker.checks_pending': 'Checks are still running',
  'blocker.acceptance_missing': 'No acceptance record',
  'blocker.required_reviews_missing': 'Required reviews are missing',
  'blocker.changes_requested': 'A reviewer requested changes',
  'blocker.unresolved_threads': 'Review threads are still unresolved',
  'blocker.not_mergeable': 'The branch conflicts with its base',
  'blocker.task_revision_mismatch': 'The canonical task revision does not match the receipt',
  'blocker.already_integrated': 'The change is already integrated into the base',

  'repair.resume_same_owner': 'Resume with the same owner.',
  'repair.explicit_takeover': 'Take the task over explicitly.',

  'notice.loadingTitle': 'Reading Fleet authority',
  'notice.loadingBody': 'Collecting one bounded snapshot from adopted repositories.',
  'notice.staleTitle': 'Showing the last successful snapshot',
  'notice.changedTitle': 'Snapshot changed during read',
  'notice.changedBody': 'Some task facts moved while Fleet authority was observed. Review the source before acting.',
  'notice.degradedTitle': 'One or more repositories are degraded',
  'notice.degradedBody': 'Fleet remains readable; the affected repository row carries its typed recovery message.',
  'notice.retry': 'Retry',

  'empty.eyebrow': 'no adopted repositories',
  'empty.title': 'The Fleet is quiet.',
  'empty.body': 'Adopt a repository, then refresh this local board to observe its authoritative task state.',
  'fatal.eyebrow': 'authority boundary',
  'fatal.title': 'Fleet snapshot unavailable',
  'fatal.retry': 'Retry observation',

  'footer.protocol': 'protocol {protocol} · sequence {sequence}',
} as const;

export type OperatorMessageKey = keyof typeof en;

const zh: Readonly<Record<OperatorMessageKey, string>> = {
  'app.subtitle': '控制台',
  'app.skipToWorklist': '跳到工作队列',

  'status.observedAgo': '{age}前读到的快照',
  'status.observedUnknown': '读不到观测时间',
  'status.sequence': '序号',
  'status.consistency': '一致性',
  'status.consistency.stable': '稳定',
  'status.consistency.changed_during_read': '读取期间有变化',
  'status.consistency.degraded': '降级',
  'status.repositories': '{count} 个仓库',
  'status.unreadable': '{count} 个读不到',
  'status.refresh': '刷新',
  'status.refreshing': '刷新中',
  'status.stale': '数据已过期',
  'status.language': '语言',
  'status.languageEnglish': 'EN',
  'status.languageChinese': '中',

  'age.seconds': '{count} 秒',
  'age.minutes': '{count} 分钟',
  'age.hours': '{count} 小时',
  'age.days': '{count} 天',

  'worklist.title': '工作队列',
  'worklist.filters': '队列筛选',
  'worklist.filterAll': '全部',
  'worklist.empty': '这份快照里没有需要你决定的事。',
  'worklist.groupEmpty': '这一组没有任务。',
  'worklist.expand': '展开{group}',
  'worklist.collapse': '收起{group}',

  'group.needs_you': '需要你',
  'group.ready_to_merge': '可以合并',
  'group.unreadable': '读不到的仓库',
  'group.unclassified': '未分类',
  'group.agent_working': 'agent 在做',
  'group.external': '等外部',
  'group.done': '已完成',

  'row.unread': '{count} 条未读',
  'row.feedback': '{count} 条反馈',
  'row.changedDuringRead': '读取期间有变化',
  'row.noProgress': '没有进展',
  'row.noCause': '没有记录到阻塞',

  'attention.user': '你',
  'attention.agent': 'agent',
  'attention.external': '外部',
  'attention.none': '不需要处理',
  'attention.owned': '{owner}要处理',

  'stage.available': '待认领',
  'stage.working': '进行中',
  'stage.in_review': '审查中',
  'stage.ready_to_merge': '可以合并',
  'stage.done': '已完成',
  'stage.unclassified': '未分类',

  'lease.available': '空闲',
  'lease.reserving': '预留中',
  'lease.bound': '已绑定',
  'lease.completing': '收尾中',
  'lease.reviewing': '审查中',
  'lease.released': '已释放',
  'lease.unknown': '未知',

  'execution.execution_ready': '可以执行',
  'execution.planning_required': '要先规划',
  'execution.inline_ready': '可内联执行',
  'execution.unsupported': '不支持',

  'detail.overviewTitle': '舰队总览',
  'detail.overviewHint': '选一个任务，看它为什么排在这里。',
  'detail.matrixTitle': '各仓库按阶段的任务数',
  'detail.matrixRepository': '仓库',
  'detail.repositoryHealth': '仓库健康',
  'detail.taskDetail': '任务详情',
  'detail.close': '关闭任务详情',
  'detail.revisionChanged': '任务定义在上一次快照之后变过',
  'detail.revisionChangedBody': '这一行还在板上，revision 从 {previous} 变成了 {current}。',
  'detail.cause': '它为什么在这里',
  'detail.causeEmpty': '这份快照里没有阻塞、没有停滞反馈，也没有未读消息。',
  'detail.blockerOwner': '归{owner}处理',
  'detail.noProgressTitle': '反馈显示没有进展',
  'detail.noProgressBody': 'Fleet 把这个任务标成没有进展。快照只带这个标记，不带停了多久。',
  'detail.repairTitle': 'Fleet 记录的恢复路径',
  'detail.identity': '身份与租约',
  'detail.signals': '信号',
  'detail.signalFeedback': '反馈',
  'detail.signalInbox': '信箱',
  'detail.signalBlockers': '阻塞',
  'detail.changedDuringRead': '读快照的时候这个任务变过。动手之前先重新读一次。',

  'field.taskId': '任务 id',
  'field.repository': '仓库',
  'field.revision': 'revision',
  'field.claim': 'claim',
  'field.generation': 'generation',
  'field.lease': '租约',
  'field.execution': '执行',
  'field.publication': '发布',
  'field.headSha': 'head sha',
  'field.notClaimed': '没有认领',
  'field.notApplicable': '不适用',
  'field.none': '—',

  'copy.action': '复制{label}',
  'copy.idle': '复制',
  'copy.copied': '已复制',
  'copy.failed': '复制失败',
  'copy.copiedStatus': '{label}已复制',
  'copy.failedStatus': '{label}没能复制',
  'copy.missing': '没有记录{label}',

  'repo.accessMode.read_only': '只读',
  'repo.accessMode.read_write': '可读写',
  'repo.status.unreadable': '读不到',
  'repo.tasks': '{count} 个任务',

  'blocker.receipt_unavailable': '读不到发布回执',
  'blocker.publication_claim_mismatch': '当前租约不是回执登记的那一个',
  'blocker.publication_pointer_mismatch': '发布指针已经不指向这份回执',
  'blocker.lease_not_reviewing': '租约不在 reviewing 状态',
  'blocker.provider_unavailable': '读不到 Git provider',
  'blocker.provider_data_incomplete': 'provider 返回的数据不完整',
  'blocker.changed_during_read': '读取期间发布状态变过',
  'blocker.pr_not_open': 'PR 不是 open 状态',
  'blocker.draft': 'PR 还是草稿',
  'blocker.head_moved': '验证之后 head commit 动过',
  'blocker.base_moved_since_verification': '验证之后 base 分支动过',
  'blocker.review_subject_mismatch': '审查的对象和回执对不上',
  'blocker.verification_evidence_stale': '验证证据过期，或者和回执对不上',
  'blocker.checks_failed': '必需的检查没过',
  'blocker.checks_pending': '检查还在跑',
  'blocker.acceptance_missing': '缺验收记录',
  'blocker.required_reviews_missing': '还缺必需的 review',
  'blocker.changes_requested': 'reviewer 要求改动',
  'blocker.unresolved_threads': '还有没解决的审查讨论',
  'blocker.not_mergeable': '分支和 base 有冲突',
  'blocker.task_revision_mismatch': '任务的 revision 和回执对不上',
  'blocker.already_integrated': '改动已经进了 base',

  'repair.resume_same_owner': '让原来的 owner 接着做。',
  'repair.explicit_takeover': '显式接管这个任务。',

  'notice.loadingTitle': '正在读 Fleet 权威',
  'notice.loadingBody': '从已接入的仓库收一份有边界的快照。',
  'notice.staleTitle': '显示的是上一次成功的快照',
  'notice.changedTitle': '快照在读取期间变过',
  'notice.changedBody': '读 Fleet 权威的时候有任务事实在动。动手之前先看源头。',
  'notice.degradedTitle': '有仓库处于降级状态',
  'notice.degradedBody': 'Fleet 还能读；受影响的仓库那一行带着自己的恢复提示。',
  'notice.retry': '重试',

  'empty.eyebrow': '没有已接入的仓库',
  'empty.title': 'Fleet 是空的。',
  'empty.body': '先接入一个仓库，再刷新这块本地板子，就能看到它的权威任务状态。',
  'fatal.eyebrow': '权威边界',
  'fatal.title': '读不到 Fleet 快照',
  'fatal.retry': '重新读一次',

  'footer.protocol': '协议 {protocol} · 序号 {sequence}',
};

const dictionaries: Readonly<Record<OperatorLocale, Readonly<Record<OperatorMessageKey, string>>>> = {
  en,
  zh,
};

export type OperatorMessageParams = Readonly<Record<string, string | number>>;

/** Substitution is positional-free and total: an unknown placeholder stays literal. */
export function translate(
  locale: OperatorLocale,
  key: OperatorMessageKey,
  params?: OperatorMessageParams,
): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replaceAll(/\{(\w+)\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export type OperatorTranslate = (key: OperatorMessageKey, params?: OperatorMessageParams) => string;

export function isOperatorLocale(value: unknown): value is OperatorLocale {
  return value === 'en' || value === 'zh';
}

/** `zh-CN`, `zh-Hant`, and bare `zh` all resolve to the Chinese dictionary. */
export function localeFromNavigatorLanguage(language: string | null | undefined): OperatorLocale | null {
  if (typeof language !== 'string') return null;
  const primary = language.trim().toLowerCase().split('-')[0];
  if (primary === 'zh') return 'zh';
  if (primary === 'en') return 'en';
  return null;
}

function localStorageOrNull(): Storage | null {
  try {
    const scope = globalThis as { localStorage?: Storage; window?: { localStorage?: Storage } };
    return scope.localStorage ?? scope.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function navigatorLanguage(): string | null {
  try {
    const scope = globalThis as { navigator?: { language?: string } };
    return scope.navigator?.language ?? null;
  } catch {
    return null;
  }
}

export function readStoredLocale(storage: Storage | null = localStorageOrNull()): OperatorLocale | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(OPERATOR_LOCALE_STORAGE_KEY);
    return isOperatorLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(
  locale: OperatorLocale,
  storage: Storage | null = localStorageOrNull(),
): void {
  if (!storage) return;
  try {
    storage.setItem(OPERATOR_LOCALE_STORAGE_KEY, locale);
  } catch {
    // A blocked or full storage must never break the board.
  }
}

/** Stored choice wins over the browser language; both fail closed to `en`. */
export function resolveInitialLocale(options: {
  readonly stored?: OperatorLocale | null;
  readonly language?: string | null;
} = {}): OperatorLocale {
  const stored = options.stored === undefined ? readStoredLocale() : options.stored;
  if (stored) return stored;
  const language = options.language === undefined ? navigatorLanguage() : options.language;
  return localeFromNavigatorLanguage(language) ?? DEFAULT_OPERATOR_LOCALE;
}

export interface OperatorLocaleController {
  readonly locale: OperatorLocale;
  readonly setLocale: (locale: OperatorLocale) => void;
  readonly t: OperatorTranslate;
}

export function useLocale(initial?: OperatorLocale): OperatorLocaleController {
  const [locale, setLocaleState] = useState<OperatorLocale>(() => initial ?? resolveInitialLocale());
  const setLocale = useCallback((next: OperatorLocale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);
  const t = useCallback<OperatorTranslate>((key, params) => translate(locale, key, params), [locale]);
  return { locale, setLocale, t };
}

export interface RelativeAge {
  readonly key: Extract<OperatorMessageKey, `age.${string}`>;
  readonly count: number;
}

/**
 * Data age is computed in the browser from `observed_at`; the snapshot carries
 * no duration of its own, so nothing here is invented beyond the clock read.
 */
export function relativeAge(observedAt: string, now: number): RelativeAge | null {
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) return null;
  const seconds = Math.max(0, Math.floor((now - observed) / 1000));
  if (seconds < 60) return { key: 'age.seconds', count: seconds };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { key: 'age.minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'age.hours', count: hours };
  return { key: 'age.days', count: Math.floor(hours / 24) };
}

export function formatRelativeAge(observedAt: string, now: number, t: OperatorTranslate): string {
  const age = relativeAge(observedAt, now);
  if (!age) return t('status.observedUnknown');
  return t('status.observedAgo', { age: t(age.key, { count: age.count }) });
}
