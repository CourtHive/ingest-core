import type { Tournament } from 'tods-competition-factory';

// Generalized adapter contract for federation-data ingestion.
//
// Each implementation knows how to recognize and fetch tournament data
// (registrations + completed draw structures) from one public source —
// typically a national federation's tournament website. The
// AdapterRegistry is provider-agnostic: it iterates registered adapters
// and delegates to the first one whose `canHandle()` returns true.
//
// This interface is intentionally aligned with the one already used in
// `competition-factory-server/src/modules/federation-data/`. The two
// will eventually share a single source-of-truth definition; for now
// they are kept in lockstep by convention.

export interface FederationDataAdapter {
  /** Stable identifier matching the federation in TODS (e.g., 'EXAMPLE', 'DEMO'). */
  readonly provider: string;

  /** UUID — used as `tournamentRecord.parentOrganisation.organisationId`. */
  readonly organizationId: string;

  /** Human-friendly name for logs / CLI output (e.g., "Czech Tennis Association"). */
  readonly providerName: string;

  /** Returns true if this adapter can handle the given URL or stable identifier. */
  canHandle(identifier: string): boolean;

  /** Fetch + parse one tournament's full record (participants and draws when public). */
  fetchTournament(identifier: string): Promise<AdapterResult<Tournament>>;

  /** Optional: list tournaments in a date range (for back-fill scheduling). */
  fetchTournamentCalendar?(range: DateRange): Promise<AdapterResult<TournamentSummary[]>>;

  /** Optional: fetch registrations only (subset of fetchTournament). */
  fetchRegistrations?(identifier: string): Promise<AdapterResult<unknown[]>>;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface TournamentSummary {
  tournamentId: string;
  identifier: string;
  tournamentName?: string;
  startDate?: string;
  endDate?: string;
  ageCategory?: string;
  gender?: string;
}

export type AdapterErrorCode =
  | 'NOT_IMPLEMENTED'
  | 'INVALID_IDENTIFIER'
  | 'FETCH_FAILED'
  | 'PARSE_FAILED'
  | 'AUTH_REQUIRED'
  | 'NOT_FOUND';

export interface AdapterError {
  error: AdapterErrorCode;
  message?: string;
  details?: unknown;
}

export type AdapterResult<T> = T | AdapterError;

export function isAdapterError<T>(result: AdapterResult<T>): result is AdapterError {
  return typeof result === 'object' && result !== null && 'error' in (result as AdapterError);
}
