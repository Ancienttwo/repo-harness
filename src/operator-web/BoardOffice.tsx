import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@cloudflare/kumo';
import { XIcon } from '@phosphor-icons/react';
import type { BoardV1 } from '../core/board/board';
import { DESK_STATES, officeCards, type DeskState, type OfficeDesk, type OfficeRoom } from './board-office';
import { useBoardParents, type BoardParentsReader } from './board-view';
import type { BoardRepositoryOption } from './BoardPage';
import { useModalFocus } from './Drawer';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { Age, BoardState } from './ui';
import { boardHomeLocation, boardLocation, type BoardLayout, type BoardPlace, type WorkspaceLocation } from './workspace-location';
import './board-office.css';

/** Pixel rows of the mockup's person sprites: k ink, s skin, m mouth, b shirt, c/C the agent colours. */
const SEATED = ['...kkkkkk...', '..kccccccck.', '.kccccccccck', '.kccccccccck', '.kcCCCCCCCck', '.kssssssssk.', '..kbbbbbbk..', '.kbbbbbbbbk.', 'kbbbbbbbbbbk', 'kbbbbbbbbbbk'];
const STANDING = [...SEATED, 'kbbbbbbbbbbk', '.kbbbbbbbbk.', '..kkk..kkk..', '..kkk..kkk..'];
const FRONT = ['...kkkkkk...', '..kccccccck.', '.kccccccccck', '.kCCCCCCCCCk', '.kssssssssk.', '.kskssssksk.', '.kssssssssk.', '..kssmmssk..', '...kkkkkk...', '..kbbbbbbk..', '.kbbbbbbbbk.', 'kbbbbbbbbbbk', 'kbsbbbbbbsbk', '.kbbbbbbbbk.', '..kkk..kkk..', '..kkk..kkk..'];
/** BoardTerminalV1 has no agent field, so every sprite wears the unknown-agent colours. */
const PALETTE: Readonly<Record<string, string>> = {
  k: 'var(--office-ink)', s: 'var(--office-skin)', m: 'var(--office-mouth)', b: 'var(--office-shirt)',
  c: 'var(--office-agent-unknown)', C: 'var(--office-agent-unknown-dk)',
};

/** One cell at (-px, -px) paints every pixel as a shadow, so pixel (0, 0) is not hidden under the cell. */
function shadows(rows: readonly string[], px: number): string {
  return rows.flatMap((row, y) => [...row].flatMap((cell, x) => PALETTE[cell] ? [`${(x + 1) * px}px ${(y + 1) * px}px 0 0 ${PALETTE[cell]}`] : [])).join(', ');
}

function Person({ rows, px, move, t }: { readonly rows: readonly string[]; readonly px: number; readonly move?: 'bob' | 'sway'; readonly t: OperatorTranslate }) {
  const width = rows[0]!.length * px;
  return (
    <span className="board-office__sprite" style={{ width, height: rows.length * px }} data-move={move} aria-hidden="true">
      <span style={{ left: -px, top: -px, width: px, height: px, boxShadow: shadows(rows, px) }} />
      <span className="board-office__badge" style={{ left: width - 6, top: -4 }} title={t('board.office.agent.unknown')}>?</span>
    </span>
  );
}

const GLYPH: Readonly<Record<DeskState, string>> = {
  ci_failed: '✗', ci_pending: 'CI', acceptance_queue: '→', no_claim_status: 'Zz', coding: '···', idle: '', unknown: '?',
};
const MOVE: Partial<Record<DeskState, 'bob' | 'sway'>> = { coding: 'bob', ci_pending: 'sway' };

function DeskArt({ state, t }: { readonly state: DeskState | null; readonly t: OperatorTranslate }) {
  return (
    <span className="board-office__furniture" aria-hidden="true">
      {(state === 'ci_failed' || state === 'ci_pending') && <span className="board-office__lamp" />}
      <span className="board-office__monitor" />
      <span className="board-office__surface" />
      {state !== null && GLYPH[state] !== '' && <span className="board-office__bubble">{GLYPH[state]}</span>}
      {state !== null && <span className="board-office__worker"><Person rows={SEATED} px={3} move={MOVE[state]} t={t} /></span>}
    </span>
  );
}

function deskName(desk: OfficeDesk, t: OperatorTranslate): string {
  if (desk.issue !== null) return t('board.office.desk.issue', { number: desk.issue });
  if (desk.pr !== null) return t('board.office.desk.pr', { number: desk.pr });
  return t('board.office.desk.seat', { address: desk.address });
}

