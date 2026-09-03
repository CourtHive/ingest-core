import { describe, expect, it } from 'vitest';

import { isNumeric, parseCount, parseFormattedNumber, parseNumeric } from './numeric';

/**
 * Both directions, deliberately.
 *
 * A one-directional test — only feeding it numbers and checking it says yes — is how a coercion bug
 * survives review. The `rejects` tables below are the half that matters: every entry is something
 * `Number()` converts to a plausible number.
 */
describe('isNumeric', () => {
  it.each([
    ['a plain integer string', '128'],
    ['surrounding whitespace', '  128  '],
    ['an actual number', 128],
    ['zero as a string', '0'],
    ['zero as a number', 0],
    ['a negative', '-5'],
    ['an explicit positive', '+5'],
    ['a decimal', '3.5'],
    ['a leading-dot decimal', '.5'],
  ])('accepts %s', (_label, value) => {
    expect(isNumeric(value)).toEqual(true);
    expect(parseNumeric(value)).toEqual(Number(String(value).trim()));
  });

  it.each([
    ['an empty string', '', 0],
    ['whitespace only', '   ', 0],
    ['null', null, 0],
    ['an empty array', [], 0],
    ['a single-element array', ['5'], 5],
    ['true', true, 1],
    ['false', false, 0],
    ['hex notation', '0x10', 16],
    ['scientific notation', '1e3', 1000],
    ['Infinity', 'Infinity', Infinity],
  ])('rejects %s — which Number() would turn into %s', (_label, value, coerced) => {
    // the trap, stated: Number() is happy to produce a plausible figure from all of these
    expect(Number(value as any)).toEqual(coerced);
    expect(isNumeric(value)).toEqual(false);
    expect(parseNumeric(value)).toBeUndefined();
  });

  it.each([
    ['undefined', undefined],
    ['a word', 'many'],
    ['a trailing letter', '12a'],
    ['a leading letter', 'a12'],
    ['the string NaN', 'NaN'],
    ['NaN itself', Number.NaN],
    ['an embedded comma', '1,450'],
    ['an object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isNumeric(value)).toEqual(false);
    expect(parseNumeric(value)).toBeUndefined();
  });
});

describe('parseCount', () => {
  it.each([
    ['128', 128],
    ['0', 0],
    [16, 16],
  ])('accepts whole non-negative %s', (value, expected) => {
    expect(parseCount(value)).toEqual(expected);
  });

  it.each([['a fraction', '3.5'], ['a negative', '-1'], ['empty', ''], ['a word', 'eight']])(
    'rejects %s',
    (_label, value) => {
      expect(parseCount(value)).toBeUndefined();
    },
  );
});

describe('parseFormattedNumber', () => {
  it('parses thousands separators the strict parser refuses', () => {
    expect(parseFormattedNumber('1,450,000')).toEqual(1450000);
    expect(isNumeric('1,450,000')).toEqual(false);
  });

  it.each([
    ['140,000', 140000],
    ['  5,500,000  ', 5500000],
    ['0', 0],
    [42, 42],
  ])('accepts %s', (value, expected) => {
    expect(parseFormattedNumber(value)).toEqual(expected);
  });

  it.each([['empty', ''], ['whitespace', '  '], ['a word', 'TBC'], ['null', null], ['a bare comma', ',']])(
    'rejects %s rather than returning 0',
    (_label, value) => {
      expect(parseFormattedNumber(value)).toBeUndefined();
    },
  );
});
