import { describe, it, expect } from 'vitest';

import { deriveVenueId, deriveCourtId, ensureVenueIdentity, normalizeVenueName, SYNTHESIZED_IDENTITY } from './venueIdentity';

import type { Tournament } from 'tods-competition-factory';

/**
 * The property under test is STABILITY, not shape. An id that is merely present satisfies the
 * validator and still ruins the data: mint it from the tournament and one club becomes fifty
 * venues; mint it at random and it becomes a new venue on every harvest. Both pass a "has a
 * venueId" check, which is why that check is not what is asserted here.
 */
const record = (venues: any[]): Tournament => ({ tournamentId: 't1', venues }) as unknown as Tournament;

describe('normalizeVenueName', () => {
  it('folds the difference sources disagree on', () => {
    // Observed across the TE corpus: the same club written with and without diacritics.
    expect(normalizeVenueName('TPC Grötzingen')).toBe(normalizeVenueName('TPC Grotzingen'));
    expect(normalizeVenueName('  ARIDEA   TENNIS  CLUB ')).toBe('aridea tennis club');
  });

  it('keeps punctuation, because a false merge cannot be undone', () => {
    // A split can be reconciled later; a merge has already lost which venue was which.
    expect(normalizeVenueName('St. Georgen')).not.toBe(normalizeVenueName('St Georgen'));
  });
});

describe('deriveVenueId', () => {
  it('is stable across calls for the same name', () => {
    expect(deriveVenueId('te', 'TC Bachten De Kupe')).toBe(deriveVenueId('te', 'TC Bachten De Kupe'));
  });

  it('does NOT vary by tournament — the defect this replaces', () => {
    // The adapters minted localId(origin, tournamentId, 'venue'), so the National Tennis Center got
    // a fresh id at every event held there. Nothing in this signature can express a tournament.
    const first = deriveVenueId('ts', 'National Tennis Center');
    const second = deriveVenueId('ts', 'National Tennis Center');
    expect(first).toBe(second);
  });

  it('separates sources that happen to name the same club', () => {
    // Asserting they are the same place is a merge nobody reviewed; that is the registry's job.
    expect(deriveVenueId('te', 'Aridea')).not.toBe(deriveVenueId('ts', 'Aridea'));
  });

  it('separates different venues', () => {
    expect(deriveVenueId('te', 'Klosters')).not.toBe(deriveVenueId('te', 'TK LTC Houstka'));
  });
});

describe('deriveCourtId', () => {
  it('keys a court to its venue, not to a tournament', () => {
    const venueId = deriveVenueId('te', 'Klosters');
    expect(deriveCourtId(venueId, 'Court 2', 1)).toBe(deriveCourtId(venueId, 'Court 2', 1));
  });

  it('gives the same court name at different venues different ids', () => {
    const a = deriveCourtId(deriveVenueId('te', 'Klosters'), 'Court 2', 1);
    const b = deriveCourtId(deriveVenueId('te', 'Aridea'), 'Court 2', 1);
    expect(a).not.toBe(b);
  });

  it('falls back to position for a nameless court', () => {
    const venueId = deriveVenueId('te', 'Klosters');
    expect(deriveCourtId(venueId, undefined, 0)).not.toBe(deriveCourtId(venueId, undefined, 1));
  });
});

describe('ensureVenueIdentity', () => {
  it('fills a missing venueId and marks it synthesized', () => {
    const tournament = record([{ venueName: 'TPC Grötzingen' }]);
    const result = ensureVenueIdentity(tournament, 'te');

    const venue = (tournament as any).venues[0];
    expect(result.venuesFixed).toBe(1);
    expect(venue.venueId).toBe(deriveVenueId('te', 'TPC Grötzingen'));
    expect(venue.extensions?.find((e: any) => e.name === SYNTHESIZED_IDENTITY)?.value.basis).toBe('venueName');
  });

  it('LEAVES an existing venueId alone', () => {
    // The load-bearing half: an id already written has references, and rewriting it orphans them.
    const tournament = record([{ venueId: 'ts-ABC-venue', venueName: 'National Tennis Center' }]);
    const result = ensureVenueIdentity(tournament, 'ts');

    expect((tournament as any).venues[0].venueId).toBe('ts-ABC-venue');
    expect(result.venuesFixed).toBe(0);
    expect((tournament as any).venues[0].extensions).toBeUndefined();
  });

  it('reports a venue it cannot identify rather than minting something unstable', () => {
    // No id and no name: a random uuid here would mint a new venue on every harvest of one record.
    const tournament = record([{ addresses: [{ city: 'Chisinau' }] }]);
    const result = ensureVenueIdentity(tournament, 'te');

    expect(result.venuesFixed).toBe(0);
    expect(result.unresolved).toHaveLength(1);
    expect((tournament as any).venues[0].venueId).toBeUndefined();
  });

  it('gives courts ids under their venue', () => {
    const tournament = record([{ venueName: 'Klosters', courts: [{ courtName: 'Court 1' }, { courtName: 'Court 2' }] }]);
    const result = ensureVenueIdentity(tournament, 'te');

    const [venue] = (tournament as any).venues;
    expect(result.courtsFixed).toBe(2);
    expect(venue.courts[0].courtId).toBe(deriveCourtId(venue.venueId, 'Court 1', 0));
    expect(venue.courts[1].courtId).not.toBe(venue.courts[0].courtId);
  });

  it('is idempotent — a second pass changes nothing', () => {
    // The writer runs on every capture, and a conveyor re-captures the same event for days.
    const tournament = record([{ venueName: 'Aridea', courts: [{ courtName: 'Court 2' }] }]);
    ensureVenueIdentity(tournament, 'te');
    const snapshot = JSON.stringify(tournament);

    const second = ensureVenueIdentity(tournament, 'te');
    expect(second.venuesFixed).toBe(0);
    expect(second.courtsFixed).toBe(0);
    expect(JSON.stringify(tournament)).toBe(snapshot);
  });

  it('does not invent courts from a courtsCount', () => {
    // TE records carry `courtsCount: 8` and no courts array. Materialising eight phantom courts
    // would be fabricating data the source never gave.
    const tournament = record([{ venueName: 'TC Roger Club', courtsCount: 10 }]);
    ensureVenueIdentity(tournament, 'te');

    expect((tournament as any).venues[0].courts).toBeUndefined();
  });
});
