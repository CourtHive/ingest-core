# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Mentat Orchestration (READ FIRST)

Before doing anything else, read `../Mentat/CLAUDE.md`, `../Mentat/TASKS.md`,
`../Mentat/standards/coding-standards.md`, and every file in `../Mentat/in-flight/`. Mentat is the
orchestration layer for the CourtHive ecosystem and **its standards override per-repo conventions
when they conflict**. If you are about to start *building* rather than planning, claim a surface in
`../Mentat/in-flight/` and run the air-traffic-control conflict check first.

## Branching — cut from `dev`, not `main` (CA, 2026-11-05)

`dev` is this repo's integration branch, as in factory, TMX, components, CFS and the dev-flow services. **Branch from
`origin/dev` and open PRs against `dev`.** `main` advances only at checkpoints, by merging `dev` into it. `dev` was
created from `main` at `49390822`, byte-identical. **Renovate targets `dev`** (`baseBranches` in `renovate.json`).

| workflow | trigger | consequence |
| --- | --- | --- |
| `ci.yml` | `pull_request: [main, dev]` + `push: [main]` | a PR into `dev` gets the full `verify` gate. A direct push to `dev` gets **no** run, so land work by PR |
| `release-please.yml` | `push: [main]` ONLY | a checkpoint merge **refreshes** the release PR. Nothing is tagged or published |
| `npm-publish.yml` | `release: published` | publishes only when the release PR on `main` is merged |
| `back-merge.yml` | `release: published` + `workflow_dispatch` | after a release, opens the `main` → `dev` PR with the release-bot App token |

**`dev` and `main` are protected** (no deletion, no force-push) and `delete_branch_on_merge` is on: merged feature
branches delete themselves, and the protected heads of checkpoint and back-merge PRs survive. The checkpoint merge
(`dev` → `main`) is a **merge commit**, never a squash, so release-please's changelog keeps every conventional commit;
so is the back-merge (`main` → `dev`) after each release. Judge local branches by PR **state**, not ancestry
(`gh pr list --repo CourtHive/ingest-core --state merged --head <branch>`).

## What this package is

`@courthive/ingest-core` — a **source-agnostic toolkit for ingesting tournament data into CODES**,
CourtHive's competition data standard (a superset of the ITF's TODS).

You bring an **adapter** that knows how to obtain and parse one source. This package supplies
everything around it. See `README.md` for the full rationale — it is unusually complete and worth
reading before changing anything here.

| directory | what lives there |
|---|---|
| `src/contract/` | the `FederationDataAdapter` contract and the registry that dispatches an identifier to the first adapter that can handle it |
| `src/normalize/` | helpers for authoring CODES records — draw positions, seed/position assignments, sex inference, placeholder-participant detection, stable cross-source ids, number parsing |
| `src/validate/` | `validateCodesRecord` — integrity checking by asking the factory to *read the record back* |
| `src/sanction/` | a generic policy engine for evaluating field constraints against a level policy |

## The rule that shapes every change here

**This package names no real source and carries no source-specific logic.** That is not styling —
it is the package's reason to exist, and it is stated in the README. Source knowledge belongs in an
adapter, in that adapter's own repository.

The ecosystem standard reinforces it: do not name upstream vendor platforms in externally-visible
material. Name the governing body, or describe the shape. This repo is published to npm, and source
comments ship in the generated `.d.ts`.

## Why `validateCodesRecord` asks the factory rather than checking fields

A field checklist confirms a record has the right keys. It cannot tell you the record is *loadable*
— that a draw's structures carry links between them, that positions resolve, that the engine can
actually read what you wrote. So validation round-trips the record through
`tods-competition-factory`. When you add a normalization helper, the test that matters is whether
the factory reads the result back, not whether the shape looks right.

## Commands

```bash
pnpm install
pnpm build          # rimraf build && tsc -p tsconfig.json
pnpm check-types    # tsc --noEmit
pnpm lint           # eslint src examples --max-warnings 0
pnpm format         # prettier over src/ and examples/
pnpm test           # TZ=UTC vitest --run
pnpm test:watch
```

**`pnpm test` already includes `--run`.** Appending another (`pnpm test --run`) makes vitest reject
a duplicate flag with `Expected a single value for option "--run"`, which reads exactly like a test
failure and is not one.

## Dependencies

`tods-competition-factory` is a **peer** dependency, currently `^7.30.0` (the version the integrity checks are tested against), and it is the only runtime
dependency. Keep it that way: a toolkit that acquires dependencies becomes a toolkit people work
around.

**`pnpm install` is allowed. Never run `npm install`** — it corrupts the pnpm-managed store.

## Related repositories

- `../courthive-rankings` — consumes CODES records and produces ranking snapshots
- `../courthive-ingest` — a **separate** repository, despite the similar name
- `../factory` — `tods-competition-factory`, the engine this validates against
