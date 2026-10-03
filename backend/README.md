## Backend

AgriPlan backend on `NestJS + TypeORM + PostgreSQL/PostGIS`.

## Setup

```bash
npm install
```

Copy envs from [`.env.example`](/Users/adilzhan/Desktop/agriplan/backend/.env.example) and set database credentials before running migrations or the app.

## Run

```bash
npm run start:dev
```

Health endpoint:

```bash
GET /health
```

Swagger is available at `/api/docs` when `API_DOCS_ENABLED=true`.

## Database and migrations

Default policy:

- `DB_SYNCHRONIZE=false`
- `DB_MIGRATIONS_RUN=false`

Commands:

```bash
npm run migration:run
npm run migration:revert
npm run migration:create
npm run migration:generate
```

Initial schema migration lives in:

```text
src/database/migrations/1712500000000-initial-schema.ts
```

The initial migration creates:

- application tables for current entities
- Postgres enums used by the entity model
- `uuid-ossp` extension
- `postgis` extension
- GIST index for `farm_plots.geometry`

## Tests

```bash
npm test
npm run test:e2e
npm run build
```
