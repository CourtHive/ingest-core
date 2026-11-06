import { mocksEngine, queryGovernor } from 'tods-competition-factory';
import { describe, expect, it } from 'vitest';

import { normalizeMatchUpStatusCodes, normalizeRecordStatusCodes } from './statusCodes';

describe('normalizeMatchUpStatusCodes', () => {
  it('attributes a lone code on a single exit to the side that did not win', () => {
    const matchUp: any = { matchUpStatus: 'WALKOVER', winningSide: 1, matchUpStatusCodes: ['W1'] };
    expect(normalizeMatchUpStatusCodes(matchUp)).toBe(true);
    expect(matchUp).toMatchObject({ matchUpStatusCodes: ['', 'W1'], sideStatusCodes: { 2: 'W1' } });

    const other: any = { matchUpStatus: 'RETIRED', winningSide: 2, matchUpStatusCodes: ['RJ'] };
    normalizeMatchUpStatusCodes(other);
    expect(other).toMatchObject({ matchUpStatusCodes: ['RJ', ''], sideStatusCodes: { 1: 'RJ' } });
  });

  it('trusts a positional pair for the exiting side and leaves an already-correct matchUp untouched', () => {
    const matchUp: any = { matchUpStatus: 'DEFAULTED', winningSide: 1, matchUpStatusCodes: ['', 'DM'] };
    expect(normalizeMatchUpStatusCodes(matchUp)).toBe(true);
    expect(matchUp.sideStatusCodes).toEqual({ 2: 'DM' });
    expect(normalizeMatchUpStatusCodes(matchUp)).toBe(false);
  });

  it('keeps an existing keyed attribution as the authority', () => {
    const matchUp: any = { matchUpStatus: 'WALKOVER', winningSide: 1, matchUpStatusCodes: ['W3'], sideStatusCodes: { 2: 'W2' } };
    normalizeMatchUpStatusCodes(matchUp);
    expect(matchUp).toMatchObject({ matchUpStatusCodes: ['', 'W2'], sideStatusCodes: { 2: 'W2' } });
  });

  it('attributes both sides of a double exit, a lone code covering both', () => {
    const matchUp: any = { matchUpStatus: 'DOUBLE_WALKOVER', matchUpStatusCodes: ['WOWO'] };
    normalizeMatchUpStatusCodes(matchUp);
    expect(matchUp).toMatchObject({ matchUpStatusCodes: ['WOWO', 'WOWO'], sideStatusCodes: { 1: 'WOWO', 2: 'WOWO' } });
  });

  it('reads the record shape an earlier version stored', () => {
    const matchUp: any = { matchUpStatus: 'WALKOVER', winningSide: 2, matchUpStatusCodes: [{ code: 'W4', sideNumber: 1 }] };
    normalizeMatchUpStatusCodes(matchUp);
    expect(matchUp.sideStatusCodes).toEqual({ 1: 'W4' });
  });

  it('does not guess for statuses whose reason belongs to the match, or for results without a winner', () => {
    for (const matchUp of [
      { matchUpStatus: 'ABANDONED', matchUpStatusCodes: ['OA'] },
      { matchUpStatus: 'COMPLETED', winningSide: 1, matchUpStatusCodes: ['X'] },
      { matchUpStatus: 'WALKOVER', matchUpStatusCodes: ['W1'] },
      { matchUpStatus: 'WALKOVER', winningSide: 1, matchUpStatusCodes: [] },
      { matchUpStatus: 'WALKOVER', winningSide: 1 },
    ]) {
      const before = JSON.stringify(matchUp);
      expect(normalizeMatchUpStatusCodes(matchUp as any)).toBe(false);
      expect(JSON.stringify(matchUp)).toBe(before);
    }
  });
});

describe('normalizeRecordStatusCodes', () => {
  it('reaches nested structures and tie matchUps, and counts what it changed', () => {
    const exit = () => ({ matchUpStatus: 'WALKOVER', winningSide: 1, matchUpStatusCodes: ['W1'] });
    const record = {
      events: [
        {
          drawDefinitions: [
            {
              structures: [
                { matchUps: [exit(), { matchUpStatus: 'COMPLETED', winningSide: 1 }] },
                { structures: [{ matchUps: [{ ...exit(), tieMatchUps: [exit()] }] }] },
              ],
            },
          ],
        },
      ],
    };
    expect(normalizeRecordStatusCodes(record)).toBe(3);
    expect(normalizeRecordStatusCodes(record)).toBe(0);
  });
});

describe('the factory reads a normalized record back', () => {
  it('an unpadded exit code is refused as EXIT_CODE_ON_WINNER_SIDE before normalization and clean after', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], completeAllMatchUps: true });
    const walkover = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find((m: any) => m.roundNumber === 1);
    // the premise: side 1 won, so the unpadded code sits at the WINNER's index — the case the scan refuses
    expect(walkover.winningSide).toBe(1);
    Object.assign(walkover, { matchUpStatus: 'WALKOVER', matchUpStatusCodes: ['W1'], score: undefined });

    const errors = () =>
      ((queryGovernor.getTournamentInconsistencies({ tournamentRecord }) as any).inconsistencies ?? [])
        .filter((i: any) => i.severity === 'error')
        .map((i: any) => i.issueType);
    expect(errors()).toContain('EXIT_CODE_ON_WINNER_SIDE');
    expect(normalizeRecordStatusCodes(tournamentRecord)).toBe(1);
    expect(errors()).toEqual([]);
  });
});
