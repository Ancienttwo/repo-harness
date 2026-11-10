// Reader's words for ArchitectureMapsFlow.tla: the tab and the topology segment.
export const title = 'Architecture page: the topology segment';
export const state = (v) => {
  if (v.tab === 'history') return v.reset ? 'History: the chosen segment is forgotten' : 'History';
  if (v.tab === 'topology') {
    const boxes = v.segment === 'process' ? 'Topology: processes, 25 boxes' : 'Topology: namespaces, 1 box';
    return v.chosen ? `${boxes} (your choice)` : `${boxes} (the first segment)`;
  }
  return v.reset ? 'Another map tab: the chosen segment is forgotten' : v.chosen ? 'Another map tab: the page holds your segment' : 'Another map tab';
};
export const step = (action, from, to) => {
  if (action === 'YouOpenAnotherMapTab') return to.tab === 'topology' ? 'you open Topology' : from.tab === 'topology' ? 'you open another map tab' : null;
  if (action === 'YouComeBackFromHistory') return to.tab === 'topology' ? 'you come back to Topology' : 'you come back to another map tab';
  if (action === 'YouOpenHistory') return 'you open History';
  if (action === 'YouChooseAnotherSegment') return 'you choose the other segment';
  return null;
};
