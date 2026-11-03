// A fake `hc` for operator tests. It speaks the wire format that hc 0.1.17 writes
// (probed on a disposable core): `server status --json` prints StatusResult, and
// `events --json` prints one snapshot line, then every line appended to the event
// file. Each call logs its argv, and its HC_SOCKET and the names of the terminal identity keys it got. The registry names one repository whose policy
// holds the hc pin, as the operator reads it.
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { tmpWorkspace, writeShellExecutableFixture } from './repo-fixture';

const SCRIPT = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_HC/argv.log"
printf '%s|%s|%s\\n' "$1" "\${HC_SOCKET-}" "\${HC_TERMINAL_ID+HC_TERMINAL_ID }\${HC_TERMINAL_SOCKET+HC_TERMINAL_SOCKET }\${HC_SCOPE+HC_SCOPE}" >> "$FAKE_HC/env.log"
case "$1" in
  server)
    if [ -f "$FAKE_HC/status.json" ]; then cat "$FAKE_HC/status.json"; exit 0; fi
    printf '%s' '{"error":{"kind":"unreachable","message":"no core"}}' >&2; exit 1 ;;
  events)
    if [ -f "$FAKE_HC/events-fail" ]; then printf '%s' '{"error":{"kind":"unreachable","message":"no core"}}' >&2; exit 1; fi
    # hc subscribes before it sends the snapshot: the stream starts at the event file's end before the snapshot line.
    from=$(($(wc -c < "$FAKE_HC/events.jsonl") + 1))
    cat "$FAKE_HC/snapshot.json"; printf '\\n'
    exec tail -c +"$from" -f "$FAKE_HC/events.jsonl" ;;
esac
exit 2
`;

/**
 * A fake `hc` for install and readiness paths: `hc --skill` prints a manual, every other call prints `hc 0.1.17`.
 * A fixture puts it first on PATH, so no test runs the developer's hc.
 */
export function writeFakeHc(bin: string): void {
  writeShellExecutableFixture(join(bin, 'hc'), '#!/bin/sh\nif [ "${1:-}" = --skill ]; then printf "%s\\n" "# hc manual (herdr-core)" "" "\\`\\$HC_TERMINAL_ID\\` is your address."; else printf "hc 0.1.17\\n"; fi\n');
}

export interface FakeTerminal { readonly address: string; readonly name?: string | null; readonly status?: Record<string, unknown> | null; readonly state?: 'live' | 'finished' }

/** A terminal row as hc writes it, with the fields the operator must never pass on (cwd, title, argv, foreground). */
export function hcTerminalRow(terminal: FakeTerminal, labels: Record<string, string> = { 'repo-harness.role': 'task-session' }) {
  return { address: terminal.address, name: terminal.name ?? null, state: terminal.state ?? 'live', labels, status: terminal.status ?? null,
    turn: 1, pid: 4242, reason: null, cwd: '/private/fixture-repo', title: 'private title', argv: ['claude', '--private-arg'],
    foreground: { pid: 4242, name: 'claude', argv: ['claude'], cwd: '/private/fixture-repo' }, cols: 80, rows: 24, created_ms: 1, screen: 'private screen' };
}

export function fakeHc(prefix: string, repoName = 'pinned') {
  const root = tmpWorkspace(prefix);
  const bin = join(root, 'bin'), state = join(root, 'hc'), home = join(root, 'home', '.repo-harness'), repo = join(root, 'repos', repoName);
  for (const dir of [bin, state, home, join(repo, '.ai', 'harness')]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(bin, 'hc'), SCRIPT); chmodSync(join(bin, 'hc'), 0o755);
  writeFileSync(join(state, 'argv.log'), ''); writeFileSync(join(state, 'env.log'), ''); writeFileSync(join(state, 'events.jsonl'), '');
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{
    id: repoHarnessRepoIdFor(repo), path: repo, accessMode: 'read_only', source: 'manual', registeredAt: '2026-11-03T00:00:00.000Z', lastSeenAt: '2026-11-03T00:00:00.000Z',
  }] }));
  const env: NodeJS.ProcessEnv = { PATH: `${bin}:/bin:/usr/bin`, FAKE_HC: state, HOME: join(root, 'home'), REPO_HARNESS_HOME: home };
  const fake = {
    root, env, repo,
    /** The core's version; null makes `server status` fail as an unreachable core does. */
    setVersion(version: string | null, coreId = 'core-1') {
      const path = join(state, 'status.json');
      if (version === null) rmSync(path, { force: true });
      else writeFileSync(path, JSON.stringify({ core: { id: coreId, name: 'private-host' }, finished: 0, holder: null, holders: [], installed_by: null, live: 1, pid: 9, uptime_ms: 5, version }));
    },
    /** `external_tooling.herdr_core.min_version` of the registered repository; null removes the policy. */
    setPin(minVersion: string | null) {
      const path = join(repo, '.ai', 'harness', 'policy.json');
      if (minVersion === null) rmSync(path, { force: true });
      else writeFileSync(path, JSON.stringify({ external_tooling: { herdr_core: { min_version: minVersion } } }));
    },
    setSnapshot(seq: number, terminals: readonly FakeTerminal[]) {
      writeFileSync(join(state, 'snapshot.json'), JSON.stringify({ channel: null, seq, terminals: terminals.map(terminal => hcTerminalRow(terminal)) }));
    },
    /** Every later `events` call fails, as a stopped or missing core does. */
    failEvents(fail: boolean) { if (fail) writeFileSync(join(state, 'events-fail'), ''); else rmSync(join(state, 'events-fail'), { force: true }); },
    /** One line to every open stream: an hc event notification, or raw text. */
    emit(line: Record<string, unknown> | string) { appendFileSync(join(state, 'events.jsonl'), `${typeof line === 'string' ? line : JSON.stringify(line)}\n`); },
    event(seq: number, terminal: string, type: string, data: Record<string, unknown> | null) { fake.emit({ jsonrpc: '2.0', method: 'event', params: { data, seq, terminal, type } }); },
    argv: () => readFileSync(join(state, 'argv.log'), 'utf8').split('\n').filter(Boolean),
    /** Per call: the subcommand, its HC_SOCKET and which of HC_TERMINAL_ID, HC_TERMINAL_SOCKET and HC_SCOPE were set. */
    calls: () => readFileSync(join(state, 'env.log'), 'utf8').split('\n').filter(Boolean).map(line => {
      const [command, socket, keys] = line.split('|');
      return { command: command!, socket: socket!, terminal_keys: keys!.split(' ').filter(Boolean) };
    }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
  fake.setVersion('0.1.17'); fake.setPin('0.1.17'); fake.setSnapshot(1, []);
  return fake;
}
