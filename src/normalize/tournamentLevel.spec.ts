import { describe, expect, it } from 'vitest';

import { SOURCE_TOURNAMENT_LEVELS, resolveTournamentLevel } from './tournamentLevel';

/**
 * Both directions. The half that matters is `refuses` — a resolver that only ever says yes would
 * happily stamp INTERNATIONAL onto a club night, and nothing downstream could tell.
 */
describe('resolveTournamentLevel', () => {
  it.each([
    ['Grand Slam', 'INTERNATIONAL'],
    ['WTA 1000', 'INTERNATIONAL'],
    ['WTA 125', 'INTERNATIONAL'],
  ])('maps the source vocabulary %s', (value, expected) => {
    expect(resolveTournamentLevel({ source: 'wta', value })).toEqual({ level: expected });
  });

  it.each([
    ['lower case', 'grand slam'],
    ['upper case', 'GRAND SLAM'],
    ['surrounding whitespace', '  Grand Slam  '],
  ])('is insensitive to %s', (_label, value) => {
    expect(resolveTournamentLevel({ source: 'wta', value }).level).toEqual('INTERNATIONAL');
  });

  it('is insensitive to the source key casing', () => {
    expect(resolveTournamentLevel({ source: ' WTA ', value: 'Grand Slam' }).level).toEqual('INTERNATIONAL');
  });

  describe('says nothing rather than guessing', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty string', ''],
    ])('returns nothing and reports nothing for %s — the source simply did not say', (_label, value) => {
      expect(resolveTournamentLevel({ source: 'wta', value })).toEqual({});
    });

    it('reports an unrecognised value instead of defaulting it', () => {
      const { level, issue } = resolveTournamentLevel({ source: 'wta', value: 'Club Championship' });

      expect(level).toBeUndefined();
      expect(issue).toContain('Club Championship');
      expect(issue).toContain('not one of');
    });

    it('reports a source with no declared vocabulary', () => {
      const { level, issue } = resolveTournamentLevel({ source: 'some-new-feed', value: 'Category A' });

      expect(level).toBeUndefined();
      expect(issue).toContain('no level vocabulary');
    });

    it('reports a non-string value rather than coercing it', () => {
      const { level, issue } = resolveTournamentLevel({ source: 'wta', value: 1000 });

      expect(level).toBeUndefined();
      expect(issue).toContain('not a string');
    });
  });

  /** The table is the audit trail; an entry without a stated basis cannot be re-verified. */
  it('every declared mapping states the basis on which it is asserted', () => {
    const entries = Object.entries(SOURCE_TOURNAMENT_LEVELS).flatMap(([source, vocabulary]) =>
      Object.entries(vocabulary).map(([term, assumption]) => ({ source, term, assumption })),
    );

    expect(entries.length).toBeGreaterThan(0);
    for (const { source, term, assumption } of entries) {
      expect(assumption.level, `${source}/${term}`).toBeTruthy();
      expect(assumption.basis.length, `${source}/${term} basis`).toBeGreaterThan(20);
    }
  });
});
