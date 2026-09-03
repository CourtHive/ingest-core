import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
