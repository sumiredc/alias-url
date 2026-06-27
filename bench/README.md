# k6 benchmark

Backend variants share the same public API, so these scripts are organized by
scenario rather than by implementation. Switch the target with `BASE_URL`.

## Prerequisites

- k6 v0.57 or newer
- one backend variant running on `http://localhost:8080`

## Common environment variables

| Name | Default | Description |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8080` | Target backend URL |
| `VUS` | scenario-specific | Number of virtual users |
| `DURATION` | scenario-specific | Measurement duration |
| `RUN_ID` | `local` | Alias namespace for this run |
| `ALIAS_PREFIX` | scenario-specific | Alias prefix |
| `SEED_COUNT` | `1000` | Number of aliases used by seed/redirect scripts |

## Typical flow

Run the full flow for each variant with Task:

```bash
task bench:simple
task bench:distributed
```

The default gateway is nginx for both variants.

Run scaled backend versions through the nginx gateway:

```bash
task bench:simple:scaled
task bench:distributed:scaled
task bench:compare:scaled
```

One-liner:

```bash
task bench:simple:scaled && task bench:distributed:scaled && task bench:compare:scaled
```

If you start simple scaled manually:

```bash
docker compose -f variants/simple/compose.yaml up -d --build --scale backend=3
```

Run simple without the gateway to isolate gateway overhead:

```bash
task bench:simple:direct
```

Distributed has separate backend roles, so direct benchmarks are split by target:

```bash
task bench:distributed:direct
task bench:distributed:redirect:direct
```

`bench:distributed:direct` targets the generic backend directly and runs
`seed-aliases -> create-existing -> warmup-create -> create`.
`bench:distributed:redirect:direct` seeds through the generic backend on
`http://localhost:8081`, then measures `backend-redirect` directly on
`http://localhost:8080`.

Run with Caddy gateway when you need a secondary comparison:

```bash
task bench:simple:caddy
task bench:distributed:caddy
```

Gateway tasks start their target variant and run:

```text
seed-aliases -> warmup-redirect -> redirect -> create-existing -> warmup-create -> create
```

JSON summaries are written under `bench/results/{variant}/{RUN_ID}/`.
The task stops the other variant first to avoid the shared `8080` port
conflicting.

Compare the latest saved simple/distributed runs:

```bash
task bench:compare
```

Compare the latest scaled runs:

```bash
task bench:compare:scaled
```

Compare direct runs by matching only the scenarios that mean the same thing:

```bash
task bench:compare:direct:create
task bench:compare:direct:redirect
```

`compare:direct:create` compares `simple-direct` with `distributed-direct`
for `create-existing` and `create`.
`compare:direct:redirect` compares `simple-direct` with
`distributed-redirect-direct` for `redirect`.

The comparison includes custom status counters for new runs, such as
`201`, `302`, `409`, `502`, and `5xx`.
For distributed conflicts, it also includes `exists` and `might_exist`
reason counters.

You can also compare specific run directories:

```bash
node bench/scripts/compare-results.mjs \
  --simple=bench/results/simple/simple-20260627004504 \
  --distributed=bench/results/distributed/distributed-20260627011702 \
  --scenarios=redirect,create
```

You can fix the run namespace when comparing variants:

```bash
RUN_ID=compare-001 task bench:simple
RUN_ID=compare-001 task bench:distributed
```

You can still run each k6 script manually:

```bash
task simple:up

k6 run bench/k6/setup/seed-aliases.ts
k6 run bench/k6/setup/warmup-redirect.ts
k6 run bench/k6/scenarios/redirect.ts

k6 run bench/k6/setup/warmup-create.ts
k6 run bench/k6/scenarios/create.ts
```

For `distributed`, run the same scripts after starting that variant:

```bash
task simple:down
task distributed:up

k6 run bench/k6/setup/seed-aliases.ts
k6 run bench/k6/setup/warmup-redirect.ts
k6 run bench/k6/scenarios/redirect.ts
```

Use the same explicit `RUN_ID` for `seed-aliases.ts`, `warmup-redirect.ts`, and
`redirect.ts` when you want to isolate a run from previous local data:

```bash
RUN_ID=compare-001 k6 run bench/k6/setup/seed-aliases.ts
RUN_ID=compare-001 k6 run bench/k6/scenarios/redirect.ts
```

## Scenarios

- `scenarios/health.ts`: HTTP/application baseline, no DB or Redis access.
- `scenarios/create.ts`: unique alias creation.
- `scenarios/redirect.ts`: reads pre-seeded aliases and expects `302`.
- `scenarios/create-existing.ts`: posts pre-seeded aliases again and expects `409`.
- `scenarios/create-conflict.ts`: intentionally creates conflicts to measure uniqueness handling.

Warmup scripts are intentionally separate from measurement scripts so warmup
traffic does not pollute k6 summary metrics.
