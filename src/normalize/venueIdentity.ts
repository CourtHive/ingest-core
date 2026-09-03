import { createHash } from 'node:crypto';

import type { Tournament, Venue } from 'tods-competition-factory';

/**
 * Give every scraped venue a STABLE identity.
 *
 * WHY THIS IS NOT OPTIONAL. `venueId` is required by CFS L2 validation, and a venue without one
 * fails the whole record: ten TE records were unloadable for exactly this reason, and 16 venues
 * across the TE and TS corpora still are. `validateTodsRecord` refuses them, correctly.
 *
 * WHY DERIVED FROM THE NAME, NOT THE TOURNAMENT. The existing adapters mint
 * `localId(origin, tournamentId, 'venue')`, which is deterministic per RECORD but forks per
 * TOURNAMENT: the National Tennis Center in Chisinau gets a different venueId at every event held
 * there, so a venue that hosts a weekly circuit becomes fifty venues. Deriving from the normalized
 * NAME instead means the same place resolves to the same id across tournaments, sources and
 * re-harvests, which is the only version of this that is worth anything to scheduling.
 *
 * WHY A HASH RATHER THAN THE `localId` JOIN. `localId`'s contract is that the source id is
 * recoverable by stripping the prefix. A scraped venue has NO source id — the name is all there is
 * — so there is nothing to recover, and joining a free-text name into an id would put spaces,
 * accents and punctuation into an identifier. The prefix is kept, because the rule it enforces
 * (two federations cannot collide in one CourtHive namespace) still applies.
 *
 * WHY IT IS MARKED. A synthesized identity must never be mistaken for one a federation issued.
 * Every venue this touches carries a `synthesizedIdentity` extension naming the basis, so a later
 * reconciliation against the facilities registry can find them — and `Venue.facilityId` stays free
 * for that reconciliation to fill in.
 */

/** Marker attached to any venue or court whose identity this module minted. */
export const SYNTHESIZED_IDENTITY = 'synthesizedIdentity';

/**
 * Fold a venue name to a stable key.
 *
 * Diacritics are stripped because the same club is written both ways across sources and even
 * across captures of one source — "TPC Grotzingen" and "TPC Grötzingen" are one venue, and a key
 * that disagrees would fork it silently. Case and internal whitespace go for the same reason.
 * Punctuation is kept: "St. Georgen" and "St Georgen" are the same place, but dropping punctuation
 * wholesale also merges names that genuinely differ, and a false merge is worse than a false split
 * (a split can be reconciled later; a merge has already lost which was which).
 */
export function normalizeVenueName(venueName: string): string {
  return venueName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function digest(value: string, length: number): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

/**
 * `<idPrefix>-venue-<12 hex>`, stable for a given (idPrefix, normalized name).
 *
 * The prefix is namespaced per source, so Tennis Europe and Universal Tennis naming the same club
 * still produce different ids. That is deliberate: this module cannot know they are the same place,
 * and asserting it here would be a merge nobody reviewed. Cross-source reconciliation is the
 * facilities registry's job, which is what `facilityId` is for.
 */
export function deriveVenueId(idPrefix: string, venueName: string): string {
  return `${idPrefix}-venue-${digest(`${idPrefix}:${normalizeVenueName(venueName)}`, 12)}`;
}

/**
 * `<venueId>-court-<8 hex>`, stable for a given (venueId, court name).
 *
 * Keyed on the venue rather than the tournament so "Court 2" at one club is one court all season.
 * A court with no name falls back to its position, which is stable only within a capture — but a
 * nameless court has nothing else to be keyed on, and an unstable id is still better than none,
 * because scheduling cannot reference a court that has no identifier at all.
 */
export function deriveCourtId(venueId: string, courtName: string | undefined, index: number): string {
  const basis = courtName?.trim() ? normalizeVenueName(courtName) : `position:${index}`;
  return `${venueId}-court-${digest(`${venueId}:${basis}`, 8)}`;
}

function mark(entity: { extensions?: any[] }, basis: string, normalized: string): void {
  const extensions = entity.extensions ?? [];
  if (extensions.some((extension) => extension?.name === SYNTHESIZED_IDENTITY)) return;
  extensions.push({ name: SYNTHESIZED_IDENTITY, value: { mintedBy: 'courthive-ingest', basis, normalized } });
  entity.extensions = extensions;
}

export interface VenueIdentityResult {
  venuesFixed: number;
  courtsFixed: number;
  /** Venues that could not be given an identity, with the reason. Never silently skipped. */
  unresolved: { venueName?: string; reason: string }[];
}

/**
 * Fill in any missing venue and court identity on a record, in place.
 *
 * Existing ids are LEFT ALONE. This is a floor, not a rewrite: an adapter that already mints a
 * venueId keeps it, because changing an id that has already been loaded would orphan whatever
 * references it. Only absence is filled.
 */
export function ensureVenueIdentity(record: Tournament, idPrefix: string): VenueIdentityResult {
  const result: VenueIdentityResult = { venuesFixed: 0, courtsFixed: 0, unresolved: [] };
  const venues: Venue[] = (record as any)?.venues ?? [];

  for (const venue of venues) {
    if (!venue.venueId) {
      if (!venue.venueName?.trim()) {
        // No id and no name is not something to paper over with a random uuid: it would mint a new
        // venue on every harvest of the same record. Report it and let validation refuse.
        result.unresolved.push({ venueName: venue.venueName, reason: 'no venueId and no venueName to derive one from' });
        continue;
      }
      venue.venueId = deriveVenueId(idPrefix, venue.venueName);
      mark(venue, 'venueName', normalizeVenueName(venue.venueName));
      result.venuesFixed += 1;
    }

    const courts = venue.courts ?? [];
    courts.forEach((court, index) => {
      if (court.courtId) return;
      court.courtId = deriveCourtId(venue.venueId, court.courtName, index);
      mark(court, court.courtName?.trim() ? 'courtName' : 'position', court.courtName?.trim() ?? `position:${index}`);
      result.courtsFixed += 1;
    });
  }

  return result;
}
