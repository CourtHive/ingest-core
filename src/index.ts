// @courthive/ingest-core — federation-agnostic tournament ingestion toolkit.
//
// Bring your own site adapters; this package provides the adapter contract,
// a registry, TODS/CODES normalization, factory-backed integrity checking,
// and a generic sanction-policy engine. Its only runtime dependency is a
// peer on `tods-competition-factory`.
//
// See `examples/exampleAdapter.ts` for a reference adapter against a
// fictional federation.

// ---- the adapter contract + registry ----
export * from './contract/FederationDataAdapter';
export * from './contract/AdapterRegistry';

// ---- TODS/CODES normalization ----
export * from './normalize/builders';
export * from './normalize/unifiedIds';
export * from './normalize/numeric';
export * from './normalize/tournamentLevel';

// ---- integrity checking + record output ----
export * from './validate/validateCodesRecord';
export * from './validate/writeCodesRecord';

// ---- generic sanction-policy engine ----
export * from './sanction/resolvePolicy';
export * from './sanction/types';
