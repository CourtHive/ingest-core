# @courthive/ingest-core

A **source-agnostic toolkit for ingesting tournament data** into **CODES** — CourtHive's competition
data standard, a superset of the ITF's [TODS](https://itftennis.atlassian.net/wiki/spaces/TODS/overview).

You bring an **adapter** that knows how to obtain and parse one source — an API, a data export, a
scheduled feed, however that source makes its data available. This package gives you everything around it:

- **An adapter contract** (`FederationDataAdapter`) and a **registry** that dispatches an identifier to the
  first adapter that can handle it.
- **Normalization helpers** for authoring CODES records — draw positions, seed/position assignments, sex
  inference, placeholder-participant detection, stable cross-source ids, number parsing, tournament-level
  resolution.
- **Factory-backed integrity checking** — `validateCodesRecord` validates a record by asking
  `tods-competition-factory` to *read it back*, catching structural defects a field checklist never would
  (e.g. a draw whose structures carry no links between them).
- **A record writer** that lays records out as `<outDir>/<provider>/<season>/<tournamentId>.json`.
- **A generic sanction-policy engine** for evaluating field constraints against a level policy.

It carries no source-specific logic of its own and names no real source. Its only runtime dependency is a
**peer** on `tods-competition-factory`.

## Why normalize to CODES

Tournament data arrives in as many shapes as there are places it comes from — one federation's HTML, another's
GraphQL, a spreadsheet export, a scheduled partner feed, a hand-entered form. **The moment you normalize that
data to CODES, every one of those differences disappears from everything downstream.** The adapter is the only
code that ever has to know what a source looks like; past that boundary there is a single canonical shape, and
that is where the leverage compounds.

**Write your pipelines once, and they work for every source — forever.** A rankings run, a ratings computation,
a strength-of-schedule model, a scheduling optimizer — each is written against CODES, not against a source. So
the same rankings pipeline that scores a national federation's draws scores a club's spreadsheet and a
partner's API feed with **zero per-source code**, and it keeps working when a source changes its format or a new
source is added. The factory engine (`tods-competition-factory`) computes points, standings, and outcomes on the
canonical record; your acquisition layer and your analytics layer never have to know about each other.

**Reuse an entire ecosystem of tooling instead of rebuilding it.** Because everything speaks CODES, an ingested
record drops straight into the same components CourtHive uses in production:

- **courthive-components** — draw sheets, brackets, scorecards, participant and schedule views, rendered
  from a CODES record with no adapter-aware glue.
- **TMX** — the full competition-management client: draws, entries, seeding,
  scheduling, scoring, publishing — all operating on CODES.
- **courthive-public** — the public tournament viewer, fed the same records.
- **courthive-rankings** — the ranking pipeline: ingests CODES records, computes point awards through the
  factory, and produces sliding-window ranking snapshots — the *same* pipeline no matter which source the
  tournaments came from.
- **courthive-query** — the read-model / query surface: flattened SQL projections of the tournament domain
  (a person's match history, a team's results, a venue's tournaments, provider reporting) served as pure joins,
  because every record entered the system in the same shape.

**Provenance survives normalization.** CODES records keep origin identifiers (`origin*Ids`, `provider`,
`organisationId`), so a normalized record still points back to where it came from — you gain a common shape
without losing the source of truth, and cross-source de-duplication and enrichment become tractable.

**Interoperate by default.** CODES is a superset of the ITF's [TODS](https://itftennis.atlassian.net/wiki/spaces/TODS/overview),
so a record you produce here is portable to any TODS-aware system, and the integrity check below guarantees it
actually loads — not just that it type-checks.

The short version: **normalize once at ingest, and the pipelines, the analytics, the visualizations, and the
query layer are all reusable, source-agnostic, and durable.** Adapters are the disposable part; the CODES record
is the asset.

## Install

```bash
pnpm add @courthive/ingest-core tods-competition-factory
```

`tods-competition-factory` is a peer dependency — install it alongside so you and the toolkit share one engine
instance.

## Usage

```ts
import {
  AdapterRegistry,
  isAdapterError,
  validateCodesRecord,
  writeCodesRecord,
} from '@courthive/ingest-core';
import { MyFederationAdapter } from './myFederationAdapter';

const registry = new AdapterRegistry().register(new MyFederationAdapter());

const adapter = registry.resolve(url);
const result = await adapter?.fetchTournament(url);

if (result && !isAdapterError(result)) {
  const check = validateCodesRecord(result);          // the factory reads it back
  if (check.valid) {
    await writeCodesRecord(result, { provider: adapter.provider }); // codes/<provider>/<season>/<id>.json
  } else {
    console.error(check.errors);
  }
}
```

See [`examples/exampleAdapter.ts`](./examples/exampleAdapter.ts) for a complete adapter skeleton against a
fictional federation — copy it as your starting point.

## The adapter contract

```ts
interface FederationDataAdapter {
  readonly provider: string;        // stable id, matches the CODES organisation (e.g. 'EXAMPLE')
  readonly providerName: string;    // human-friendly name for logs
  readonly organizationId: string;  // UUID → tournamentRecord.parentOrganisation.organisationId

  canHandle(identifier: string): boolean;
  fetchTournament(identifier: string): Promise<AdapterResult<Tournament>>;

  // optional
  fetchTournamentCalendar?(range: DateRange): Promise<AdapterResult<TournamentSummary[]>>;
  fetchRegistrations?(identifier: string): Promise<AdapterResult<unknown[]>>;
}
```

`AdapterResult<T>` is `T | AdapterError`; narrow it with `isAdapterError(result)`.

## What's in the box

| Area | Exports |
|---|---|
| Contract | `FederationDataAdapter`, `AdapterRegistry`, `AdapterResult`, `AdapterError`, `isAdapterError`, `DateRange`, `TournamentSummary` |
| Normalize | `round1DrawPositions`, `emptyPositionAssignments`, `inferSexFromEventGender`, `isPlaceholderParticipantName`, `lintMatchUpShape`, `localId`, `origin*Ids`, `parseCount`, `parseFormattedNumber`, `resolveTournamentLevel` |
| Validate | `validateCodesRecord`, `writeCodesRecord`, `CodesValidationError` |
| Sanction | `resolveConstraints`, `evaluate` |

## Why factory-backed validation

A CODES record can be well-formed — clean types, present fields, a successful round-trip — and still be
**unreadable**: a draw with a `QUALIFYING` and a `MAIN` structure and no links between them saves, validates
against a field checklist, and then fails every read. `validateCodesRecord` catches that class because it asks
the factory's query layer to read every draw, exercising invariants no checklist enumerates. Author your
records to pass this and they will load wherever CODES records are consumed.

## License

MIT © CourtHive
