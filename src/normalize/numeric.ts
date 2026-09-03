// Numbers arriving as strings, and the traps in converting them.
//
// WHY THIS EXISTS. A Slam draw feed publishes `drawSize` as the STRING `"128"` while `totalRounds`
// beside it in the same object is the NUMBER 7. A converter written against a reproduced fixture
// typed `drawSize: 128`, passed its own spec, and silently failed to map every numeric round in the
// real file. Nothing threw. The ladder simply came out half-populated, which looks like a
// tournament that paid fewer rounds rather than a bug.
//
// `Number()` is the wrong tool on its own, because it says YES to things that are not numbers:
//
//   Number('')        === 0          Number(null)  === 0        Number([])      === 0
//   Number('   ')     === 0          Number(true)  === 1        Number(['5'])   === 5
//   Number('0x10')    === 16         Number('1e3') === 1000     Number('Infinity') === Infinity
//
// Every one of those coerces an absent, empty or non-numeric value into a plausible number. In feed
// data that is worse than throwing: `0` is a legitimate prize amount and a legitimate draw size is
// never `0`, so a coerced zero is indistinguishable from a measured one downstream.
//
// So these helpers accept ONLY a plain decimal numeral, and say so explicitly rather than coercing.

/** A plain decimal numeral, optionally signed, with optional surrounding whitespace. */
const PLAIN_DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Is this a number, or a string that unambiguously spells one?
 *
 * Deliberately narrow. Hex (`'0x10'`), scientific notation (`'1e3'`), `'Infinity'` and `'NaN'` all
 * return false: a feed publishing those where a count belongs is a signal to investigate, not a
 * value to silently reinterpret. Booleans, arrays, `null` and `undefined` are never numeric however
 * cheerfully `Number()` converts them.
 */
export function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  return PLAIN_DECIMAL.test(value.trim());
}

/** The value as a number, or `undefined` when it is not unambiguously one. Never coerces. */
export function parseNumeric(value: unknown): number | undefined {
  if (!isNumeric(value)) return undefined;
  return typeof value === 'number' ? value : Number(String(value).trim());
}

/** A whole, non-negative count — a draw size, a round, a seed. Rejects fractions and negatives. */
export function parseCount(value: unknown): number | undefined {
  const parsed = parseNumeric(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * A human-formatted number: `"1,450,000"` → `1450000`.
 *
 * Separate from {@link parseNumeric} on purpose. Thousands separators are a PRESENTATION choice a
 * publisher made, so stripping them is an interpretation — and one that must not leak into the
 * strict parser, where a stray comma should still be a reason to stop and look.
 */
export function parseFormattedNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const stripped = value.replaceAll(',', '').trim();
  return isNumeric(stripped) ? Number(stripped) : undefined;
}
