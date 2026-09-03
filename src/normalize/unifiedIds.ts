// The one place every adapter records what an ingested element is called in the source
// federation's system.
//
// Before this, external identity survived only as CONVENTION: a `utr-` / `cts-` prefix on
// our own ids, plus (in the UTR adapter) an off-schema `provider` object that no factory
// type declares and nothing downstream reads. None of that is queryable, none of it
// survives a re-id, and none of it reaches the read model.
//
// CODES already has the vocabulary — the `Unified*ID` family. These helpers emit it, so
// the five adapters stamp identity identically instead of five times differently.
//
// The two id systems are complementary, not redundant:
//
//   record.tournamentId          'utr-306618'   OURS   — namespaced, collision-free
//   tournamentOtherIds[0]        '306618'       THEIRS — queryable, joinable, exact
//
// Keep BOTH. The prefix keeps ids unique across sources in one CourtHive namespace; the
// Unified entry is the address results are sent back to.

/**
 * A federation as an id-issuing authority.
 *
 * `organisationId` deliberately matches what the adapter already puts in
 * `tournamentRecord.parentOrganisation.organisationId`, so the origin entry and the
 * parentOrganisation name the same organisation and a consumer can join them. For a
 * wholly-ingested record the provider IS the origin and the read model's `provider_id`
 * and `origin_organisation_id` agree — that is correct, not redundant. They diverge the
 * moment a CourtHive provider carries an event sanctioned elsewhere, which is the case
 * the columns exist for.
 */
export interface OriginOrganisation {
  /** stable organisation id — same value the adapter uses for parentOrganisation */
  organisationId: string;
  /** human-readable name, e.g. 'Universal Tennis' */
  uniqueOrganisationName?: string;
  /** local id namespace, e.g. 'utr' — see `localId` */
  idPrefix: string;
}

/**
 * Build one of OUR ids from the source's own id parts.
 *
 * Every adapter prefixes so that two federations issuing the same numeric id cannot
 * collide in one CourtHive namespace. Applied uniformly, the source id is also
 * recoverable by stripping — which is what makes it defensible NOT to add a Unified entry
 * at every single grain (matchUp and structure grain have no member of the family, and do
 * not need one while the prefix rule holds).
 */
export function localId(origin: OriginOrganisation, ...parts: (string | number)[]): string {
  return [origin.idPrefix, ...parts].join('-');
}

// The Unified*ID shapes. These MIRROR the factory's `UnifiedTournamentID` /
// `UnifiedEventID` / `UnifiedDrawID` / `UnifiedParticipantID` / `UnifiedPersonID` and are
// declared locally because `isOrigin` at tournament grain and `UnifiedDrawID` entirely are
// not in a published factory yet. Swap these for the factory imports at the version bump
// that carries them.

interface UnifiedIdBase {
  organisationId: string;
  uniqueOrganisationName?: string;
  isOrigin?: boolean;
  createdAt?: string;
}

export interface IngestTournamentID extends UnifiedIdBase {
  tournamentId: string;
}
export interface IngestEventID extends UnifiedIdBase {
  tournamentId?: string;
  eventId?: string;
}
export interface IngestDrawID extends UnifiedIdBase {
  tournamentId?: string;
  eventId?: string;
  drawId?: string;
}
export interface IngestParticipantID extends UnifiedIdBase {
  participantId: string;
}
export interface IngestPersonID extends UnifiedIdBase {
  personId: string;
}

const identity = (origin: OriginOrganisation) => ({
  organisationId: origin.organisationId,
  ...(origin.uniqueOrganisationName ? { uniqueOrganisationName: origin.uniqueOrganisationName } : {}),
});

/** Where the whole RECORD came from. Always the origin — an ingested record has exactly one source. */
export function originTournamentIds(origin: OriginOrganisation, tournamentId: string | number): IngestTournamentID[] {
  return [{ ...identity(origin), tournamentId: String(tournamentId), isOrigin: true }];
}

/**
 * Where an EVENT came from.
 *
 * `eventId` is omitted rather than nulled when the source has no event-grain object. UTR
 * is the case that forces this: its grain is tournament → draw ("flight"), so a CODES
 * event under a UTR record is a synthetic gender × matchUpType grouping with no UTR
 * counterpart. Omitted means "they do not model this", which is the truth; a fabricated id
 * would be worse than none.
 */
export function originEventIds(
  origin: OriginOrganisation,
  ids: { tournamentId?: string | number; eventId?: string | number },
): IngestEventID[] {
  return [{ ...identity(origin), ...optionalIds(ids), isOrigin: true }];
}

/**
 * Where a DRAW came from — the grain that matters most for a source like UTR, where the
 * flight is a real remote object with its own GUID and its own metadata while the event
 * above it is our invention.
 */
export function originDrawIds(
  origin: OriginOrganisation,
  ids: { tournamentId?: string | number; eventId?: string | number; drawId?: string | number },
): IngestDrawID[] {
  return [{ ...identity(origin), ...optionalIds(ids), isOrigin: true }];
}

/** The source's id for a PARTICIPANT — works for INDIVIDUAL, PAIR and TEAM alike. */
export function originParticipantIds(
  origin: OriginOrganisation,
  participantId: string | number,
): IngestParticipantID[] {
  return [{ ...identity(origin), participantId: String(participantId), isOrigin: true }];
}

/** The source's id for a PERSON. */
export function originPersonIds(origin: OriginOrganisation, personId: string | number): IngestPersonID[] {
  return [{ ...identity(origin), personId: String(personId), isOrigin: true }];
}

function optionalIds(ids: Record<string, string | number | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ids)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  );
}
