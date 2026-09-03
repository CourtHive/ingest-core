import { mocksEngine } from 'tods-competition-factory';
import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { writeCodesRecord, CodesValidationError } from './writeCodesRecord';
import { validateCodesRecord } from './validateCodesRecord';

/**
 * The control is a factory-generated record: if the validator rejects what the factory itself
 * produced, the validator is wrong. Every negative case below starts from that record and breaks
 * exactly one thing, so a failure names the break rather than an accumulation.
 */
function validRecord(): any {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    nonRandom: 1,
  });
  return tournamentRecord;
}

const clone = (record: any) => JSON.parse(JSON.stringify(record));

describe('validateCodesRecord', () => {
  it('accepts a record the factory itself generated', () => {
    const record = validRecord();
    // Assert the fixture is non-degenerate BEFORE asserting it validates: a record with no draws
    // would pass the draw-readability check by having nothing to read.
    expect(record.events?.[0]?.drawDefinitions?.[0]?.structures?.length).toBeGreaterThan(0);
    const result = validateCodesRecord(record);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('REFUSES a draw whose structures are not linked — the case a field checklist cannot see', () => {
    const record = clone(validRecord());
    const draw = record.events[0].drawDefinitions[0];
    // Add a second, unlinked structure. Every field is present and well-typed; only the link is
    // missing — which is precisely the WTA defect that saved, validated and could never be read.
    draw.structures.push({
      structureId: 'orphan-structure',
      structureName: 'Qualifying',
      stage: 'QUALIFYING',
      stageSequence: 1,
      matchUps: [],
    });
    const result = validateCodesRecord(record);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/unreadable|LINK/i);
  });

  it('refuses a venue with no venueId — the defect that made every TE record unloadable', () => {
    const record = clone(validRecord());
    record.venues = [{ venueName: 'Somewhere', addresses: [{ city: 'Anytown' }] }];
    const result = validateCodesRecord(record);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('venueId');
  });

  it('refuses an entry naming a participant the record does not carry', () => {
    const record = clone(validRecord());
    record.events[0].entries = [...(record.events[0].entries ?? []), { participantId: 'nobody-here' }];
    const result = validateCodesRecord(record);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('nobody-here');
  });

  it('treats a missing provider as a WARNING, not an error — still a valid CODES document', () => {
    const record = clone(validRecord());
    delete record.parentOrganisation;
    const result = validateCodesRecord(record);
    expect(result.valid).toBe(true);
    expect(result.warnings.join(' ')).toContain('parentOrganisation');
  });

  it('refuses a record missing required fields rather than writing a half-record', () => {
    const result = validateCodesRecord({ tournamentId: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('tournamentName');
  });
});

describe('writeCodesRecord — validation gate', () => {
  const outDir = fs.mkdtempSync(path.join(tmpdir(), 'tods-gate-'));

  it('writes a valid record', async () => {
    const result = await writeCodesRecord(validRecord(), { outDir, provider: 'TEST' });
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('REFUSES to write an invalid record, and writes no file', async () => {
    const record = clone(validRecord());
    record.venues = [{ venueName: 'No id here' }];
    const target = path.join(outDir, 'TEST', `${record.tournamentId}.json`);
    fs.rmSync(target, { force: true });

    await expect(writeCodesRecord(record, { outDir, provider: 'TEST' })).rejects.toThrow(CodesValidationError);
    // The point of the gate: nothing reached disk. A thrown error that still wrote would be worse
    // than no gate, because the file would look produced.
    expect(fs.existsSync(target)).toBe(false);
  });

  it('allowInvalid writes anyway but never silently — every error is reported', async () => {
    const record = clone(validRecord());
    record.venues = [{ venueName: 'No id here' }];
    const reported: string[] = [];
    const result = await writeCodesRecord(record, {
      outDir,
      provider: 'TEST',
      allowInvalid: true,
      onDiagnostic: (m) => reported.push(m),
    });
    expect(fs.existsSync(result.path)).toBe(true);
    expect(reported.join(' ')).toContain('venueId');
  });
});

describe('validateCodesRecord — date format', () => {
  /**
   * Presence is not usability. This validator shipped checking that startDate EXISTS, and ten
   * Tournament Desk records passed the gate carrying `2025-06-19T00:00:00.000Z` before CFS refused
   * them at the save — the gate's whole purpose being to refuse them first.
   */
  it('refuses a datetime where CODES requires a calendar day', () => {
    const record = clone(validRecord());
    record.startDate = '2025-06-19T00:00:00.000Z';
    const result = validateCodesRecord(record);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('startDate must be YYYY-MM-DD');
  });

  it('refuses an end date before the start date', () => {
    const record = clone(validRecord());
    record.startDate = '2025-06-20';
    record.endDate = '2025-06-19';
    const result = validateCodesRecord(record);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('before or equal');
  });
});
