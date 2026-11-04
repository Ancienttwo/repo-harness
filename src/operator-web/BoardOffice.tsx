import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@cloudflare/kumo';
import { XIcon } from '@phosphor-icons/react';
import { ADVISOR_BOSS_COMMAND_TABLE, ADVISOR_BOSS_COMMANDS, advisorBossCommandText, advisorTurnState, type AdvisorBossCommand } from '../core/board/advisor-seat';
import { DESK_STATES, ISSUE_FLOW_WORKER_LIMIT, officeCards, serialParentsReader, type DeskState, type OfficeDesk, type OfficeFeedEvent, type OfficeLead, type OfficeRoom } from './board-office';
import { useBoardParents, type BoardParentsReader } from './board-view';
import type { BoardRepositoryOption } from './BoardPage';
import { useModalFocus } from './Drawer';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { useBossCommands, type BossCommands, type BossCommandWriter, type BossNotice } from './office-boss';
import { WriteReloadBanner } from './operator-write';
import { agentPortrait, bossPortrait, composeRoom, deskOutfit, deskVignette, queueOutfit, sceneEffect, stageOutfit, type ScenePath } from './office-scene';
import { BOSS_ICONS, sceneAgent, type BossPose } from './office-sprites';
import type { ThemeMode } from './theme';
import { Age, BoardState, CopyButton, PageLink } from './ui';
import { boardHomeLocation, boardLocation, type BoardLayout, type BoardPlace, type WorkspaceLocation } from './workspace-location';
import './board-office.css';

/** Pixel rows of the mockup's person sprites: k ink, s skin, m mouth, b shirt, c/C the agent colours. */
const SEATED = ['...kkkkkk...', '..kccccccck.', '.kccccccccck', '.kccccccccck', '.kcCCCCCCCck', '.kssssssssk.', '..kbbbbbbk..', '.kbbbbbbbbk.', 'kbbbbbbbbbbk', 'kbbbbbbbbbbk'];
/** The overview cards name no seats, so their sprites wear the unknown-agent colours. */
const PALETTE: Readonly<Record<string, string>> = {
  k: 'var(--office-ink)', s: 'var(--office-skin)', m: 'var(--office-mouth)', b: 'var(--office-shirt)',
  c: 'var(--office-agent-unknown)', C: 'var(--office-agent-unknown-dk)',
};

/** One cell at (-px, -px) paints every pixel as a shadow, so pixel (0, 0) is not hidden under the cell. */
function shadows(rows: readonly string[], px: number): string {
  return rows.flatMap((row, y) => [...row].flatMap((cell, x) => PALETTE[cell] ? [`${(x + 1) * px}px ${(y + 1) * px}px 0 0 ${PALETTE[cell]}`] : [])).join(', ');
}

function Person({ rows, px, t }: { readonly rows: readonly string[]; readonly px: number; readonly t: OperatorTranslate }) {
  const width = rows[0]!.length * px;
  return (
    <span className="board-office__sprite" style={{ width, height: rows.length * px }} aria-hidden="true">
      <span style={{ left: -px, top: -px, width: px, height: px, boxShadow: shadows(rows, px) }} />
      <span className="board-office__badge" style={{ left: width - 6, top: -4 }} title={t('board.office.agent.unknown')}>?</span>
    </span>
  );
}

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

