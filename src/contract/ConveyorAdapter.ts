import type { AdapterResult, FederationDataAdapter } from './FederationDataAdapter';
import type { Tournament } from 'tods-competition-factory';

// The conveyor's two phases, as an adapter surface.
//
// `fetchTournament(identifier) → Tournament` fuses capture and conversion. A CONVEYOR stores the capture between the
// two: the timestamped snapshot series is a lifecycle asset, a conversion has to be re-runnable over old snapshots
// after the converter changes, and a failed capture must leave the last snapshot convertible. Without a contract for
// that split, snapshot → record logic drifts out of adapters into the scripts that schedule them, where no adapter
// test exercises it.
//
// A ConveyorAdapter splits the two. `toCodesRecord` is PURE — no network, no disk — and is the only code that turns
// this adapter's snapshot into a record. KEEP THE SNAPSHOT RAW: a snapshot that is already a converted record cannot
// be re-converted, so a converter fix would need the source fetched again.
//
// A source whose capture is a multi-file incremental collector with no single identifier is a ConveyorConverter: the
// pure half only. That is better than a `fetchTournament` that answers NOT_IMPLEMENTED.

export interface ConveyorConversion {
  record: Tournament;
  /** Source-specific bookkeeping that makes a silent drop visible (counts captured vs rebuilt, …). */
  accounting?: object;
  /** Material that failed to convert. A run reports these; a pipeline may gate on them. */
  issues?: string[];
  /** What the source declined to state. Reported, never gating: absence in the source is not a failure. */
  gaps?: string[];
  /**
   * A LIFECYCLE STATE, not a failure: the capture is real but there is nothing to promote yet (draws not published,
   * an event with no players). Converted, but not written — a calendar never shows a tournament with nobody in it.
   */
  skip?: string;
}

/** The pure half alone. */
export interface ConveyorConverter<Snapshot = unknown> {
  readonly provider: string;
  toCodesRecord(snapshot: Snapshot): AdapterResult<ConveyorConversion>;
}

export interface ConveyorAdapter<Snapshot = unknown> extends FederationDataAdapter, ConveyorConverter<Snapshot> {
  captureTournament?(identifier: string): Promise<AdapterResult<Snapshot>>;
}

export function isConveyorConverter(value: unknown): value is ConveyorConverter {
  return typeof (value as ConveyorConverter)?.toCodesRecord === 'function';
}
