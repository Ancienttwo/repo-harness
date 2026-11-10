// Reader's words for ArchitectureMapsFlow.tla: the selection.
export const title = 'Architecture page: the selected box';
export const state = (v) => {
  if (v.selected) return 'One box is selected, the inspector shows it';
  if (v.lost === 'tab') return 'The selection is gone after the tab change';
  if (v.lost === 'commit') return 'The selection is gone after the new commit';
  return 'No box is selected';
};
export const step = (action, from, to) => {
  if (action === 'YouSelectABox') return 'you select a box';
  if (action === 'ANewCommitIsCollected') return 'the collector reads a new commit';
  if (action === 'YouOpenAnotherMapTab' || action === 'YouOpenHistory') return from.selected ? 'you open another tab' : null;
  return null;
};
