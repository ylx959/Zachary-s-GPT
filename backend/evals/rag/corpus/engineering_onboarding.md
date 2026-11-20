# Engineering Onboarding Guide

Welcome to the Lumen Labs platform team. This guide explains how code goes from your laptop to production.

## Repositories and branching

All services live in a single monorepo on the internal Git server. We use trunk-based development: branches are short-lived and merged into main within two days. Every pull request needs one approving review; changes to the payments service need two. Squash merging is the only allowed merge strategy.

## Local development

Run `make bootstrap` once to install the toolchain. The local stack starts with `make up`, which runs every service in Docker Compose together with a seeded Postgres database. Integration tests run with `make test-integration` and take about 12 minutes.

## Continuous integration

Every pull request runs linting, unit tests and a container build. A pipeline must finish in under 20 minutes; jobs that exceed 30 minutes are cancelled automatically. Flaky tests are quarantined by adding them to `flaky.yaml`, and the owning team has 5 working days to fix them.

## Deployment

Merges to main deploy automatically to the staging environment. Production deploys are started manually from the release dashboard and roll out as a canary: 5% of traffic for 15 minutes, then 25%, then 100%. If the error rate rises above 1% during the canary, the rollout stops and rolls back automatically.

Production deploys are not allowed on Fridays after 14:00 or during the December code freeze, which runs from December 20 to January 3. Emergency fixes during a freeze need approval from the on-call engineering manager.

## On-call

Every engineer joins the on-call rotation after their first 8 weeks. A shift lasts one week, starting Monday at 10:00. The primary on-call engineer must acknowledge a page within 5 minutes and be at a laptop within 15 minutes. Each on-call week is compensated with a flat bonus of 400 USD plus one day off in lieu.

## Incidents and postmortems

Incidents are graded SEV1 to SEV4. SEV1 means a full outage or data loss affecting customers. Every SEV1 and SEV2 incident requires a blameless postmortem, which must be published within 5 working days. Postmortems list contributing factors, a timeline and action items with owners.

## Observability

Logs are kept for 30 days and metrics for 13 months. Every service must expose a /healthz endpoint and publish request latency and error-rate metrics. The service-level objective for the public API is 99.9% availability per calendar month, which allows about 43 minutes of downtime.

## Code style

Python services are formatted with Ruff and type-checked with mypy in strict mode. TypeScript code uses ESLint and Prettier. Public functions need docstrings, and new endpoints need an OpenAPI description before review.

## Your first two weeks

In week one you set up your laptop, get access to source control and the cloud console, and pair with your onboarding buddy on at least three small pull requests. By the end of week two you should have shipped one change to production yourself, run the local stack, and read the architecture overview and the last three postmortems of your team.

## Architecture overview

The platform consists of the public API gateway, about twenty backend services written mostly in Python and Go, and the Lumen Home mobile app. Services communicate over gRPC internally and expose REST only through the gateway. Asynchronous work goes through a managed Kafka cluster; every topic has an owning team listed in the service catalogue.

Persistent data lives in Postgres. Each service owns its own database and must not read another service's tables directly. Redis is used for caching and rate limiting only and must never be the only copy of any data.

## Feature flags

New functionality that is visible to customers ships behind a feature flag. Flags are created in the flag service and default to off in production. A flag that has been fully rolled out for 30 days must be removed from the code; the flag service opens a ticket automatically for flags older than 90 days.

## Database migrations

Schema migrations are written as forward-only scripts and reviewed by a second engineer from the owning team. Migrations must be backwards compatible with the version of the service that is currently running, because during a canary both versions run at the same time. Dropping a column therefore takes two releases: first stop using it, then remove it. Migrations that lock a large table for more than a few seconds must be scheduled with the database reliability team.

## API design

Public endpoints are versioned in the URL path (for example /v2/devices). A version is supported for at least 12 months after its successor is released. Breaking changes are announced to partners in the developer newsletter at least 90 days in advance. Every endpoint must document its error responses and rate limits.

## Dependencies

Third-party libraries are added through a pull request that states why the library is needed and which licence it uses. Libraries with copyleft licences such as the GPL need approval from the legal team. A bot opens pull requests for dependency updates every week; security updates labelled critical must be merged within 3 working days.

## Testing

Unit tests run on every commit. Integration tests run on every pull request and nightly against the staging environment. End-to-end tests for the mobile app run on a farm of real devices twice per day. Code coverage is reported but not enforced; reviewers should instead check that every bug fix comes with a test that would have caught the bug.

## Access and permissions

Production read access is granted by the team lead and recorded automatically. Production write access requires an approved change request and expires after 8 hours. Direct database access in production is reserved for the database reliability team, except during a declared incident.

## Documentation

Every service has a README in its directory that explains what the service does, how to run it locally, its main dashboards and its runbooks. Runbooks for alerts must be linked directly from the alert definition so that the on-call engineer can open them from the page. Architecture decisions are recorded as short ADRs in the docs folder of the monorepo.
