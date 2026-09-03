import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

import { validateCodesRecord } from './validateCodesRecord';

/**
 * Every assembled record on disk, run through the validator.
 *
 * This is the check that would have caught both of this session's defects before they left the
 * machine: `Venue missing venueId` (10 of 10 TE records unloadable) and `ERR_MISSING_STRUCTURE_LINKS`
 * (a WTA draw that saved, validated, listed in its calendar, and could not be read). Neither was
 * visible to types, lint, or any unit test, because both records were well-formed — they were simply
 * not readable by the thing that would eventually have to read them.
 *
 * `tods/` is gitignored, so this SKIPS where the corpus is absent (CI, a fresh clone) rather than
 * failing — the same handling `capturedLadders.spec.ts` uses.
 */
const ROOT = 'tods';

/**
 * Records are sampled with a deterministic stride, not truncated: ITA alone is 52,906 files and each
 * validation is an engine round-trip plus a read per draw. The count actually examined is asserted
 * and reported, because a cap nobody states reads as "we checked everything".
 */
const MAX_PER_PROVIDER = 250;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.json') && fs.statSync(full).size > 0 ? [full] : [];
  });
}

function sample(files: string[]): string[] {
  if (files.length <= MAX_PER_PROVIDER) return files;
  const stride = Math.ceil(files.length / MAX_PER_PROVIDER);
  return files.filter((_, index) => index % stride === 0);
}

const providers = fs.existsSync(ROOT)
  ? fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'en'))
  : [];

describe.skipIf(!providers.length)('assembled corpus validates', () => {
  it('finds providers and records to check, so the assertions below are not vacuous', () => {
    expect(providers.length).toBeGreaterThan(0);
    const total = providers.reduce((n, p) => n + walk(path.join(ROOT, p)).length, 0);
    expect(total).toBeGreaterThan(0);
  });

  for (const provider of providers) {
    it(`${provider}: every sampled record is valid CODES`, () => {
      const files = walk(path.join(ROOT, provider));
      const chosen = sample(files);
      const failures: string[] = [];

      for (const file of chosen) {
        let record: any;
        try {
          record = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) {
          failures.push(`${file}: unparseable — ${(err as Error).message}`);
          continue;
        }
        const { valid, errors } = validateCodesRecord(record);
        if (!valid) failures.push(`${file}: ${errors.join('; ')}`);
      }

      // Stated rather than silent: a sampled sweep that reports "clean" must say what it looked at.
      expect(chosen.length).toBeGreaterThan(0);
      if (chosen.length < files.length) {
        console.log(`  ${provider}: sampled ${chosen.length} of ${files.length} (stride)`);
      }
      expect(failures).toEqual([]);
    });
  }
});
