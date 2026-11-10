// Reader's words for ArchitectureFirstMapFlow.tla: the collector and the page, side by side.
export const title = 'Open the architecture page: the first map of one repository';
const WAIT = ['30 s', '60 s', '120 s'];
const SERVES = { pending: 'a GET gets "not collected yet"', ready: 'a GET gets the map', unavailable: 'a GET gets "unavailable"' };
const collector = (v) => {
  if (v.cycle === 'waiting') return `Waits for the pull request list: ${SERVES[v.served]}`;
  if (v.cycle === 'this') return `Builds the map of this repository: ${SERVES[v.served]}`;
  if (v.cycle === 'idle') return `Idle for 5 minutes: ${SERVES[v.served]}`;
  const holds = v.result === 'ready' ? 'holds the new map' : 'holds a failure';
  return `Builds the other repositories, ${holds}: ${SERVES[v.served]}`;
};
const page = (v) => {
  if (v.answer === 'none') return 'Loading';
  if (v.answer === 'ready') return 'Map';
  const next = `next read after ${WAIT[v.wait]}`;
  if (v.kept) return `Map and a notice that the refresh failed, ${next}`;
  return v.answer === 'pending' ? `"Not collected yet", ${next}` : `"Unavailable", ${next}`;
};
export const state = (v) => ({ Collector: collector(v), Page: page(v) });
const ANSWER = { pending: 'the answer is "not collected yet"', ready: 'the answer is the map', unavailable: 'the answer is "unavailable"' };
export const step = (action, from) => {
  if (action === 'PageReads') return `the page reads [${ANSWER[from.served]}]`;
  if (action === 'PullRequestListIsReady') return 'the pull request list is ready';
  if (action === 'MapOfThisRepositoryIsBuilt') return 'the map of this repository is built';
  if (action === 'MapOfThisRepositoryFails') return 'the map of this repository fails';
  if (action === 'CycleEnds') return 'the last repository of the cycle ends';
  if (action === 'NextCycleStarts') return '5 minutes pass';
  return action;
};
