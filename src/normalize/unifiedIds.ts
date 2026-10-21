import type {
  UnifiedDrawID,
  UnifiedEventID,
  UnifiedPersonID,
  UnifiedTournamentID,
  UnifiedParticipantID,
} from 'tods-competition-factory';

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

// The Unified*ID shapes are the factory's own. This module used to declare local MIRRORS of them
// (`IngestTournamentID` and friends), because `UnifiedTournamentID.isOrigin` and `UnifiedDrawID`
// were not yet in a published factory. Both shipped in 6.27.0, below this package's peer floor
// (^7.1.0), so the tournament, event and draw grains are now the factory types themselves.
//
// The participant and person grains keep ONE field the factory does not declare: `isOrigin`. The
// helpers below have always written it at every grain, and the factory's concept doc states the
// at-most-one-origin rule for every member of the family, but `UnifiedParticipantID` and
// `UnifiedPersonID` have no such field. That is a real gap rather than something to delete, so it is
// stated here as an intersection rather than hidden behind a mirror. Closing it (the factory adds
// the field, or these helpers stop writing it) is an owner decision.

/** @deprecated the factory's `UnifiedTournamentID`; import that instead. Kept so importers of 0.2.x compile. */
export type IngestTournamentID = UnifiedTournamentID;
/** @deprecated the factory's `UnifiedEventID`; import that instead. Kept so importers of 0.2.x compile. */
export type IngestEventID = UnifiedEventID;
/** @deprecated the factory's `UnifiedDrawID`; import that instead. Kept so importers of 0.2.x compile. */
export type IngestDrawID = UnifiedDrawID;
/** The factory's `UnifiedParticipantID` plus `isOrigin`, which it does not declare (see above). */
export type IngestParticipantID = UnifiedParticipantID & { isOrigin?: boolean };
/** The factory's `UnifiedPersonID` plus `isOrigin`, which it does not declare (see above). */
export type IngestPersonID = UnifiedPersonID & { isOrigin?: boolean };

const identity = (origin: OriginOrganisation) => ({
  organisationId: origin.organisationId,
  ...(origin.uniqueOrganisationName ? { uniqueOrganisationName: origin.uniqueOrganisationName } : {}),
});

/** Where the whole RECORD came from. Always the origin — an ingested record has exactly one source. */
export function originTournamentIds(origin: OriginOrganisation, tournamentId: string | number): UnifiedTournamentID[] {
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
): UnifiedEventID[] {
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
): UnifiedDrawID[] {
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