const stateName = (state: DeskState, t: OperatorTranslate) => t(`board.office.state.${state}` as OperatorMessageKey);

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
              <span className="board-office__desk" data-state={state}><DeskArt state={state} t={t} /></span>
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

/** No board selected: one card per parent with seats in each registered repository, from one parents read per repository. */
export function BoardOfficeOverview({ repositories, readParents, generation, onOpen, t }: {
  readonly repositories: readonly BoardRepositoryOption[]; readonly readParents: BoardParentsReader; readonly generation: number;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  return (
    <section className="board-office" data-board-office="overview" aria-labelledby="board-office-title">
      <OfficeHeader heading={<h1 id="board-office-title">{t('board.office.title')}</h1>} place={null} onOpen={onOpen} t={t} />
      {repositories.length === 0
        ? <BoardState title={t('board.parents.noRepository.title')} description={t('board.parents.noRepository.body')} />
        : <div className="board-office__cards">{repositories.map(repository => <RepositoryCards key={repository.id} repository={repository} readParents={readParents} generation={generation} onOpen={onOpen} t={t} />)}</div>}
    </section>
  );
}

function SeatMeter({ room, t }: { readonly room: OfficeRoom; readonly t: OperatorTranslate }) {
  const count = room.desks.length;
  if (room.plan.status !== 'observed') return <span className="board-office__meter" data-seat-meter="none">{t('board.office.meter.noLimit', { count })}</span>;
  const limit = room.plan.worker_limit;
  return (
    <span className="board-office__meter" data-seat-meter={`${count}/${limit}`}>
      <span className="board-office__meter-blocks" aria-hidden="true">
        {Array.from({ length: Math.max(limit, count) }, (_, index) => <span key={index} data-used={index < Math.min(count, limit) ? '' : undefined} data-over={index >= limit ? '' : undefined} />)}
      </span>
      {t('board.office.meter', { count, limit })}
    </span>
  );
}

function Lead({ seat, address, t }: { readonly seat: 'orchestrator' | 'advisor'; readonly address: string | null; readonly t: OperatorTranslate }) {
  return (
    <span className="board-office__lead" data-lead={seat} data-absent={address === null ? '' : undefined}>
      {address !== null ? <Person rows={FRONT} px={3} t={t} /> : <span className="board-office__furniture" style={{ width: 48, height: 48 }} aria-hidden="true"><span className="board-office__surface" style={{ top: 24 }} /></span>}
      <span className="board-office__lead-name">{t(`board.office.lead.${seat}`)}</span>
      <span className="board-office__lead-state">{address === null ? t('board.office.lead.notConnected') : t('board.office.lead.connected', { address })}</span>
    </span>
  );
}

/** One board: the stage, the desks, the acceptance queue, the batch carts, the white board and the backlog tray. */
export function BoardOfficeRoom({ board, room, place, banners, onOpen, now, t }: {
  readonly board: BoardV1; readonly room: OfficeRoom; readonly place: BoardPlace; readonly banners: ReactNode;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly now: number; readonly t: OperatorTranslate;
}) {
  const openIssue = (issue: number) => onOpen(boardLocation({ ...place, issue }));
  const plan = room.plan;
  const heading = (
    <>
      <h1>{board.repository}</h1>
      <span className="board-office__chip">#{board.parent.number}</span>
      {plan.status === 'observed'
        ? <span className="board-office__chip" data-plan="observed">{t('board.office.plan')} · <Age at={plan.created_at} now={now} t={t} bare /></span>
        : <span className="board-office__chip" data-tone="gap" data-plan="none">{t('board.office.plan.none')}</span>}
    </>
  );
  const scene = t('board.office.scene', {
    repository: board.repository, parent: board.parent.number, workers: room.desks.length, queue: room.queue.length,
    plan: t(plan.status === 'observed' ? 'board.office.scene.plan' : 'board.office.scene.noPlan'),
  });
  return (
    <section className="board-office" data-board-office="room" data-board-parent={board.parent.number}>
      <OfficeHeader heading={heading} tools={<SeatMeter room={room} t={t} />} place={place} onOpen={onOpen} t={t} />
      {banners}
      <div className="board-office__room">
        <div className="board-office__scene" role="img" aria-label={scene} />
        <div className="board-office__layout">
          <span className="board-office__plate">{board.repository.split('/').at(-1)}<span>#{board.parent.number}</span></span>
          <div className="board-office__whiteboard" data-whiteboard={plan.status}>
            {plan.status === 'observed' ? (
              <>
                <strong>{t('board.office.whiteboard.order')}</strong>
                <p>{plan.merge_order.length === 0 ? t('board.office.whiteboard.empty') : plan.merge_order.join(' ')}</p>
                <small>{t('board.office.whiteboard.limits', { limit: plan.worker_limit, batches: plan.batches })}</small>
              </>
            ) : <strong>{t('board.office.plan.none')}</strong>}
          </div>
          <span className="board-office__door" data-sign={t('board.office.door')} data-marks={room.door_marks > 0 ? room.door_marks : undefined}
            role="img" aria-label={room.door_marks > 0 ? t('board.office.door.marks', { count: room.door_marks }) : t('board.office.door.none')}>
            {room.door_marks > 0 && <span className="board-office__door-mark" aria-hidden="true">!</span>}
          </span>
          <div className="board-office__tray" data-backlog={room.backlog.length}>
            <span className="board-office__tray-desk" aria-hidden="true" />
            <span>{t('board.office.backlog', { count: room.backlog.length })}</span>
            {(room.backlog.length > 0 || room.holds.length > 0) && (
              <ul>
                {room.backlog.map(entry => <li key={entry.issue} title={entry.title}>#{entry.issue} {entry.title}</li>)}
                {room.holds.map(hold => <li key={hold.issue} data-hold={hold.issue}>{t('board.office.hold', { number: hold.issue, reason: hold.reason })}</li>)}
              </ul>
            )}
          </div>
          <div className="board-office__stage">
            <Lead seat="orchestrator" address={room.orchestrator} t={t} />
            <Lead seat="advisor" address={room.advisor} t={t} />
          </div>
          <div className="board-office__cart">
            {room.carts.map((cart, index) => (
              <span key={index} className="flex flex-col gap-1" data-cart={`${cart.accepted.length}/${cart.size}`}>
                <span className="board-office__cart-body" aria-hidden="true">
                  {Array.from({ length: cart.size }, (_, slot) => <span key={slot} data-accepted={slot < cart.accepted.length ? '' : undefined} />)}
                </span>
                <span>{t('board.office.cart', { index: index + 1, accepted: cart.accepted.length, size: cart.size })}</span>
              </span>
            ))}
          </div>
          <div className="board-office__queue" data-queue={room.queue.length}>
            <p>{t('board.office.queue', { count: room.queue.length })}</p>
            {room.queue.map(entry => (
              <button key={entry.pr} type="button" className="board-office__queued" data-queue-pr={entry.pr} disabled={entry.drawerIssue === null}
                aria-label={t('board.office.queue.entry', { number: entry.pr, title: entry.title })} onClick={() => entry.drawerIssue !== null && openIssue(entry.drawerIssue)}>
                <span>{entry.pr}</span>
                <Person rows={STANDING} px={3} move="bob" t={t} />
              </button>
            ))}
          </div>
          <div className="board-office__desks">
            {room.desks.map((desk, index) => {
              const name = deskName(desk, t);
              const roped = room.roped_from !== null && index >= room.roped_from;
              const state = stateName(desk.state, t);
              return (
                <button key={desk.address} type="button" className="board-office__desk" data-desk={desk.address} data-state={desk.state} data-roped={roped ? '' : undefined}
                  disabled={desk.drawerIssue === null} aria-label={t('board.office.desk.label', { desk: name, state: roped ? `${state}, ${t('board.office.desk.roped')}` : state })}
                  onClick={() => desk.drawerIssue !== null && openIssue(desk.drawerIssue)}>
                  <DeskArt state={desk.state} t={t} />
                  <span className="board-office__label"><strong>{name}</strong><span data-state={desk.state}>{state}</span></span>
                  {desk.title !== null && <span className="board-office__title">{desk.title}</span>}
                </button>
              );
            })}
            {Array.from({ length: room.free_desks }, (_, index) => (
              <span key={`free-${index}`} className="board-office__desk" data-free="" role="img" aria-label={t('board.office.desk.free')}>
                <DeskArt state={null} t={t} />
                <span className="board-office__label"><span>{t('board.office.desk.free')}</span></span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
