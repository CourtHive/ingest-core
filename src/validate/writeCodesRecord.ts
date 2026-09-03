import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { ensureVenueIdentity } from '../normalize/venueIdentity';
import { validateCodesRecord } from './validateCodesRecord';

import type { Tournament } from 'tods-competition-factory';

export class CodesValidationError extends Error {
  readonly errors: string[];
  readonly warnings: string[];
  constructor(tournamentId: string | undefined, errors: string[], warnings: string[]) {
    super(`Refusing to write ${tournamentId ?? 'record'} — ${errors.length} validation error(s):\n  ${errors.join('\n  ')}`);
    this.name = 'CodesValidationError';
    this.errors = errors;
    this.warnings = warnings;
  }
}

export interface WriteCodesOptions {
  /** Root output directory. Defaults to `<cwd>/codes`. */
  outDir?: string;
  /** Provider key — first path segment under outDir. */
  provider: string;
  /** Optional season / year segment. */
  season?: string;
  /** Filename without extension. Defaults to `tournamentRecord.tournamentId`. */
  basename?: string;
  /**
   * Write even when validation fails. **A deliberate escape hatch, not a default** — for capturing a
   * known-bad record to investigate. It still reports, so an invalid record is never written
   * silently. Everything else refuses.
   */
  allowInvalid?: boolean;
  /**
   * Namespace for any venue/court id minted here. Defaults to the lowercased provider, which is what
   * every adapter already uses as its `idPrefix` (`te`, `ts`, `utr`).
   */
  idPrefix?: string;
  /** Receives warnings, and errors when `allowInvalid` is set. Defaults to `console.warn`. */
  onDiagnostic?: (message: string) => void;
}

export interface WriteCodesResult {
  path: string;
  bytes: number;
  warnings: string[];
}

export async function writeCodesRecord(
  tournamentRecord: Tournament,
  options: WriteCodesOptions,
): Promise<WriteCodesResult> {
  const { outDir = join(process.cwd(), 'codes'), provider, season, basename } = options;
  const report = options.onDiagnostic ?? ((message: string) => console.warn(message));

  // VALIDATE BEFORE WRITING, at the shared writer, so "every assembled record is validated" is a
  // property of the code path rather than a rule each adapter has to remember. Two defects reached
  // disk and then a server this session precisely because nothing sat here.
  // GIVE VENUES AN IDENTITY BEFORE VALIDATING THEM. `venueId` is required, and 16 venues across the
  // TE and TS corpora reached disk without one because each adapter mints ids on its own parse path
  // and both have a branch that does not. Doing it here makes "every venue has a stable id" a
  // property of the write path rather than a rule each adapter has to remember -- the same argument
  // the validation below already makes.
  //
  // Derived from the venue NAME, so one club keeps one id across tournaments. Existing ids are never
  // rewritten: an id already loaded has references, and changing it would orphan them.
  const identity = ensureVenueIdentity(tournamentRecord, options.idPrefix ?? options.provider.toLowerCase());
  if (identity.venuesFixed || identity.courtsFixed) {
    report(`i ${tournamentRecord.tournamentId}: minted ${identity.venuesFixed} venueId(s), ${identity.courtsFixed} courtId(s)`);
  }
  for (const unresolved of identity.unresolved) report(`⚠ ${tournamentRecord.tournamentId}: ${unresolved.reason}`);

  const { valid, errors, warnings } = validateCodesRecord(tournamentRecord);
  for (const warning of warnings) report(`⚠ ${tournamentRecord.tournamentId}: ${warning}`);
  if (!valid) {
    if (!options.allowInvalid) throw new CodesValidationError(tournamentRecord.tournamentId, errors, warnings);
    for (const error of errors) report(`✗ ${tournamentRecord.tournamentId}: ${error} (written anyway: allowInvalid)`);
  }

  const filename = `${basename ?? tournamentRecord.tournamentId}.json`;
  const segments = [outDir, provider, season, filename].filter(Boolean) as string[];
  const path = join(...segments);

  await mkdir(dirname(path), { recursive: true });
  const payload = JSON.stringify(tournamentRecord, null, 2);
  await writeFile(path, payload, 'utf8');
  return { path, bytes: Buffer.byteLength(payload, 'utf8'), warnings };
}
