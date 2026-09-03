/**
 * One write journal, shared by every verb whose refusal must mean "the bytes
 * did not move".
 *
 * Two transactions need this: the schema migration, which writes a sprint, a
 * Work Graph carrier and a receipt, and the row completion, which writes a
 * sprint and then mutates the lease plane. Both proved their preconditions and
 * then wrote, and in both the steps after the first write can still fail --
 * a validation that only the landed bytes can answer, or an IO error. Without a
 * journal that failure leaves a half-applied state that reads as authoritative:
 * a sprint declaring schema 2 whose ids were never proved, or a row published
 * `[x]` whose lease was never released.
 *
 * The rule the journal encodes: record what a path held *before* writing it, and
 * on failure replay the journal in reverse. A path that did not exist is
 * removed rather than invented; a directory this run created is removed when it
 * is empty. Every entry is attempted before any failure is raised, because the
 * case that motivates it -- one unwritable path next to a writable one -- is
 * exactly the case where the others can and must still be put back.
 */
import { dirname } from 'path';

/** The filesystem surface a journal needs, injected so faults can be forced. */
export interface JournalFileSystem {
  readonly exists: (absolutePath: string) => boolean;
  readonly readText: (absolutePath: string) => string;
  readonly writeText: (absolutePath: string, text: string) => void;
  readonly makeDirectory: (absolutePath: string) => void;
  readonly removeFile: (absolutePath: string) => void;
  readonly removeDirectoryIfEmpty: (absolutePath: string) => void;
}

type JournalEntry =
  | { readonly kind: 'file'; readonly path: string; readonly before: string | null }
  | { readonly kind: 'directory'; readonly path: string };

export interface WriteJournal {
  /** Write `text`, recording what the path held first. */
  readonly writeTracked: (absolutePath: string, text: string) => void;
  /**
   * Record a file this run created through some other writer (an exclusive
   * create, say), so the rollback removes it. Call only after that write
   * succeeded and only when the path did not exist before.
   */
  readonly recordCreatedFile: (absolutePath: string) => void;
  /** Create a directory, recording every ancestor this run had to create. */
  readonly makeDirectoryTracked: (absolutePath: string) => void;
  /** Put every recorded path back. Throws naming each path it could not restore. */
  readonly restore: () => void;
}

export function createWriteJournal(fs: JournalFileSystem): WriteJournal {
  const entries: JournalEntry[] = [];

  const writeTracked = (absolutePath: string, text: string): void => {
    entries.push({
      kind: 'file',
      path: absolutePath,
      before: fs.exists(absolutePath) ? fs.readText(absolutePath) : null,
    });
    fs.writeText(absolutePath, text);
  };

  const recordCreatedFile = (absolutePath: string): void => {
    entries.push({ kind: 'file', path: absolutePath, before: null });
  };

  /**
   * `makeDirectory` is recursive, so it can create several levels at once. Each
   * missing ancestor is journalled from the outermost inwards and the rollback
   * replays in reverse, so the deepest is removed first and each removal sees an
   * already-empty directory.
   */
  const makeDirectoryTracked = (absolutePath: string): void => {
    const missing: string[] = [];
    for (let current = absolutePath; !fs.exists(current); current = dirname(current)) {
      missing.unshift(current);
      if (dirname(current) === current) break;
    }
    for (const path of missing) entries.push({ kind: 'directory', path });
    fs.makeDirectory(absolutePath);
  };

  const restore = (): void => {
    const failures: string[] = [];
    for (const entry of [...entries].reverse()) {
      try {
        if (entry.kind === 'directory') fs.removeDirectoryIfEmpty(entry.path);
        else if (entry.before === null) fs.removeFile(entry.path);
        else fs.writeText(entry.path, entry.before);
      } catch (error) {
        failures.push(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`could not restore ${failures.length} path(s): ${failures.join('; ')}`);
    }
  };

  return { writeTracked, recordCreatedFile, makeDirectoryTracked, restore };
}
