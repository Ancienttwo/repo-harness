import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@cloudflare/kumo';
import { XIcon } from '@phosphor-icons/react';
import { ADVISOR_BOSS_COMMAND_TABLE, ADVISOR_BOSS_COMMANDS, advisorBossCommandText, advisorTurnState, type AdvisorBossCommand } from '../core/board/advisor-seat';
import { DESK_STATES, ISSUE_FLOW_WORKER_LIMIT, type DeskState } from '../core/board/desk';
import {
  officeCard, officeCardRank, officeLit, officeRepositoryView, officeTotals, useOfficeOverview,
  type BoardSummariesReader, type OfficeCard, type OfficeDesk, type OfficeFeedEvent, type OfficeLead, type OfficeRepositoryView, type OfficeRoom, type OfficeTotals,
} from './board-office';
import type { BoardParentsReader } from './board-view';
import type { BoardRepositoryOption } from './BoardPage';
import { useModalFocus } from './Drawer';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { OfficeAdvisorDialog, type AdvisorMessageWriter, type AdvisorTranscriptReader } from './OfficeAdvisorDialog';
import { OfficeSetupChecklist, officeSetupRows, officeToolingFails, type OfficeSetupReads } from './OfficeSetupChecklist';
import { useBossCommands, type BossCommands, type BossCommandWriter, type BossNotice } from './office-boss';
import { WriteReloadBanner } from './operator-write';
import { agentPortrait, bossPortrait, composeMiniRoom, composeRoom, deskOutfit, deskVignette, queueOutfit, sceneEffect, stageOutfit, type ScenePath } from './office-scene';
import { BOSS_ICONS, sceneAgent, type BossPose } from './office-sprites';
import type { ThemeMode } from './theme';
import { Age, CopyButton, PageLink } from './ui';
import { boardHomeLocation, boardLocation, boardRoomLocation, type BoardLayout, type BoardPlace, type WorkspaceLocation } from './workspace-location';
import './board-office.css';

const stateName = (state: DeskState, t: OperatorTranslate) => t(`board.office.state.${state}` as OperatorMessageKey);

function Paths({ paths }: { readonly paths: readonly ScenePath[] }) {
  return <>{paths.map(path => <path key={path.color} d={path.d} fill={`var(--px-${path.color})`} />)}</>;
}

function LegendDesk({ state }: { readonly state: DeskState }) {
  const { width, height, paths } = deskVignette(state, sceneAgent('claude-code'), 0);
  return <svg className="board-office__vignette" viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" aria-hidden="true"><Paths paths={paths} /></svg>;
}

