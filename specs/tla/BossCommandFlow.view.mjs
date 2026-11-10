// Reader's words for BossCommandFlow.tla: what the room shows for one boss command.
export const title = 'Send a boss command to the advisor seat';
export const state = (v) => {
  if (v.ui === 'confirm') return 'Confirm dialog';
  if (v.ui === 'sending') return 'Sending';
  if (v.turnShown !== 'over') return 'Button locked: the room shows a running turn';
  if (v.coolShown) return 'Button locked: the room shows the cooldown';
  const hidden = [v.coolServer ? 'the cooldown runs' : null, v.turnReal !== 'over' ? 'the advisor is in a turn' : null].filter(Boolean);
  return hidden.length === 0 ? 'Button offered' : `Button offered, but ${hidden.join(' and ')}`;
};
const LABELS = {
  YouPickACommand: 'you pick the command',
  YouConfirm: 'you confirm',
  ServerSends: 'the command reaches the seat',
  ServerRefusesForCooldown: 'the server refuses: cooldown',
  ServerRefusesForTurn: 'the server refuses: the advisor is in a turn',
  AnswerIsLostAfterTheSend: 'the command reaches the seat, the answer is lost',
  AnswerIsLostBeforeTheSend: 'the request fails before the send',
  RoomReadsTheSeat: 'the room reads the seat status',
  AdvisorEndsItsTurn: 'the advisor ends its turn',
  AdvisorStartsATurn: 'the advisor starts a turn',
  CooldownEnds: 'the cooldown ends',
  YouReloadThePage: 'you reload the page',
};
// The cancel step is not drawn: it goes back to the state before the dialog.
export const step = (action) => (action === 'YouCancel' ? null : LABELS[action] ?? action);
export const group = (v) => (v.ui !== 'buttons' ? 'act' : v.turnShown !== 'over' || v.coolShown ? 'locked' : 'offered');
export const colors = { act: 'blue', locked: 'tan', offered: 'teal' };
