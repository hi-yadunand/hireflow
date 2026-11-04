# PostgreSQL foundation

HireFlow is a personal, single-user application. Runtime persistence uses PostgreSQL exclusively. The dashboard and API shapes remain unchanged. Discovery, submission, scheduling and notification delivery are not implemented; processing cycles must be requested manually.

## Local commands

1. Configure `DATABASE_URL` and `DATABASE_MIGRATION_URL` in the ignored `.env`. The runtime URL may use Neon's pooler. The migration URL must be the direct endpoint for the same database. Never use `VITE_*` for secrets.
2. Run `npm run db:migrate` explicitly. It applies forward SQL migrations, initializes a blank unreviewed profile, default settings and inactive connector configurations, then checks readiness. It does not import JSON, seed demo jobs or run processing.
3. Run `npm run db:check` for a read-only connection/readiness check.
4. Run `npm run dev`, or build with `npm run build` and serve with `NODE_ENV=production npm start`.

The server binds to `127.0.0.1` by default. Authentication is not implemented. An explicit `HOST` override requires a suitably protected private environment. Neither the frontend build nor these changes deploy the server.

Missing or invalid connection settings and unavailable schema cause explicit errors. Runtime never creates schema automatically and never falls back to JSON. The retained `server/db.ts` file implementation is a reference adapter for existing tests; PostgreSQL reuses its domain rules through explicit memory snapshots without accessing the data directory.

## Schema and migration lifecycle

`server/migrations/001_postgres-foundation.sql` creates the dedicated `hireflow` schema. `node-pg-migrate` records versions in `public.hireflow_migrations`, acquires a direct-connection advisory lock and runs pending DDL in one transaction. A second run applies no migrations. An unmanaged existing `hireflow` schema is rejected. Down migration is deliberately disabled; data-preserving changes require a new reviewed forward migration. Do not edit an applied migration.

The schema contains 18 tables:

- `profiles`, `profile_snapshots`: current profile, revision snapshots and the prior unreviewed profile.
- `jobs`, `resumes`, `cover_letters`: indexed job projections and document relationships.
- `applications`, `application_events`, `interviews`: one application per job, append-only ordered events and interview history.
- `app_settings`, `connector_configs`, `agent_logs`: settings, inactive connector configuration and activity history.
- `agent_controls`, `cycle_leases`: durable pause epochs, worker fencing and expiring ownership.
- `staging_reservations`, `staging_usage`: expiring reservations and unique UTC-day/job usage.
- `provenance_nodes`, `provenance_edges`: demo provenance, including referenced identifiers without existing parent records.
- `initialization_metadata`: explicit clean initialization mode and schema version.

String identifiers and flexible date strings stay intact in JSONB payloads. Indexed relational columns and foreign keys protect operational relationships. Documents/interviews/logs retain original referenced identifiers when a parent is absent, without inventing a parent. Existing application timelines are append-only in a separate table, with a database trigger rejecting updates/deletes. Approved and terminal transitions remain guarded by the domain/API policies. No submission evidence is invented.

There is no importer in this installation: the absence of legacy data was confirmed and clean initialization was authorized. An eventual importer needs its own reviewed design. Initialization refuses to overwrite unexpected existing records. The ignored data directory and JSON implementation are retained.

## Transactions and safety

`PostgresRepository` exposes asynchronous `read` and `write` commands with synchronous domain callbacks. Reads use consistent repeatable-read snapshots. Writes lock the singleton controls row and flush only changed relational rows in one transaction, retaining ordered payloads. Responses are buffered until commit succeeds. On failure, the transaction rolls back and the client is released; uncertain commit outcomes require reloading server state rather than automatic retries.

This deliberately serializes short writes for a personal app. Snapshot reads currently assemble the working set, including history and logs. This is a correctness-first foundation for modest personal data volumes; large history volumes will require scoped queries and pagination.

AI runs outside transactions. Before persistence, fresh locked state must still match the captured profile revision, pause epoch, job content and configured model. Interview prep additionally compares the interview snapshot. Client cancellation is checked before and after flushing. The existing 60-second AI deadline ignores late provider results.

A cycle lease expires after 90 seconds and renews every 15 seconds. Monotonic fencing tokens protect every consequential cycle write. Pause increments the epoch, revokes the lease and releases reservations in the same transaction. A stale cycle cannot clear a newer lease. Process crashes leave bounded ownership, not an indefinite in-memory lock. Manual staging and agent staging share the same transactional quota and job uniqueness rules. Manual Interview/Rejected/unverified history does not consume quota.

Only active AI operations subscribe to pause polling (250 ms). Cross-process pause/resume is detected by epoch even when the final state is resumed. Poll failures cancel AI work. Database epoch/fencing checks are the final write barrier; polling is an early cancellation aid.

Demo preview remains a separate in-memory, read-only data set. Real views and quota calculations use the original relationship-based provenance classifier. Cleanup never deletes stored records. Durable provenance edges retain observed relationships for audit; current visibility is recomputed from current payloads, not inferred from historical edges.

## Connections and operations

Runtime uses up to five pooled connections; migrations use one direct connection. TLS validates server certificates. URL SSL overrides are removed so they cannot weaken certificate validation. Runtime acquisition timeout is 10 seconds, query timeout 5 seconds, lock timeout 2 seconds, idle connection timeout 15 seconds and connection maximum lifetime 300 seconds. Migration query timeout is 60 seconds. No network/AI request holds a SQL transaction open. SIGINT/SIGTERM stop HTTP intake, drain requests and close Vite/the pool.

Errors expose sanitized categories and a bounded list of SQLSTATE/network codes, never connection URLs, SQL parameters or raw driver diagnostics. Do not print pool configuration or connection variables during troubleshooting. Connection failures do not activate another store.

All collaborating processes must use this repository and the same database. The row lock, constraints, epoch and fence checks coordinate them. Do not use Neon's transaction pooler for session locks or migration commands. No cloud worker has been enabled by this phase.

Before any future destructive database change, use a separately authorized Neon restore point/export and a reviewed forward recovery procedure. This implementation does not drop existing databases/schemas/objects or create a paid backup service. Check the project's actual retention/restore configuration in Neon before relying on it; it has not been verified here.

## Tests and verification limits

`npm test` runs the original regression fixtures against temporary JSON files and the SQL regression suite against in-memory PGlite. No test reads connection strings, uses Neon credentials, creates remote fixtures or submits applications. `TEST_DATABASE_URL` is neither needed nor used. The runtime connection factory refuses URLs in Vitest/test mode.

PGlite executes the actual migration runner, SQL constraints, repository writes and rollbacks locally. Its single session serializes checked-out clients. It can verify interleaved repository behavior, ownership checks and the transaction protocol, but it does not verify real PostgreSQL multi-session contention, Neon/PgBouncer failover, network partitions or production write latency. Live verification here is limited to explicitly authorized schema/config initialization, migration repeatability and read-only readiness checks. No automated CRUD fixtures run on the production branch.

The migration tooling currently pulls three moderate npm audit advisories through `glob`/`minimatch`. Those dependencies are development-only and receive repository-controlled migration paths, not HTTP input. npm suggests a major downgrade of `node-pg-migrate`; no forced downgrade or unreviewed dependency override was applied. Update when a compatible patched dependency chain is available.
