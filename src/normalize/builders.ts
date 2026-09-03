// TODS-shape helpers. Distilled from the TYPTI ingestion playbook in
// `Mentat/statuses/2026-05-18-typti-tods-conversion.md` so adapters
// don't independently rediscover the same factory-CODES gotchas.
//
// These helpers do NOT replace the factory's own engines — for any
// non-trivial draw construction, prefer driving the factory directly
// via mocksEngine or tournamentEngine + drawEngine. The helpers here
// cover the "I'm hand-authoring a tournamentRecord from foreign JSON"
// path, which is the common shape for adapters.

import type { MatchUp, PositionAssignment } from 'tods-competition-factory';

/**
 * Compute the canonical `matchUp.drawPositions` for a SE bracket cell.
 *
 * Round 1: [roundPosition * 2 - 1, roundPosition * 2].
 *
 * Round 2+ requires BYE pre-advancement and is NOT covered here — let
 * the factory's structure generators handle it, or compute via
 * `positionAssignments` walking.
 */
export function round1DrawPositions(roundPosition: number): [number, number] {
  return [roundPosition * 2 - 1, roundPosition * 2];
}

/**
 * Emit all positions 1..drawSize as `positionAssignments`. Unfilled
 * slots are acceptable (no participantId, no bye) — used for PLAY_OFF
 * positions awaiting LOSER feed.
 */
export function emptyPositionAssignments(drawSize: number): PositionAssignment[] {
  return Array.from({ length: drawSize }, (_, i) => ({ drawPosition: i + 1 }));
}

/**
 * Required structure field. Without it, `positionTargets` short-circuits
 * to `targetByWinRatio` and returns zero target matchUps — winner
 * advancement silently fails. This was the final blocker in the TYPTI
 * conversion.
 */
export const STRUCTURE_FINISHING_POSITION_DEFAULT = 'ROUND_OUTCOME';

/**
 * Sex inference from event.gender — needed because adapter sources
 * often omit `person.sex` but it's required for ranking pipelines.
 * Note: XD by itself is insufficient; only MS/WS/MD/WD disambiguate.
 */
export function inferSexFromEventGender(eventGender: 'MALE' | 'FEMALE' | 'MIXED'): 'MALE' | 'FEMALE' | undefined {
  if (eventGender === 'MALE') return 'MALE';
  if (eventGender === 'FEMALE') return 'FEMALE';
  return undefined;
}

/**
 * Common placeholder strings that adapters should NOT emit as
 * participants. Treat as drawPosition-only entries instead.
 */
export const PLACEHOLDER_PARTICIPANT_TOKENS = new Set([
  'BYE',
  '—',
  '-',
  'TBD',
  'Bye',
  'bye',
]);

export function isPlaceholderParticipantName(name: string | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (PLACEHOLDER_PARTICIPANT_TOKENS.has(trimmed)) return true;
  if (/^Seed\s+\d+$/i.test(trimmed)) return true;
  if (/^Team\s+\d+$/i.test(trimmed)) return true;
  if (/^Player\s+[A-Z]+$/.test(trimmed)) return true;
  return false;
}

/**
 * Minimal shape check for a hand-authored matchUp. Surfaces the
 * fields the factory will silently ignore advancement on if missing.
 * Returns a list of missing-field codes — empty when shape is OK.
 */
export function lintMatchUpShape(matchUp: Partial<MatchUp>): string[] {
  const missing: string[] = [];
  if (matchUp.matchUpId === undefined) missing.push('matchUpId');
  if (matchUp.roundNumber === undefined) missing.push('roundNumber');
  if (matchUp.roundPosition === undefined) missing.push('roundPosition');
  if (!matchUp.drawPositions || matchUp.drawPositions.length !== 2) missing.push('drawPositions[2]');
  if (matchUp.matchUpStatus === undefined) missing.push('matchUpStatus');
  return missing;
}
