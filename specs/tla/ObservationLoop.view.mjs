// Reader's words for ObservationLoop.tla: one read loop of a console page.
export const title = 'One read loop of the console';
const WAIT = ['30 s', '60 s', '120 s'];
export const state = (v) => {
  if (v.disposed) return v.live + v.dead > 0 ? 'Closed: the aborted read still runs' : 'Closed';
  const reads = v.live + v.dead;
  if (!v.visible) return reads > 0 ? 'Hidden tab: the aborted read still runs' : v.queued ? 'Hidden tab: a refresh waits for the tab' : 'Hidden tab: no read, no timer';
  if (reads > 1) return 'Two reads at the same time';
  if (v.live === 1) return v.queued ? 'Reading, a refresh waits' : 'Reading';
  if (v.dead === 1) return 'Visible again: waits for the aborted read';
  if (v.timer) return `Waits ${WAIT[v.interval]} for the next read` + (v.queued ? ', a refresh is lost' : '');
  return 'Visible with no read and no timer';
};
const LABELS = {
  ReadOk: 'the read gets an answer',
  ReadRefused: 'the server refuses the read',
  ReadUnreachable: 'the read gets no answer',
  AbortedReadSettles: 'the aborted read ends',
  TimerFires: 'the wait ends',
  Refresh: 'you refresh',
  Hide: 'you hide the tab',
  Show: 'you show the tab',
  Unmount: 'you leave the page',
};
export const step = (action) => LABELS[action] ?? null;
export const group = (v) => (v.disposed ? 'closed' : !v.visible ? 'hidden' : v.live + v.dead > 0 ? 'read' : 'wait');
export const colors = { closed: 'tan', hidden: 'purple', read: 'blue', wait: 'yellow' };
