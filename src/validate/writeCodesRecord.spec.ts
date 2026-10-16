import { mocksEngine, timeItemConstants } from 'tods-competition-factory';
import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { writeCodesRecord } from './writeCodesRecord';

/**
 * Every record the shared writer emits is MIGRATED first: `migrateTournamentRecord` is a standard requirement of
 * ingest (CA, 2026-10-16). A converter produces whatever shape its source suggests; the writer makes it the shape the
 * factory itself stores, so nothing downstream has to repair it on read.
 */
function legacyRecord(): any {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], nonRandom: 1 });
  const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];
  // the legacy spelling of a scheduled date: a timeItem, where the factory now stores `schedule.scheduledDate`
  delete matchUp.schedule;
  matchUp.timeItems = [{ itemType: timeItemConstants.SCHEDULED_DATE, itemValue: tournamentRecord.startDate }];
  return { tournamentRecord, matchUpId: matchUp.matchUpId };
}

const written = (filePath: string, matchUpId: string) => {
  const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return record.events[0].drawDefinitions[0].structures[0].matchUps.find((m: any) => m.matchUpId === matchUpId);
};

describe('writeCodesRecord — migration', () => {
  it('writes a legacy record in the shape the factory stores, and says what it promoted', async () => {
    const outDir = fs.mkdtempSync(path.join(tmpdir(), 'ingest-core-migrate-'));
    const { tournamentRecord, matchUpId } = legacyRecord();
    const diagnostics: string[] = [];

    const result = await writeCodesRecord(tournamentRecord, {
      onDiagnostic: (message) => diagnostics.push(message),
      provider: 'TEST',
      outDir,
    });

    const matchUp = written(result.path, matchUpId);
    expect(matchUp.schedule.scheduledDate).toEqual(tournamentRecord.startDate);
    expect(matchUp.timeItems ?? []).toEqual([]);
    expect(diagnostics.some((message) => /migrated/.test(message))).toBe(true);
  });

  it('says nothing about a record that is already in that shape', async () => {
    const outDir = fs.mkdtempSync(path.join(tmpdir(), 'ingest-core-migrate-'));
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      nonRandom: 1,
    });
    const diagnostics: string[] = [];

    await writeCodesRecord(tournamentRecord, {
      onDiagnostic: (message) => diagnostics.push(message),
      provider: 'TEST',
      outDir,
    });
    expect(diagnostics.filter((message) => /migrated/.test(message))).toEqual([]);
  });
});