function LegendDialog({ onClose, t }: { readonly onClose: () => void; readonly t: OperatorTranslate }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useModalFocus({ dialogRef, closeRef, identity: 'board-office-legend', onClose });
  return (
    <>
      <button className="fixed inset-0 z-40 cursor-default bg-black/30" type="button" tabIndex={-1} aria-label={t('board.office.legend.close')} onClick={onClose} />
      <section ref={dialogRef} className="board-office board-office__legend" role="dialog" aria-modal="true" aria-labelledby="board-office-legend">
        <header>
          <h2 id="board-office-legend">{t('board.office.legend.title')}</h2>
          <button ref={closeRef} type="button" className="grid size-8 cursor-pointer place-items-center rounded-md text-kumo-subtle hover:bg-kumo-tint" aria-label={t('board.office.legend.close')} onClick={onClose}>
            <XIcon size={16} aria-hidden="true" />
          </button>
        </header>
        <ul>
          {DESK_STATES.map(state => (
            <li key={state} data-legend-state={state}>
              <LegendDesk state={state} />
              <strong>{stateName(state, t)}</strong>
              <p>{t(`board.office.state.${state}.rule` as OperatorMessageKey)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** The "Office / List" switch of the Board page header; it keeps the board and the drawer issue. */
export function BoardLayoutSwitch({ layout, place, onOpen, t }: {
  readonly layout: BoardLayout; readonly place: BoardPlace | null; readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const layouts: readonly BoardLayout[] = ['office', 'list'];
  return (
    <div className="flex shrink-0 gap-0.5 rounded-lg border border-kumo-line bg-kumo-base p-0.5" role="group" aria-label={t('board.office.layout')}>
      {layouts.map(id => (
        <button key={id} type="button" aria-pressed={layout === id} data-board-layout={id}
          className={cn('inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-sm', layout === id ? 'bg-kumo-tint text-kumo-strong' : 'text-kumo-subtle hover:text-kumo-default')}
          onClick={() => onOpen(place === null ? boardHomeLocation(id) : boardLocation({ ...place, layout: id }))}>
          {t(`board.office.layout.${id}`)}
        </button>
      ))}
    </div>
  );
}

function OfficeHeader({ heading, tools, place, onOpen, t }: {
  readonly heading: ReactNode; readonly tools?: ReactNode; readonly place: BoardPlace | null;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const [legend, setLegend] = useState(false);
  return (
    <header className="board-office__header">
      {heading}
      <BoardLayoutSwitch layout="office" place={place} onOpen={onOpen} t={t} />
      <div className="board-office__tools">
        {tools}
        <button type="button" className="board-office__legend-button" aria-haspopup="dialog" data-board-legend onClick={() => setLegend(true)}>{t('board.office.legend.open')}</button>
      </div>
      {legend && <LegendDialog onClose={() => setLegend(false)} t={t} />}
    </header>
  );
}

type StatTone = 'info' | 'warn' | 'danger' | 'accent' | 'subtle';

function OfficeStats({ totals, t }: { readonly totals: OfficeTotals; readonly t: OperatorTranslate }) {
  const stats: readonly (readonly [string, StatTone, string])[] = [
    ['rooms', 'subtle', t('board.office.total.rooms', { count: totals.rooms })],
    ['workers', 'info', t('board.office.total.workers', { count: totals.workers })],
    ['queue', 'warn', t('board.office.total.queue', { count: totals.queue })],
    ['ci', 'danger', t('board.office.total.ci', { count: totals.ci_failures })],
    ['needs-you', 'accent', t('board.office.total.needsYou', { count: totals.needs_you })],
    ...(totals.unread > 0 ? [['unread', 'subtle', t('board.office.total.unread', { count: totals.unread })] as const] : []),
  ];
  return <>{stats.map(([key, tone, text]) => <span key={key} className="board-office__stat" data-office-total={key} data-tone={tone}><span aria-hidden="true" />{text}</span>)}</>;
}

/** The chips of one room; a value the server did not send has no chip. */
function cardChips({ room, lit, summary }: OfficeCard, t: OperatorTranslate): readonly (readonly [string, StatTone | 'ok', string])[] {
  if (!lit) return [['idle', 'subtle', t('board.office.idle')]];
  const workers = room.desks.length;
  const seats = ['workers', 'subtle', t('board.office.card.workers', { count: workers })] as const;
  if (summary.status === 'not_read') return [seats, ['not-read', 'subtle', t('board.office.card.notRead')]];
  if (summary.status === 'unavailable') return [seats, ['unavailable', 'warn', t('board.office.card.summaryUnavailable')]];
  if (summary.status !== 'observed') return [seats];
  const { needs_you: needsYou, queue, ci_failures: failures, batch, current_batch: current, worker_limit: limit, seats: read } = summary.summary;
  const full = workers >= limit;
  const stalled = read.status === 'observed' ? read.stalled : 0;
  return [
    ...(needsYou > 0 ? [['needs-you', 'accent', t('board.office.card.needsYou', { count: needsYou })] as const] : []),
    read.status === 'unavailable' ? ['seats-unavailable', 'warn', t('board.office.card.seatsUnavailable', { reason: read.reason })] as const
      : batch.size === null ? ['workers', 'subtle', t('board.office.meter.noPlan', { count: workers })] as const
        : ['workers', full ? 'warn' : 'subtle', t(full ? 'board.office.card.full' : 'board.office.card.limit', { count: workers, limit })] as const,
    ...(queue > 0 ? [['queue', 'warn', t('board.office.card.queue', { count: queue })] as const] : []),
    ...(failures > 0 ? [['ci', 'danger', t('board.office.card.ci', { count: failures })] as const] : []),
    ...(stalled > 0 ? [['stalled', 'warn', t('board.office.card.stalled', { count: stalled })] as const] : []),
    ...(current !== null && current.accepted > 0 ? [['batch', 'ok', t('board.office.card.batch', { accepted: current.accepted, sockets: room.cart_sockets })] as const] : []),
  ];
}

function MiniRoom({ card, frame, mode }: { readonly card: OfficeCard; readonly frame: number; readonly mode: ThemeMode }) {
  const idle = !card.lit;
  const night = mode === 'dark' || idle;
  const shown = idle ? 0 : frame;
  const paths = useMemo(() => {
    const { room, summary } = card;
    const observed = summary.status === 'observed' ? summary.summary : null;
    return composeMiniRoom({
      orchestrator: room.orchestrator === null ? null : sceneAgent(room.orchestrator.agent),
      advisor: room.advisor === null ? null : sceneAgent(room.advisor.agent),
      plan: observed !== null && observed.batch.size !== null,
      needsYou: observed !== null && observed.needs_you > 0,
      desks: room.desks.map(desk => ({ agent: sceneAgent(desk.agent), state: desk.state })),
      limit: observed?.worker_limit ?? null,
      queue: observed?.queue ?? 0,
      cart: observed?.current_batch?.accepted ?? 0,
      idle,
    }, { frame: shown, night });
  }, [card, idle, night, shown]);
  return <svg className="board-office__mini" data-night={night ? '' : undefined} viewBox="0 0 112 72" shapeRendering="crispEdges" aria-hidden="true"><Paths paths={paths} /></svg>;
}

function RepositoryCard({ repository, view, card, frame, mode, onOpen, t }: {
  readonly repository: BoardRepositoryOption; readonly view: OfficeRepositoryView; readonly card: OfficeCard | null; readonly frame: number; readonly mode: ThemeMode;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const name = <strong>{repository.label}</strong>;
  if (view.kind === 'loading') {
    return <div className="board-office__card" data-office-card="loading" data-repository={repository.id}><div className="board-office__mini" aria-hidden="true" /><div className="board-office__card-name">{name}<span>{t('board.office.card.loading')}</span></div></div>;
  }
  if (view.kind === 'failed') {
    return (
      <div className="board-office__card" role="group" aria-label={t('board.office.card.failed', { repository: repository.label })} data-office-card="failed" data-repository={repository.id} data-board-parents-reason={view.reason}>
        <div className="board-office__mini" aria-hidden="true" />
        <div className="board-office__card-name">{name}</div>
        <p className="board-office__card-reason">{t(`board.reason.${view.reason}` as OperatorMessageKey)}</p>
      </div>
    );
  }
  const room = card!;
  const chips = cardChips(room, t);
  const { summary, parent, lit } = room;
  const waiting = summary.status === 'observed' && summary.summary.needs_you > 0;
  const label = lit ? t('board.office.card.open', { repository: repository.label, chips: chips.map(([, , text]) => text).join(t('board.office.boss.separator')) })
    : t('board.office.card.idleLabel', { repository: repository.label });
  return (
    <button type="button" className="board-office__card" aria-label={label} data-office-card={lit ? 'room' : 'idle'} data-repository={repository.id} data-parent={parent ?? undefined} data-waiting={waiting ? '' : undefined}
      onClick={() => onOpen(boardRoomLocation(repository.id))}>
      <MiniRoom card={room} frame={frame} mode={mode} />
      <span className="board-office__card-name">{name}<span>{!lit ? t('board.office.noParent') : parent === null ? t('board.office.parent.none') : t('board.office.parent', { number: parent })}</span></span>
      <span className="board-office__card-chips">{chips.map(([key, tone, text]) => <span key={key} className="board-office__card-chip" data-office-chip={key} data-tone={tone}>{text}</span>)}</span>
    </button>
  );
}

/** The grid frame of the overview: slower than the room, as in the mockup. */
const OVERVIEW_FRAME_MS = 400;

/**
 * No board selected: one mini room per registered repository, from its seats
 * and the stored summary of its active parent. The overview reads no board.
 */
export function BoardOfficeOverview({ repositories, readParents, readSummaries, setup, generation, mode, onOpen, t }: {
  readonly repositories: readonly BoardRepositoryOption[]; readonly readParents: BoardParentsReader; readonly readSummaries: BoardSummariesReader; readonly setup: OfficeSetupReads; readonly generation: number;
  readonly mode: ThemeMode; readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const ids = useMemo(() => repositories.map(repository => repository.id), [repositories]);
  const views = useOfficeOverview(ids, readParents, readSummaries, generation);
  const { frame } = useClock(OVERVIEW_FRAME_MS);
  const rooms = useMemo(() => repositories.map((repository) => {
    const view = officeRepositoryView(views, repository.id);
    return { repository, view, card: view.kind === 'ready' ? officeCard(view) : null };
  }), [repositories, views]);
  const ordered = useMemo(() => [...rooms].sort((left, right) => officeCardRank(left.card) - officeCardRank(right.card)), [rooms]);
  const totals = useMemo(() => officeTotals(rooms.map(room => room.card)), [rooms]);
  const checklist = officeSetupRows(setup, { kind: 'overview', rooms }, t);
  const noRoomLit = rooms.every(room => room.view.kind !== 'loading') && !rooms.some(room => room.card?.lit === true);
  const mascot = t('board.office.mascot');
  const heading = (
    <>
      <span className="board-office__mascot" role="img" aria-label={mascot} title={mascot}>
        <svg viewBox="0 0 16 22" width="32" height="44" shapeRendering="crispEdges" aria-hidden="true" data-moved={frame % 4 < 2 ? '' : undefined}><Paths paths={bossPortrait('calm', frame % 12 === 0 ? 1 : 0)} /></svg>
      </span>
      <h1 id="board-office-title">{t('nav.board')}</h1>
    </>
  );
  return (
    <section className="board-office" data-board-office="overview" aria-labelledby="board-office-title">
      <OfficeHeader heading={heading} place={null} onOpen={onOpen} t={t} tools={repositories.length === 0 ? undefined : <OfficeStats totals={totals} t={t} />} />
      {repositories.length > 0 && <div className="board-office__cards">{ordered.map(({ repository, view, card }) => <RepositoryCard key={repository.id} repository={repository} view={view} card={card} frame={frame} mode={mode} onOpen={onOpen} t={t} />)}</div>}
      {setup.repositories.kind === 'loading' ? null : (noRoomLit || officeToolingFails(checklist)) && <OfficeSetupChecklist rows={checklist} t={t} />}
    </section>
  );
}

/** The grid frame of the idle loops: 4 per second, still under reduced motion. */
const FRAME_MS = 250;

function useClock(frameMs: number): { readonly frame: number; readonly now: number; readonly still: boolean } {
  const [clock, setClock] = useState(() => ({ frame: 0, now: Date.now() }));
  const [still] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const timer = setInterval(() => setClock(current => ({ frame: still ? 0 : current.frame + 1, now: Date.now() })), frameMs);
    return () => clearInterval(timer);
  }, [still, frameMs]);
  return { ...clock, still };
}

const clockText = (milliseconds: number): string => {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

function agentName(agent: string | null, t: OperatorTranslate): string {
  if (agent === null) return t('board.office.agent.unknown');
  return agent === 'claude-code' ? 'Claude Code' : agent === 'codex' ? 'Codex' : agent;
}

function deskNumber(desk: OfficeDesk, t: OperatorTranslate): string {
  if (desk.queued !== null) return t('board.office.desk.pr', { number: desk.queued });
  if (desk.issue !== null) return t('board.office.desk.issue', { number: desk.issue });
  if (desk.pr !== null) return t('board.office.desk.pr', { number: desk.pr });
  return t('board.office.desk.seat', { address: desk.address });
}

const deskKey = (desk: OfficeDesk): string => (desk.queued !== null ? `queue:${desk.queued}` : `desk:${desk.address}`);
const deskStateName = (desk: OfficeDesk, t: OperatorTranslate) => (desk.state === 'acceptance_queue' ? t('board.office.desk.away') : stateName(desk.state, t));

function SeatMeter({ room, idle, t }: { readonly room: OfficeRoom; readonly idle: boolean; readonly t: OperatorTranslate }) {
  const count = room.desks.length;
  const planned = room.plan.status === 'observed';
  const full = planned && count >= room.limit;
  const text = idle ? '—' : !planned ? t('board.office.meter.noPlan', { count }) : t(full ? 'board.office.meter.full' : 'board.office.meter', { count, limit: room.limit });
  return (
    <span className="board-office__meter" data-seat-meter={planned ? `${count}/${room.limit}` : 'none'} data-full={full ? '' : undefined}>
      <span className="board-office__meter-blocks" aria-hidden="true">
        {Array.from({ length: Math.max(ISSUE_FLOW_WORKER_LIMIT, room.limit, count) }, (_, index) => (
          <span key={index} data-used={index < count ? '' : undefined} data-open={index >= count && index < room.limit ? '' : undefined} />
        ))}
      </span>
      {text}
    </span>
  );
}

function BossIcon({ command }: { readonly command: AdvisorBossCommand }) {
  const { width, height, rects } = BOSS_ICONS[command];
  return (
    <svg width={width * 2} height={height * 2} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects.map(([x, y, w, h, fill], index) => <rect key={index} x={x} y={y} width={w} height={h} fill={fill} />)}
    </svg>
  );
}

const BOSS_SPRITE: Readonly<Record<AdvisorBossCommand, BossPose>> = { rage: 'stick', carrot: 'happy', mine: 'inspect', valve: 'valve' };
const cooldownMinutes = (command: AdvisorBossCommand) => ADVISOR_BOSS_COMMAND_TABLE[command].cooldown_seconds / 60;

function BossConfirm({ command, parent, frame, onCancel, onConfirm, t }: {
  readonly command: AdvisorBossCommand; readonly parent: number; readonly frame: number;
  readonly onCancel: () => void; readonly onConfirm: () => void; readonly t: OperatorTranslate;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useModalFocus({ dialogRef, closeRef: cancelRef, identity: `board-office-boss-${command}`, onClose: onCancel });
  const others = ADVISOR_BOSS_COMMANDS.filter(entry => entry !== command).map(entry => t(`board.office.boss.${entry}`)).join(t('board.office.boss.separator'));
  const rows: readonly (readonly [string, string])[] = [
    [t('board.office.boss.row.reply'), t(`board.office.boss.${command}.reply`)],
    [t('board.office.boss.row.not'), t(`board.office.boss.${command}.not`)],
    [t('board.office.boss.row.cooldown'), t('board.office.boss.cooldown', { minutes: cooldownMinutes(command) })],
    [t('board.office.boss.row.lock'), t('board.office.boss.lock', { others })],
    [t('board.office.boss.row.scope'), t('board.office.boss.scope', { parent })],
  ];
  return (
    <div className="board-office__overlay">
      <div ref={dialogRef} className="board-office__confirm" role="alertdialog" aria-modal="true" aria-labelledby="board-office-boss-title" data-boss-confirm={command}>
        <div className="board-office__confirm-head">
          <span className="board-office__confirm-sprite" aria-hidden="true">
            <svg viewBox="0 0 16 22" width="48" height="66" shapeRendering="crispEdges"><Paths paths={bossPortrait(BOSS_SPRITE[command], frame >> 1)} /></svg>
          </span>
          <h2 id="board-office-boss-title">{t(`board.office.boss.${command}.full`)}</h2>
        </div>
        <p className="board-office__confirm-text">{advisorBossCommandText(command, parent)}</p>
        <dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
        <div className="board-office__confirm-actions">
          <button ref={cancelRef} type="button" onClick={onCancel}>{t('board.office.boss.cancel')}</button>
          <button type="button" data-boss-confirm-send onClick={onConfirm}>{t(`board.office.boss.${command}.ok`)}</button>
        </div>
      </div>
    </div>
  );
}

function bossNoticeText(notice: Exclude<BossNotice, { readonly state: 'reload_required' }>, cooldownLeft: number, t: OperatorTranslate): string {
  if (notice.state !== 'refused') return t(`board.office.boss.notice.${notice.state}`);
  const { code, message, next_action: next } = notice.error;
  if (code === 'boss_cooldown') return t('board.office.boss.notice.boss_cooldown', { left: clockText(cooldownLeft) });
  if (code === 'advisor_turn_running' || code === 'advisor_turn_unknown' || code === 'repository_read_only') return t(`board.office.boss.notice.${code}`);
  return `${message} ${next}`;
}

/** The four boss commands of the room (#1757). The server answers every press; the lock greys the buttons from the advisor status. */
function BossButtons({ boss, turn, now, onPick, t }: {
  readonly boss: BossCommands; readonly turn: ReturnType<typeof advisorTurnState>; readonly now: number;
  readonly onPick: (command: AdvisorBossCommand) => void; readonly t: OperatorTranslate;
}) {
  return (
    <>
      {ADVISOR_BOSS_COMMANDS.map((command) => {
        const left = Math.max((boss.cooldowns[command] ?? 0) - now, 0);
        const name = t(`board.office.boss.${command}`);
        const locked = turn !== 'over' || boss.sending;
        const label = turn !== 'over' ? t(`board.office.boss.turn.${turn}`, { name }) : left > 0 ? `${name} ${clockText(left)}` : name;
        const aria = turn !== 'over' ? t(`board.office.boss.turn.${turn}`, { name }) : left > 0 ? t('board.office.boss.cooling', { name, left: clockText(left) }) : t(`board.office.boss.${command}.aria`);
        return (
          <button key={command} type="button" className="board-office__boss" data-boss={command} aria-label={aria} aria-disabled={locked || left > 0} title={t(`board.office.boss.${command}.hint`, { minutes: cooldownMinutes(command) })}
            onClick={() => { if (!locked && left === 0) onPick(command); }}>
            <BossIcon command={command} />
            <span>{label}</span>
          </button>
        );
      })}
    </>
  );
}

interface PanelView {
  readonly eyebrow: string;
  readonly title: string;
  readonly sub: string;
  /** Term, value, and the hit key that the value selects. */
  readonly rows: readonly (readonly [string, string, string?])[];
  /** Null when the command needs a value that no read observed. */
  readonly command: string | null;
  readonly portrait: readonly ScenePath[] | null;
  readonly issue: number | null;
}

/** What the door means now. The A1 findings set whether a pull request waits, and the policy sets who it waits for. */
function doorState(room: OfficeRoom, t: OperatorTranslate): string | null {
  return room.merge_policy === null ? null : t(`board.office.door.${room.merge_policy}.${room.merge_waits > 0 ? 'waiting' : 'quiet'}`);
}

function leadPanel(seat: 'orchestrator' | 'advisor', lead: OfficeLead, room: OfficeRoom, planText: string, command: string, frame: number, t: OperatorTranslate): PanelView {
  const seatRows = [[t('board.office.panel.seat'), lead.address], [t('board.office.panel.turn'), lead.status ?? t('board.office.panel.none')]] as const;
  return {
    eyebrow: seat === 'orchestrator' ? 'ORCHESTRATOR' : 'ADVISOR', title: t(`board.office.lead.${seat}`), sub: agentName(lead.agent, t),
    rows: seat === 'orchestrator'
      ? [[t('board.office.panel.role'), 'coordinator · integrator'], ...seatRows, [t('board.office.plan'), planText], [t('board.office.panel.limit'), String(room.limit)], [t('board.office.panel.queue'), String(room.queue.length)]]
      : [[t('board.office.panel.role'), t('board.office.panel.role.advisor')], ...seatRows],
    command, portrait: agentPortrait(sceneAgent(lead.agent), stageOutfit(seat), frame), issue: null,
  };
}

function panelView(key: string, room: OfficeRoom, parent: number | null, defaultBranch: string | null, planText: string, frame: number, t: OperatorTranslate): PanelView {
  const none = t('board.office.panel.none');
  const board = `repo-harness board --parent ${parent ?? '<n>'}`;
  const queueIndex = room.queue.findIndex(entry => key === `queue:${entry.pr}`);
  if (queueIndex >= 0) {
    const entry = room.queue[queueIndex]!;
    return {
      eyebrow: 'WORKER · QUEUE', title: `PR #${entry.pr} ${entry.title}`, sub: agentName(entry.agent, t),
      rows: [[t('board.office.panel.state'), t('board.office.panel.queue.state')], ['Issue', entry.issue === null ? none : `#${entry.issue}`], [t('board.office.panel.acceptance'), 'not_accepted'], [t('board.office.panel.seat'), t('board.office.panel.queue.seat')]],
      command: `gh pr view ${entry.pr}`, portrait: agentPortrait(sceneAgent(entry.agent), queueOutfit(queueIndex), frame), issue: entry.issue,
    };
  }
  const deskIndex = room.desks.findIndex(desk => key === `desk:${desk.address}`);
  if (deskIndex >= 0) {
    const desk = room.desks[deskIndex]!;
    const number = deskNumber(desk, t);
    return {
      eyebrow: `${desk.seat.toUpperCase()} · SEAT ${deskIndex + 1}`, title: desk.title === null ? number : `${number} ${desk.title}`, sub: agentName(desk.agent, t),
      rows: [
        [t('board.office.panel.state'), deskStateName(desk, t)], [t('board.office.panel.branch'), desk.branch ?? none],
        ['PR', desk.pr === null ? t('board.office.panel.noPr') : `#${desk.pr}`], [t('board.office.panel.source'), t(`board.office.source.${desk.state}` as OperatorMessageKey, { status: desk.status ?? none })],
      ],
      command: desk.pr !== null ? `gh pr checks ${desk.pr}` : desk.issue !== null ? `gh issue view ${desk.issue} --comments` : `hc read ${desk.address}`,
      portrait: agentPortrait(sceneAgent(desk.agent), deskOutfit(deskIndex), frame), issue: desk.drawerIssue,
    };
  }
  if (key === 'queue') {
    return {
      eyebrow: 'QUEUE', title: t('board.office.queue', { count: room.queue.length }), sub: t('board.office.panel.queue.sub'),
      rows: room.queue.map(entry => [`PR #${entry.pr}`, entry.title, `queue:${entry.pr}`] as const), command: 'gh pr list --state open', portrait: null, issue: null,
    };
  }
  const accepted = room.cart?.accepted ?? [];
  if (key === 'cart') {
    return {
      eyebrow: 'BATCH', title: t('board.office.panel.cart', { accepted: accepted.length, sockets: room.cart_sockets }), sub: t('board.office.panel.cart.sub'),
      rows: [...accepted.map(issue => [`#${issue}`, t('board.office.panel.accepted')] as const), [t('board.office.panel.cart.max'), t('board.office.panel.cart.prs', { count: room.cart_sockets })]],
      command: board, portrait: null, issue: null,
    };
  }
  if (key === 'door') {
    return {
      eyebrow: 'MAIN', title: t('board.office.panel.door'), sub: t('board.office.panel.door.sub'),
      rows: [
        [t('board.office.panel.state'), doorState(room, t) ?? none],
        [t('board.office.panel.door.mode'), room.merge_policy === null ? none : `acceptance_merge ${room.merge_policy}`],
        [t('board.office.panel.door.waits'), String(room.merge_waits)],
        [t('board.office.panel.door.next'), accepted.length === 0 ? none : accepted.map(issue => `#${issue}`).join(' ')],
      ],
      command: defaultBranch === null ? null : `gh pr list --base ${defaultBranch} --state merged --limit 5`, portrait: null, issue: null,
    };
  }
  if (key === 'tray') {
    const entries = [...room.holds.map(hold => [`#${hold.issue}`, t('board.office.hold', { reason: hold.reason })] as const), ...room.backlog.map(entry => [`#${entry.issue}`, entry.title] as const)];
    return {
      eyebrow: 'BACKLOG', title: t('board.office.panel.tray', { count: entries.length }), sub: t('board.office.panel.tray.sub'),
      rows: entries.length === 0 ? [[none, t('board.office.panel.tray.empty')]] : entries, command: board, portrait: null, issue: null,
    };
  }
  if (key === 'advisor' && room.advisor !== null) return leadPanel('advisor', room.advisor, room, planText, board, frame, t);
  if (room.orchestrator !== null) return leadPanel('orchestrator', room.orchestrator, room, planText, board, frame, t);
  return {
    eyebrow: 'ORCHESTRATOR', title: t('board.office.lead.orchestrator'), sub: t('board.office.panel.noOrchestrator'),
    rows: [[t('board.office.plan'), planText], [t('board.office.panel.limit'), t('board.office.panel.limit.issueFlow', { limit: room.limit })], [t('board.office.panel.queue'), String(room.queue.length)]],
    command: board, portrait: null, issue: null,
  };
}

function OfficePanel({ view, onIssue, onPick, onChat, t }: { readonly view: PanelView; readonly onIssue: (issue: number) => void; readonly onPick: (key: string) => void; readonly onChat: (() => void) | null; readonly t: OperatorTranslate }) {
  const { issue } = view;
  return (
    <section className="board-office__panel" data-office-panel={view.eyebrow}>
      <div className="board-office__panel-head">
        <span className="board-office__portrait" aria-hidden="true">
          {view.portrait !== null && <svg viewBox="0 0 26 26" width="52" height="52" shapeRendering="crispEdges"><Paths paths={view.portrait} /></svg>}
        </span>
        <div>
          <span className="board-office__eyebrow">{view.eyebrow}</span>
          <h2>{issue === null ? view.title : <button type="button" data-panel-issue={issue} onClick={() => onIssue(issue)}>{view.title}</button>}</h2>
          <span className="board-office__panel-sub">{view.sub}</span>
        </div>
      </div>
      <dl>{view.rows.map(([term, value, key]) => <div key={term}><dt>{term}</dt><dd>{key === undefined ? value : <button type="button" data-panel-pick={key} onClick={() => onPick(key)}>{value}</button>}</dd></div>)}</dl>
      {view.command === null
        ? <p className="board-office__command" data-command-gap>{t('board.office.panel.noBranch')}</p>
        : (
          <div className="board-office__command" data-command>
            <span aria-hidden="true">$</span>
            <code>{view.command}</code>
            <CopyButton label={t('copy.commandLabel')} value={view.command} t={t} className="board-office__copy" />
          </div>
        )}
      {onChat !== null && <button type="button" className="board-office__chat" data-advisor-chat onClick={onChat}>{t('board.office.advisor.chat')}</button>}
    </section>
  );
}

const FEED_TONE: Readonly<Record<OfficeFeedEvent['kind'], 'info' | 'warn' | 'ok' | 'danger' | 'subtle'>> = { plan: 'subtle', ci_failed: 'danger', queued: 'warn', accepted: 'ok' };

function feedText(event: OfficeFeedEvent, room: OfficeRoom, t: OperatorTranslate): string {
  if (event.kind === 'plan') return t('board.office.feed.plan');
  if (event.kind === 'ci_failed') return t('board.office.feed.ci_failed', { number: event.pr });
  if (event.kind === 'queued') return t('board.office.feed.queued', { number: event.pr });
  return event.carted ? t('board.office.feed.carted', { number: event.pr, accepted: room.cart?.accepted.length ?? 0, sockets: room.cart_sockets }) : t('board.office.feed.accepted', { number: event.pr });
}

function OfficeFeed({ room, lit, parent, t }: { readonly room: OfficeRoom; readonly lit: boolean; readonly parent: number | null; readonly t: OperatorTranslate }) {
  const empty = !lit ? t('board.office.feed.noSeats') : parent === null ? t('board.office.feed.noParent') : t('board.office.feed.none');
  return (
    <section className="board-office__panel board-office__feed" aria-labelledby="board-office-feed">
      <h3 id="board-office-feed">{t('board.office.feed')}</h3>
      {room.feed.length === 0
        ? <p data-feed-empty><span data-tone="subtle" />{empty}</p>
        : room.feed.map(event => <p key={`${event.kind}:${event.at}:${event.kind === 'plan' ? '' : event.pr}`} data-feed={event.kind}><span data-tone={FEED_TONE[event.kind]} />{feedText(event, room, t)}</p>)}
    </section>
  );
}

/**
 * One room is one repository (#1787): every live seat at a desk, the plan of
 * the active parent on the whiteboard, and the seat detail and feed beside the
 * scene. The scene follows the approved S0 mockup; an empty room stays
 * furnished and takes the night palette.
 */
export function BoardOfficeRoom({ repository, repositoryId, parent, defaultBranch, room, place, banners, setup, writeBoss, readAdvisor, writeAdvisor, mode, onOpen, now, t }: {
  readonly repository: string; readonly repositoryId: string; readonly parent: number | null; readonly defaultBranch: string | null;
  readonly room: OfficeRoom; readonly place: BoardPlace | null; readonly banners: ReactNode; readonly setup: ReactNode; readonly writeBoss: BossCommandWriter;
  readonly readAdvisor: AdvisorTranscriptReader; readonly writeAdvisor: AdvisorMessageWriter; readonly mode: ThemeMode;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const clock = useClock(FRAME_MS);
  const boss = useBossCommands(writeBoss, repositoryId, parent);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdvisorBossCommand | null>(null);
  const [chat, setChat] = useState(false);
  const canChat = room.advisor !== null && parent !== null;
  const lit = officeLit(room);
  const night = mode === 'dark' || !lit;
  const idle = !lit && parent === null;
  const { plan } = room;
  const name = repository.split('/').at(-1)!;
  const planText = plan.status !== 'observed' ? t('board.office.plan.none')
    : plan.revision === null ? t('board.office.plan.observed') : t('board.office.plan.revision', { revision: plan.revision });
  const effect = sceneEffect(boss.effect, clock.now, clock.still);
  const queueEntries = new Set(room.queue.map(entry => `queue:${entry.pr}`));
  const keys = new Set([...room.desks.map(deskKey), ...queueEntries, 'queue', 'door', 'tray', 'cart', ...(room.orchestrator === null ? [] : ['orchestrator']), ...(room.advisor === null ? [] : ['advisor'])]);
  const first = room.desks[0];
  const selected = picked !== null && keys.has(picked) ? picked : first !== undefined ? deskKey(first) : 'orchestrator';

  const scene = composeRoom({
    name, parent, lit,
    orchestrator: room.orchestrator === null ? null : sceneAgent(room.orchestrator.agent),
    advisor: room.advisor === null ? null : sceneAgent(room.advisor.agent),
    plan: plan.status === 'observed' ? { revision: plan.revision, order: plan.merge_order, limit: plan.worker_limit, batch: plan.batch } : null,
    limit: room.limit,
    desks: room.desks.map(desk => ({ key: deskKey(desk), agent: sceneAgent(desk.agent), state: desk.state, number: deskNumber(desk, t), label: deskStateName(desk, t) })),
    queue: room.queue.map(entry => ({ key: `queue:${entry.pr}`, agent: sceneAgent(entry.agent), pr: entry.pr })),
    cart: room.cart?.accepted.length ?? 0,
    tray: room.backlog.length + room.holds.length,
    mergeWait: room.merge_waits > 0 ? room.merge_policy : null,
    mines: new Map(room.desks.flatMap((desk) => {
      const rule = room.mines.get(desk.address);
      return rule === undefined ? [] : [[deskKey(desk), rule] as const];
    })),
    text: {
      noParent: t('board.office.noParent'),
      orchestrator: t('board.office.lead.orchestrator'),
      advisor: room.advisor === null ? t('board.office.lead.notConnected') : t('board.office.lead.advisor'),
      tray: t('board.office.backlog', { count: room.backlog.length + room.holds.length }),
      cart: t('board.office.cart', { accepted: room.cart?.accepted.length ?? 0, sockets: room.cart_sockets }),
      queue: t('board.office.queue', { count: room.queue.length }),
      seat: index => t('board.office.desk.number', { number: index + 1 }),
      free: t('board.office.desk.free'),
      roped: t('board.office.desk.roped'),
      mine: rule => t('board.office.boss.mine.tag', { rule }),
      say: command => t(`board.office.boss.${command}.say`),
    },
  }, {
    frame: clock.frame, night,
    advisorBusy: room.advisor !== null && advisorTurnState(room.advisor.status) === 'running',
    effect,
  });

  const hitLabel = (key: string): string => {
    if (key === 'board') return t('board.office.hit.board');
    if (key === 'queue') return t('board.office.queue', { count: room.queue.length });
    if (key === 'door') {
      const door = room.merge_waits > 0 ? t('board.office.door.marks', { count: room.merge_waits }) : t('board.office.door.none');
      const state = doorState(room, t);
      return state === null ? door : t('board.office.door.label', { door, state });
    }
    if (key === 'tray') return t('board.office.backlog', { count: room.backlog.length + room.holds.length });
    if (key === 'cart') return t('board.office.cart', { accepted: room.cart?.accepted.length ?? 0, sockets: room.cart_sockets });
    if (key === 'orchestrator' || key === 'advisor') return `${t(`board.office.lead.${key}`)} · ${agentName(room[key]!.agent, t)}`;
    const entry = room.queue.find(candidate => `queue:${candidate.pr}` === key);
    if (entry !== undefined) return t('board.office.queue.entry', { number: entry.pr, agent: agentName(entry.agent, t) });
    const desk = room.desks.find(candidate => deskKey(candidate) === key)!;
    return t('board.office.desk.label', { desk: deskNumber(desk, t), agent: agentName(desk.agent, t), state: deskStateName(desk, t) });
  };
  const hitData = (key: string) => {
    if (key.startsWith('desk:')) return { 'data-desk': key.slice('desk:'.length) };
    if (key.startsWith('queue:')) return { 'data-queue-pr': key.slice('queue:'.length) };
    return { 'data-office-hit': key };
  };
  const pick = (key: string) => {
    setPicked(key === 'board' ? (room.advisor === null ? 'orchestrator' : 'advisor') : key);
    if (key === 'advisor' && canChat) setChat(true);
  };
  const openIssue = (issue: number) => onOpen(boardLocation({ repository_id: repositoryId, parent: parent!, issue, layout: 'office' }));

  const heading = (
    <>
      <h1>{name}</h1>
      <span className="board-office__parent">{parent === null ? t('board.office.parent.none') : t('board.office.parent', { number: parent })}</span>
      {plan.status === 'observed'
        ? <span className="board-office__chip" data-plan="observed">{plan.revision === null ? <>{t('board.office.plan')} · <Age at={plan.created_at} now={now} t={t} bare /></> : t('board.office.plan.revision', { revision: plan.revision })}</span>
        : <span className="board-office__chip" data-tone={parent === null ? undefined : 'gap'} data-plan="none">{idle ? t('board.office.idle') : t('board.office.plan.none')}</span>}
    </>
  );
  const turn = room.advisor === null ? 'unknown' : advisorTurnState(room.advisor.status);
  const { notice } = boss;
  const sceneLabel = t('board.office.scene', {
    repository, parent: parent === null ? t('board.office.parent.none') : `#${parent}`, workers: room.desks.length, queue: room.queue.length,
    plan: t(plan.status === 'observed' ? 'board.office.scene.plan' : 'board.office.scene.noPlan'),
  });
  return (
    <section className="board-office" data-board-office="room" data-board-parent={parent ?? undefined} data-board-repository={repositoryId}>
      <nav className="board-office__crumb" aria-label={t('board.office.crumb.label')}>
        <PageLink to={boardHomeLocation('office')} onOpen={onOpen}>{t('board.office.crumb')}</PageLink> / {name}
      </nav>
      <OfficeHeader heading={heading} place={place} onOpen={onOpen} t={t} tools={(
        <>
          <SeatMeter room={room} idle={idle} t={t} />
          {room.advisor !== null && parent !== null && <BossButtons boss={boss} turn={turn} now={clock.now} onPick={setConfirm} t={t} />}
        </>
      )} />
      {banners}
      {notice?.state === 'reload_required'
        ? <WriteReloadBanner t={t} />
        : notice !== null && <p className="board-office__notice" role="status" data-boss-notice={notice.state === 'refused' ? notice.error.code : notice.state}>{bossNoticeText(notice, Math.max((boss.cooldowns[notice.command] ?? 0) - clock.now, 0), t)}</p>}
      <div className="board-office__body">
        <div className="board-office__scene" data-night={night ? '' : undefined}>
          <div className="board-office__grid" style={{ '--grid-w': scene.width, '--grid-h': scene.height } as CSSProperties}>
            <svg role="img" aria-label={sceneLabel} viewBox={`0 0 ${scene.width} ${scene.height}`} shapeRendering="crispEdges"><Paths paths={scene.paths} /></svg>
            {scene.labels.map(label => <span key={`${label.x}:${label.y}`} className="board-office__scene-label" data-kind={label.kind} style={gridBox(label.x, label.y, label.width)}>{label.text}</span>)}
            {scene.deskLabels.map(label => (
              <span key={`${label.x}:${label.y}`} className="board-office__desk-label" data-dim={label.dim ? '' : undefined} style={gridBox(label.x, label.y)}>
                <strong>{label.number}</strong><span data-tone={label.tone}>{label.text}</span>
              </span>
            ))}
            {scene.hits.map(hit => (
              <button key={`${hit.key}:${hit.x}:${hit.y}`} type="button" className="board-office__hit" aria-label={hitLabel(hit.key)} aria-pressed={selected === hit.key} {...hitData(hit.key)}
                style={gridBox(hit.x, hit.y, hit.width, hit.height)} onClick={() => pick(hit.key)} />
            ))}
            {scene.tags.map(tag => <span key={`${tag.x}:${tag.y}`} className="board-office__tag" data-tone={tag.tone} style={gridBox(tag.x, tag.y)}>{tag.text}</span>)}
          </div>
        </div>
        <aside className="board-office__aside" aria-label={t('board.office.panel.label')}>
          <OfficePanel view={panelView(selected, room, parent, defaultBranch, planText, clock.frame, t)} onIssue={openIssue} onPick={setPicked} onChat={canChat && selected === 'advisor' ? () => setChat(true) : null} t={t} />
          <OfficeFeed room={room} lit={lit} parent={parent} t={t} />
        </aside>
      </div>
      {setup}
      {confirm !== null && parent !== null && <BossConfirm command={confirm} parent={parent} frame={clock.frame} onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); boss.send(confirm); }} t={t} />}
      {chat && canChat && (
        <OfficeAdvisorDialog repositoryId={repositoryId} parent={parent} agent={agentName(room.advisor!.agent, t)} read={readAdvisor} write={writeAdvisor} onClose={() => setChat(false)} t={t}
          portrait={<svg viewBox="0 0 26 26" width="52" height="52" shapeRendering="crispEdges"><Paths paths={agentPortrait(sceneAgent(room.advisor!.agent), stageOutfit('advisor'), 1)} /></svg>} />
      )}
    </section>
  );
}

function gridBox(x: number, y: number, width?: number, height?: number): CSSProperties {
  return {
    left: `calc(var(--s) * ${x}px)`, top: `calc(var(--s) * ${y}px)`,
    ...(width === undefined ? {} : { width: `calc(var(--s) * ${width}px)` }),
    ...(height === undefined ? {} : { height: `calc(var(--s) * ${height}px)` }),
  };
}
