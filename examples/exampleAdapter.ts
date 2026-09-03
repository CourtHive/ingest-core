// Reference adapter for @courthive/ingest-core, written against a FICTIONAL
// federation. It is documentation, not a real integration — it deliberately
// contains no real hostnames, selectors, GraphQL fields, or auth flows. Copy
// it as the starting point for your own site adapter.
//
// The lifecycle a caller drives:
//   registry.resolve(url)?.fetchTournament(url)   -> a CODES tournament record
//   validateCodesRecord(record)                    -> factory reads it back
//   writeCodesRecord(record, { provider })           -> codes/<provider>/<season>/<id>.json

import type { Tournament } from 'tods-competition-factory';
import type { FederationDataAdapter, AdapterResult, DateRange, TournamentSummary } from '@courthive/ingest-core';

// Replace with your source's real host / identifier shape.
const EXAMPLE_HOST = 'tournaments.example-federation.test';

export class ExampleAdapter implements FederationDataAdapter {
  readonly provider = 'EXAMPLE';
  readonly providerName = 'Example Federation';
  // A stable UUID for this organisation — becomes
  // tournamentRecord.parentOrganisation.organisationId.
  readonly organizationId = '00000000-0000-4000-8000-000000000000';

  /** Recognise identifiers this adapter can service (URL or stable id). */
  canHandle(identifier: string): boolean {
    return identifier.includes(EXAMPLE_HOST);
  }

  /** Fetch + parse one tournament into a CODES tournament record. */
  async fetchTournament(_identifier: string): Promise<AdapterResult<Tournament>> {
    // 1. const html = await fetch(identifier).then((r) => r.text());
    // 2. parse to an intermediate model of your own shape
    // 3. map that model onto a CODES tournament record using the builders exported
    //    from @courthive/ingest-core (round1DrawPositions, inferSexFromEventGender,
    //    isPlaceholderParticipantName, localId, …)
    // 4. return the record — the caller validates and writes it
    return { error: 'NOT_IMPLEMENTED', message: 'ExampleAdapter is a template' };
  }

  /** Optional: enumerate tournaments in a date range for back-fill scheduling. */
  async fetchTournamentCalendar(_range: DateRange): Promise<AdapterResult<TournamentSummary[]>> {
    return { error: 'NOT_IMPLEMENTED', message: 'ExampleAdapter is a template' };
  }
}
