import { localId, originDrawIds, originEventIds, originParticipantIds, originPersonIds, originTournamentIds } from './unifiedIds';
import { describe, expect, it } from 'vitest';

const ORIGIN = { organisationId: 'org-1', uniqueOrganisationName: 'Example Federation', idPrefix: 'ex' };
const identity = { organisationId: 'org-1', uniqueOrganisationName: 'Example Federation' };

describe('unifiedIds — emitters of the factory Unified*ID shapes', () => {
  it('prefixes our own ids so two sources cannot collide', () => {
    expect(localId(ORIGIN, 306618, 'MALE-SINGLES')).toEqual('ex-306618-MALE-SINGLES');
  });

  it('stamps the record origin at tournament grain', () => {
    expect(originTournamentIds(ORIGIN, 306618)).toEqual([{ ...identity, tournamentId: '306618', isOrigin: true }]);
  });

  it('omits an id the source does not model, rather than nulling or inventing it', () => {
    expect(originEventIds(ORIGIN, { tournamentId: 306618 })).toEqual([{ ...identity, tournamentId: '306618', isOrigin: true }]);
    expect(originDrawIds(ORIGIN, { tournamentId: 1, eventId: '', drawId: 'g-1' })).toEqual([
      { ...identity, tournamentId: '1', drawId: 'g-1', isOrigin: true },
    ]);
  });

  it('writes isOrigin at participant and person grain too, which the factory types do not declare', () => {
    // The gap this module states as `Unified*ID & { isOrigin?: boolean }`. If it is closed by no
    // longer writing the flag, this test is what changes.
    expect(originParticipantIds(ORIGIN, 42)).toEqual([{ ...identity, participantId: '42', isOrigin: true }]);
    expect(originPersonIds(ORIGIN, 42)).toEqual([{ ...identity, personId: '42', isOrigin: true }]);
  });

  it('leaves uniqueOrganisationName out when the origin has none', () => {
    expect(originTournamentIds({ organisationId: 'org-2', idPrefix: 'x' }, 'T')).toEqual([
      { organisationId: 'org-2', tournamentId: 'T', isOrigin: true },
    ]);
  });
});
