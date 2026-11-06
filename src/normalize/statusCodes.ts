import { matchUpStatusConstants } from 'tods-competition-factory';

// Exit reason codes → the CODES shape.
//
// WHY. A record written by an earlier generation of the factory can store an exit's reason code UNPADDED: a walkover
// won by side 1 reads `matchUpStatusCodes: ['W1']`. CODES defines that array as positional per side (`['', 'W1']`:
// side 2 walked over, reason W1) and gives the reason a keyed home, `sideStatusCodes: { 2: 'W1' }`. The current
// integrity scan reads the unpadded array's index 0 as side 1, so every such result is reported as
// EXIT_CODE_ON_WINNER_SIDE — the result is right and only the encoding is foreign. Measured on one ingest corpus:
// 1,398 findings across 99 of 144 records, every one of them this.
//
// THE RULE IS THE FACTORY'S OWN (its boundary split of submitted codes): an array is trusted for its VALUES, not its
// positions. A single exit's reason belongs to the side that did not win, read from `winningSide`; a double exit
// attributes both sides, a lone code covering both.
//
// ONLY THE UNAMBIGUOUS STATUSES ARE TOUCHED. A reason for ABANDONED / CANCELLED / INCOMPLETE belongs to the match, not
// a side, and anything outside the exit statuses below is left exactly as stored rather than guessed at.

const { WALKOVER, DEFAULTED, RETIRED, DOUBLE_WALKOVER, DOUBLE_DEFAULT } = matchUpStatusConstants;
const SINGLE_EXITS = new Set<string>([WALKOVER, DEFAULTED, RETIRED]);
const DOUBLE_EXITS = new Set<string>([DOUBLE_WALKOVER, DOUBLE_DEFAULT]);

interface StatusCodedMatchUp {
  matchUpStatus?: string;
  winningSide?: number;
  matchUpStatusCodes?: unknown[];
  sideStatusCodes?: Record<number, string>;
}

const codeOf = (code: unknown): string | undefined => {
  const value = typeof code === 'object' && code !== null ? (code as { code?: unknown }).code : code;
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value ? value : undefined;
};

function attributeCodes(matchUpStatus: string, winningSide: number | undefined, codes: (string | undefined)[]) {
  const present = codes.filter((code): code is string => !!code);
  if (DOUBLE_EXITS.has(matchUpStatus)) {
    const sideStatusCodes: Record<number, string> = {};
    for (const sideNumber of [1, 2]) {
      const code = codes[sideNumber - 1] ?? (present.length === 1 ? present[0] : undefined);
      if (code) sideStatusCodes[sideNumber] = code;
    }
    return sideStatusCodes;
  }
  if (SINGLE_EXITS.has(matchUpStatus) && (winningSide === 1 || winningSide === 2)) {
    const exitingSide = 3 - winningSide;
    // A positional pair already names the exiting side; a lone code is a value without a position.
    return { [exitingSide]: (codes.length === 2 ? codes[exitingSide - 1] : undefined) ?? present[0] } as Record<number, string>;
  }
  return undefined;
}

/** Normalize one matchUp in place. Returns true when anything changed. */
export function normalizeMatchUpStatusCodes(matchUp: StatusCodedMatchUp): boolean {
  const { matchUpStatus, winningSide } = matchUp;
  const stored = matchUp.matchUpStatusCodes;
  if (!matchUpStatus || !Array.isArray(stored) || !stored.length) return false;

  const codes = stored.map(codeOf);
  if (!codes.some(Boolean)) return false;
  const attributed = attributeCodes(matchUpStatus, winningSide, codes);
  if (!attributed) return false;

  // A record that already carries the keyed form is CODES-native: its own attribution wins, and only the positional
  // projection is brought into line with it.
  const keyed = matchUp.sideStatusCodes && Object.keys(matchUp.sideStatusCodes).length ? matchUp.sideStatusCodes : attributed;
  const positional = [1, 2].map((sideNumber) => keyed[sideNumber] ?? '');
  const unchanged = keyed === matchUp.sideStatusCodes && stored.length === 2 && stored.every((code, i) => code === positional[i]);
  if (unchanged) return false;

  matchUp.matchUpStatusCodes = positional;
  matchUp.sideStatusCodes = keyed;
  return true;
}

/** Every matchUp in every structure (nested structures and tie matchUps included). Returns how many changed. */
export function normalizeRecordStatusCodes(record: { events?: unknown[] }): number {
  let changed = 0;
  const visit = (matchUp: any) => {
    if (normalizeMatchUpStatusCodes(matchUp)) changed += 1;
    for (const tieMatchUp of matchUp?.tieMatchUps ?? []) if (normalizeMatchUpStatusCodes(tieMatchUp)) changed += 1;
  };
  const walk = (structures: any[] | undefined) => {
    for (const structure of structures ?? []) {
      for (const matchUp of structure?.matchUps ?? []) visit(matchUp);
      walk(structure?.structures);
    }
  };
  for (const event of (record.events ?? []) as any[]) {
    for (const drawDefinition of event?.drawDefinitions ?? []) walk(drawDefinition?.structures);
  }
  return changed;
}
