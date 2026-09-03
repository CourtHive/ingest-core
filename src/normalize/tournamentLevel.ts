import type { TournamentLevelUnion } from 'tods-competition-factory';

// `Tournament.tournamentLevel` — the organisational scope of a competition (CLUB, REGIONAL,
// NATIONAL, INTERNATIONAL, …), and until now produced by nothing.
//
// The field was WRITTEN by factory sanctioning activation and READ by nobody, and no ingest adapter
// emitted it at all. CA's call was to capture it from the adapters now and give it a consumer (the
// provider calendar) later — the fact is in the sources today and is expensive to retrofit once the
// adapters are written.
//
// NOT the same concept as a ranking policy's numeric `level` (1–15), which is a points TIER. The
// factory says so itself in `tournamentDetails.ts`: "the tier is orthogonal to tournamentLevel
// (organizational scope)". Two different ideas sharing a word.
//
// SHAPE OF THE ASSUMPTION, following `SLAM_CURRENCIES`. Sources publish their own tier vocabulary,
// not CODES enum values, so mapping is unavoidable. What makes it safe is that it is auditable:
// one table, keyed by each source's OWN words, every entry naming the basis on which it is asserted,
// and anything unrecognised resolving to `undefined` WITH a reported reason rather than to a guess.
// `tournamentLevel` is optional in CODES, so "absent" is a legitimate answer. A wrong value is not —
// it is indistinguishable downstream from a measured one.

export interface LevelAssumption {
  level: TournamentLevelUnion;
  /** why this mapping is asserted, so a later reader can re-verify rather than re-derive */
  basis: string;
}

const INTERNATIONAL_TOUR = (tier: string): LevelAssumption => ({
  level: 'INTERNATIONAL',
  basis: `${tier} is a tier of an international professional circuit — entry is open across nations and the calendar is published by the international body, not a national one`,
});

/**
 * Keyed by ingest source, then by the source's own published vocabulary (lower-cased).
 *
 * Deliberately NOT generalised from what happens to be on disk. Only one value (`Grand Slam`) is
 * present in the captured corpus; the rest are the tour's published tiers. Anything outside this
 * table is reported, never assumed — inferring a whole vocabulary from a single observed sample is
 * exactly the error that produced a wrong claim about the CODES schema earlier today.
 */
export const SOURCE_TOURNAMENT_LEVELS: Record<string, Record<string, LevelAssumption>> = {
  wta: {
    'grand slam': INTERNATIONAL_TOUR('A Grand Slam'),
    'wta 1000': INTERNATIONAL_TOUR('WTA 1000'),
    'wta 500': INTERNATIONAL_TOUR('WTA 500'),
    'wta 250': INTERNATIONAL_TOUR('WTA 250'),
    'wta 125': INTERNATIONAL_TOUR('WTA 125'),
    'wta finals': INTERNATIONAL_TOUR('The WTA Finals'),
  },
};

export interface LevelResolution {
  level?: TournamentLevelUnion;
  /** present when nothing was produced, and always says WHY — never silently absent */
  issue?: string;
}

/**
 * Resolve a source's own level wording to a CODES `tournamentLevel`.
 *
 * Returns `{}` for an absent value: a source that says nothing is not a problem to report, it is
 * simply a tournament whose scope we were not told. A value we do not recognise IS reported —
 * that is a vocabulary the table has not caught up with, and it should be seen.
 */
export function resolveTournamentLevel({ source, value }: { source: string; value?: unknown }): LevelResolution {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string') return { issue: `${source}: level ${JSON.stringify(value)} is not a string` };

  const vocabulary = SOURCE_TOURNAMENT_LEVELS[source.trim().toLowerCase()];
  if (!vocabulary) return { issue: `${source}: no level vocabulary is declared for this source` };

  const assumption = vocabulary[value.trim().toLowerCase()];
  if (!assumption) {
    const known = Object.keys(vocabulary).join(', ');
    return { issue: `${source}: level ${JSON.stringify(value)} is not one of [${known}]` };
  }
  return { level: assumption.level };
}
