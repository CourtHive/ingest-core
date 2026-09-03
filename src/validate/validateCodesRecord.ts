import { queryGovernor, syncEngine } from 'tods-competition-factory';

import type { Tournament } from 'tods-competition-factory';

/**
 * Validate an assembled CODES record by ASKING THE FACTORY TO READ IT BACK.
 *
 * WHY NOT A FIELD CHECKLIST. Two defects in one session escaped every existing gate, and neither was
 * a missing field a list would have named:
 *
 *   - `Venue missing venueId` — 10 of 10 TE records unloadable. Types clean, lints clean, round-trips
 *     clean; refused only when CFS was finally offered the record.
 *   - `ERR_MISSING_STRUCTURE_LINKS` — a WTA draw with QUALIFYING and MAIN as two structures and no
 *     links between them. It SAVED, it VALIDATED, it appeared in its provider calendar, and every
 *     read of the draw failed. A record that is never read cannot fail to be read.
 *
 * The second one matters most for the design: **CFS's own `validateL2` does not check structure
 * links.** It is a field checklist plus a `setState` round-trip, and nothing in it walks
 * `drawDefinition.links`. So the save gate could never have caught it, and copying that checklist
 * here would inherit the same blind spot.
 *
 * `queryGovernor.getDrawData` DOES catch it, because it calls `getStructureGroups`, which walks the
 * links to group structures and refuses a draw whose structures do not form one group. So the check
 * is "can the factory read every draw", not "does this have the fields I remembered to list" — a
 * reader exercises invariants nobody has to enumerate in advance.
 *
 * The field checks below are deliberately the ones CFS applies, so a record is refused HERE rather
 * than travelling to another machine to be refused there.
 */

export interface CodesValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * CFS rejects a date that is not exactly `YYYY-MM-DD`. Mirrored here because presence alone is not
 * what it checks — a gap this validator shipped with: ten Tournament Desk records passed the gate
 * carrying `2025-06-19T00:00:00.000Z` and were then refused at the save. Checking that a field
 * EXISTS is not checking that it is usable.
 */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Fields whose absence or malformation CFS rejects outright. Mirrored so ingest fails first. */
function requiredFieldErrors(record: any): string[] {
  const errors: string[] = [];
  if (!record?.tournamentId) errors.push('tournamentId is required');
  if (!record?.tournamentName) errors.push('tournamentName is required');
  if (!record?.startDate) errors.push('startDate is required');
  else if (!DATE_REGEX.test(record.startDate)) errors.push(`startDate must be YYYY-MM-DD, got ${JSON.stringify(record.startDate)}`);
  if (!record?.endDate) errors.push('endDate is required');
  else if (!DATE_REGEX.test(record.endDate)) errors.push(`endDate must be YYYY-MM-DD, got ${JSON.stringify(record.endDate)}`);
  if (record?.startDate && record?.endDate && record.startDate > record.endDate) {
    errors.push('startDate must be before or equal to endDate');
  }

  for (const venue of record?.venues ?? []) {
    // The TE/TS defect: a venue with a name and an address and no id fails the save wholesale.
    if (!venue?.venueId) errors.push(`Venue "${venue?.venueName ?? '?'}" missing venueId`);
  }

  for (const event of record?.events ?? []) {
    if (!event?.eventId) errors.push('Event missing eventId');
    if (!event?.eventType) errors.push(`Event ${event?.eventId ?? '?'} missing eventType`);
    for (const drawDefinition of event?.drawDefinitions ?? []) {
      if (!drawDefinition?.drawId) errors.push(`DrawDefinition missing drawId in event ${event?.eventId ?? '?'}`);
    }
  }

  for (const participant of record?.participants ?? []) {
    if (!participant?.participantId) errors.push('Participant missing participantId');
    if (!participant?.participantType) {
      errors.push(`Participant ${participant?.participantId ?? '?'} missing participantType`);
    }
  }

  return errors;
}

/** Entries that name a participant the record does not carry — a dangling reference CFS rejects. */
function entryReferenceErrors(record: any): string[] {
  const participantIds = new Set((record?.participants ?? []).map((p: any) => p?.participantId));
  if (!participantIds.size) return [];
  const errors: string[] = [];
  for (const event of record?.events ?? []) {
    for (const entry of event?.entries ?? []) {
      if (entry?.participantId && !participantIds.has(entry.participantId)) {
        errors.push(`Entry in event ${event?.eventId ?? '?'} references unknown participantId ${entry.participantId}`);
      }
    }
  }
  return errors;
}

/**
 * THE CHECK THAT A CHECKLIST CANNOT REPLACE: every draw must be readable.
 *
 * `getDrawData` refuses — does not degrade — a drawDefinition whose structures are not all linked
 * into one group. Any future invariant it learns to enforce is inherited here for free, which is the
 * whole reason to validate through a reader rather than a list.
 */
function drawReadabilityErrors(record: any): string[] {
  const errors: string[] = [];
  for (const event of record?.events ?? []) {
    for (const drawDefinition of event?.drawDefinitions ?? []) {
      let result: any;
      try {
        result = queryGovernor.getDrawData({ tournamentRecord: record, event, drawDefinition });
      } catch (err) {
        errors.push(`Draw ${drawDefinition?.drawId ?? '?'} threw on read: ${(err as Error).message}`);
        continue;
      }
      if (result?.error) {
        const code = result.error.code ?? result.error.message ?? JSON.stringify(result.error);
        errors.push(`Draw ${drawDefinition?.drawId ?? '?'} is unreadable: ${code}`);
      }
    }
  }
  return errors;
}

export function validateCodesRecord(tournamentRecord: Tournament | any): CodesValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tournamentRecord || typeof tournamentRecord !== 'object') {
    return { valid: false, errors: ['tournamentRecord must be an object'], warnings };
  }

  errors.push(...requiredFieldErrors(tournamentRecord));

  // The engine round-trip is the gross-malformation gate; the per-draw reads below are the sharp one.
  // Reset on both sides so a validation never inherits or leaks engine state — these run inside
  // conversion scripts that may validate many records in one process.
  syncEngine.reset();
  try {
    const stateResult: any = syncEngine.setState(tournamentRecord);
    if (stateResult?.error) {
      errors.push(`Engine setState failed: ${JSON.stringify(stateResult.error)}`);
      return { valid: false, errors, warnings };
    }
  } catch (err) {
    errors.push(`Engine setState threw: ${(err as Error).message}`);
    return { valid: false, errors, warnings };
  } finally {
    syncEngine.reset();
  }

  errors.push(...drawReadabilityErrors(tournamentRecord));
  errors.push(...entryReferenceErrors(tournamentRecord));

  // A warning, not an error: a record without a provider is still a valid CODES document, it simply
  // cannot be scoped to a provider calendar. CFS treats it the same way.
  if (!tournamentRecord.parentOrganisation?.organisationId) {
    warnings.push('parentOrganisation.organisationId is missing — the record cannot be saved to a provider');
  }

  return { valid: errors.length === 0, errors, warnings };
}