function RepositoryCards({ repository, readParents, generation, onOpen, t }: {
  readonly repository: BoardRepositoryOption; readonly readParents: BoardParentsReader; readonly generation: number;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const view = useBoardParents(readParents, repository.id, generation)!;
  const name = <strong>{repository.label}</strong>;
  if (view.kind === 'loading') {
    return <div className="board-office__card" data-office-card="loading" data-repository={repository.id}><div className="board-office__card-name">{name}<span>{t('board.office.card.loading')}</span></div></div>;
  }
  if (view.kind === 'failed') {
    return (
      <div className="board-office__card" role="group" aria-label={t('board.office.card.failed', { repository: repository.label })} data-office-card="failed" data-repository={repository.id} data-board-parents-reason={view.reason}>
        <div className="board-office__card-name">{name}</div>
        <p className="board-office__card-reason">{t(`board.reason.${view.reason}` as OperatorMessageKey)}</p>
      </div>
    );
  }
  return (
    <>
      {officeCards(view.list.parents).map((card) => {
        if (card.kind === 'idle') {
          return (
            <div key="idle" className="board-office__card" role="group" aria-label={t('board.office.card.idleLabel', { repository: repository.label })} data-office-card="idle" data-repository={repository.id}>
              <span className="board-office__thumb" data-idle aria-hidden="true">{t('board.office.card.idle')}</span>
              <div className="board-office__card-name">{name}<span>{t('board.office.card.idle')}</span></div>
            </div>
          );
        }
        const { parent } = card;
        const { completed, total } = parent.sub_issues;
        return (
          <button key={parent.number} type="button" className="board-office__card" data-office-card="parent" data-repository={repository.id} data-parent={parent.number}
            aria-label={t('board.office.card.open', { repository: repository.label, number: parent.number, title: parent.title, seats: parent.seats, completed, total })}
            onClick={() => onOpen(boardLocation({ repository_id: repository.id, parent: parent.number, issue: null, layout: 'office' }))}>
            <span className="board-office__thumb" aria-hidden="true">
              {Array.from({ length: parent.seats }, (_, index) => <Person key={index} rows={SEATED} px={2} t={t} />)}
            </span>
            <span className="board-office__card-name">{name}<span>#{parent.number} {parent.title}</span></span>
            <span className="board-office__card-chips">
              <span className="board-office__chip">{t('board.office.card.seats', { count: parent.seats })}</span>
              <span className="board-office__chip">{t('board.office.card.progress', { completed, total })}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * No board selected: one card per parent with seats in each registered
 * repository, from one parents read per repository. The cards share one
 * serial reader, so the reads run one at a time in repository order and a
 * waiting card shows loading.
 */
export function BoardOfficeOverview({ repositories, readParents, generation, onOpen, t }: {
  readonly repositories: readonly BoardRepositoryOption[]; readonly readParents: BoardParentsReader; readonly generation: number;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const serialRead = useMemo(() => serialParentsReader(readParents), [readParents]);
  return (
    <section className="board-office" data-board-office="overview" aria-labelledby="board-office-title">
      <OfficeHeader heading={<h1 id="board-office-title">{t('board.office.title')}</h1>} place={null} onOpen={onOpen} t={t} />
      {repositories.length === 0
        ? <BoardState title={t('board.parents.noRepository.title')} description={t('board.parents.noRepository.body')} />
        : <div className="board-office__cards">{repositories.map(repository => <RepositoryCards key={repository.id} repository={repository} readParents={serialRead} generation={generation} onOpen={onOpen} t={t} />)}</div>}
    </section>
  );
}

/** The grid frame of the idle loops: 4 per second, still under reduced motion. */
const FRAME_MS = 250;

function useClock(): { readonly frame: number; readonly now: number; readonly still: boolean } {
  const [clock, setClock] = useState(() => ({ frame: 0, now: Date.now() }));
  const [still] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const timer = setInterval(() => setClock(current => ({ frame: still ? 0 : current.frame + 1, now: Date.now() })), FRAME_MS);
    return () => clearInterval(timer);
  }, [still]);
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
      rows: [[t('board.office.panel.door.waits'), String(room.merge_waits)], [t('board.office.panel.door.next'), accepted.length === 0 ? none : accepted.map(issue => `#${issue}`).join(' ')]],
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

function OfficePanel({ view, onIssue, onPick, t }: { readonly view: PanelView; readonly onIssue: (issue: number) => void; readonly onPick: (key: string) => void; readonly t: OperatorTranslate }) {
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
export function BoardOfficeRoom({ repository, repositoryId, parent, defaultBranch, room, place, banners, writeBoss, mode, onOpen, now, t }: {
  readonly repository: string; readonly repositoryId: string; readonly parent: number | null; readonly defaultBranch: string | null;
  readonly room: OfficeRoom; readonly place: BoardPlace | null; readonly banners: ReactNode; readonly writeBoss: BossCommandWriter; readonly mode: ThemeMode;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const clock = useClock();
  const boss = useBossCommands(writeBoss, repositoryId, parent);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdvisorBossCommand | null>(null);
  const lit = room.orchestrator !== null || room.advisor !== null || room.desks.length > 0;
  const night = mode === 'dark' || !lit;
  const idle = !lit && parent === null;
  const { plan } = room;
  const name = repository.split('/').at(-1)!;
  const planText = plan.status === 'observed' ? t('board.office.plan.observed') : t('board.office.plan.none');
  const effect = sceneEffect(boss.effect, clock.now, clock.still);
  const queueEntries = new Set(room.queue.map(entry => `queue:${entry.pr}`));
  const keys = new Set([...room.desks.map(deskKey), ...queueEntries, 'queue', 'door', 'tray', 'cart', ...(room.orchestrator === null ? [] : ['orchestrator']), ...(room.advisor === null ? [] : ['advisor'])]);
  const first = room.desks[0];
  const selected = picked !== null && keys.has(picked) ? picked : first !== undefined ? deskKey(first) : 'orchestrator';

  const scene = composeRoom({
    name, parent, lit,
    orchestrator: room.orchestrator === null ? null : sceneAgent(room.orchestrator.agent),
    advisor: room.advisor === null ? null : sceneAgent(room.advisor.agent),
    plan: plan.status === 'observed' ? { order: plan.merge_order, limit: plan.worker_limit, batch: plan.batch } : null,
    limit: room.limit,
    desks: room.desks.map(desk => ({ key: deskKey(desk), agent: sceneAgent(desk.agent), state: desk.state, number: deskNumber(desk, t), label: deskStateName(desk, t) })),
    queue: room.queue.map(entry => ({ key: `queue:${entry.pr}`, agent: sceneAgent(entry.agent), pr: entry.pr })),
    cart: room.cart?.accepted.length ?? 0,
    tray: room.backlog.length + room.holds.length,
    needsYou: room.merge_waits > 0,
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
    if (key === 'door') return room.merge_waits > 0 ? t('board.office.door.marks', { count: room.merge_waits }) : t('board.office.door.none');
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
  const pick = (key: string) => setPicked(key === 'board' ? (room.advisor === null ? 'orchestrator' : 'advisor') : key);
  const openIssue = (issue: number) => onOpen(boardLocation({ repository_id: repositoryId, parent: parent!, issue, layout: 'office' }));

  const heading = (
    <>
      <h1>{name}</h1>
      <span className="board-office__parent">{parent === null ? t('board.office.parent.none') : t('board.office.parent', { number: parent })}</span>
      {plan.status === 'observed'
        ? <span className="board-office__chip" data-plan="observed">{t('board.office.plan')} · <Age at={plan.created_at} now={now} t={t} bare /></span>
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
          <OfficePanel view={panelView(selected, room, parent, defaultBranch, planText, clock.frame, t)} onIssue={openIssue} onPick={setPicked} t={t} />
          <OfficeFeed room={room} lit={lit} parent={parent} t={t} />
        </aside>
      </div>
      {confirm !== null && parent !== null && <BossConfirm command={confirm} parent={parent} frame={clock.frame} onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); boss.send(confirm); }} t={t} />}
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
