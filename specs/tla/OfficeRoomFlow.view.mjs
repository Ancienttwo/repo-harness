// Reader's words for OfficeRoomFlow.tla: the screen of one Office room.
export const title = 'Watch one room of the Office';
const seats = (v) => (v.parents === 'stale' ? 'seats marked stale' : 'seats');
export const state = (v) => {
  if (v.screen === 'loading') return v.parents === 'loading' ? 'Loading: the first parents read' : 'Loading: the seats are known, the board read runs';
  if (v.screen === 'checklist') return v.seatsSeen ? 'Setup checklist: the seats are gone' : 'Setup checklist: the first parents read failed';
  if (v.screen === 'board-failure') return v.seatsSeen ? 'Board failure screen: the seats are gone' : 'Board failure screen: no seat was shown';
  if (v.stored === 'ready') return `Room: ${seats(v)} and board facts`;
  if (v.stored === 'stale') return `Room: ${seats(v)}, board facts marked stale`;
  if (v.stored === 'failed') return `Room: ${seats(v)}, board failure notice`;
  return `Room: ${seats(v)}, the board read runs`;
};
const LABELS = {
  ParentsReadOk: 'the parents read ends',
  ParentsReadFails: 'the parents read fails',
  BoardReadOk: 'the board read ends',
  BoardReadFailsKept: 'the board read fails [busy, timeout or no answer]',
  BoardReadFailsDropped: 'the board read fails [invalid answer]',
  ParentsTimer: 'the next parents read starts',
  BoardTimer: 'the next board read starts',
};
export const step = (action) => LABELS[action] ?? action;
export const group = (v) => (v.screen === 'room' ? 'room' : v.screen === 'loading' ? 'wait' : 'failure');
export const colors = { room: 'teal', wait: 'yellow', failure: 'tan' };
