# Contributing to @courthive/ingest-core

Thanks for helping build the ingestion toolkit. This package is deliberately small and
**federation-agnostic**: it is the contract, the registry, the normalization helpers, and the
integrity checker that every ingestion adapter shares. The adapters themselves — the code that knows
one specific source — live in *your* repo, not this one.

## What belongs here

- The `FederationDataAdapter` contract and `AdapterRegistry`.
- **CODES normalization** helpers that are useful across sources (draw positions, seed/position
  assignments, sex inference, placeholder detection, stable ids, number parsing, level resolution).
- **Integrity** checking (`validateCodesRecord`) and the record **writer** (`writeCodesRecord`).
- The generic **sanction-policy** engine.

## What does NOT belong here

- Source-specific access details — endpoints, query shapes, credentials, auth or session flows, or any
  note on how one source's data is obtained. However your adapter acquires its data — a partner API, a
  file or spreadsheet export, a scheduled feed, a manual drop — that logic and those details live in
  your adapter's own repo. A PR that names or targets a specific source will be asked to move it behind
  the adapter boundary.
- Credentials, captured data, or personal information of any kind.

Rule of thumb: if a change only helps *one* source, it is probably an adapter, not core.

## Writing an adapter (in your own project)

```ts
import type { Tournament } from 'tods-competition-factory';
import {
  AdapterRegistry,
  isAdapterError,
  validateCodesRecord,
  writeCodesRecord,
  round1DrawPositions,
  inferSexFromEventGender,
  isPlaceholderParticipantName,
} from '@courthive/ingest-core';

class MyFederationAdapter implements FederationDataAdapter {
  readonly provider = 'MINE';
  readonly providerName = 'My Federation';
  readonly organizationId = '…uuid…';

  canHandle(id: string) {
    return id.includes('my-federation.example');
  }

  async fetchTournament(id: string) {
    // fetch → parse → map to a CODES tournament record using the core builders
  }
}

const registry = new AdapterRegistry().register(new MyFederationAdapter());
const result = await registry.resolve(url)?.fetchTournament(url);
if (result && !isAdapterError(result) && validateCodesRecord(result).valid) {
  await writeCodesRecord(result, { provider: 'MINE' });
}
```

Start from [`examples/exampleAdapter.ts`](./examples/exampleAdapter.ts) — a complete skeleton against
a fictional source. Author your records to pass `validateCodesRecord`; it asks the factory to *read every
draw back*, which catches structural defects (e.g. unlinked draw structures) that a field checklist
never would.

## Local development

```bash
pnpm install
pnpm build          # tsc → build/
pnpm check-types    # tsc --noEmit
pnpm lint           # eslint, zero warnings
pnpm test           # vitest
```

`tods-competition-factory` is a **peer dependency** — it is installed here only as a devDependency for
building and testing.

## Conventions

- **pnpm only** (never npm).
- **Zero lint warnings** — `pnpm lint` must pass.
- **Cognitive complexity** capped at 30 (sonarjs).
- **TypeScript strict**; `noImplicitAny` is off by project choice.
- Conventional-commit style subjects (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- No AI attribution in commits or source.

## The corpus specs

`corpusValidation.spec.ts` and `validateCodesRecord.spec.ts` validate against a corpus when one
is present, and **skip cleanly when it is absent** (the corpus is never committed). A fresh clone runs
the suite green without any data.
