# Docker deployment

nought.one uses two application images: Next.js and Laravel. The Laravel image
runs as the API, queue worker, scheduler, or a one-off Artisan command. Railway
runs independent services; Docker Compose is only for local development and tests.
Production PostgreSQL is provisioned through Railway. Redis is not required:
sessions, queues, scheduler locks and cache currently use PostgreSQL.

## Images and runtime boundaries

Build contexts are `apps/web` and `apps/api`. Both production images run as UID
10001. Application code is root-owned; only Laravel `storage`/`bootstrap/cache`,
Next.js `.next/cache`, and temporary directories are writable. Build stages keep
Composer, npm development dependencies and PHP compiler tools out of the final
images. PHP includes PostgreSQL, GD (JPEG/PNG/WebP), PCNTL and OPcache support.

The backend entrypoint accepts `api`, `worker`, `scheduler`, or an explicit command.
Production startup requires an existing `APP_KEY` and caches configuration after
runtime secrets are injected. It never generates keys or runs migrations itself.
The API runs nginx and PHP-FPM under a supervisor that forwards graceful stop
signals and exits if a required process fails. Worker and scheduler commands use
`exec` so PHP receives the container's signals directly.

The worker's 60-second timeout is below the configured production retry interval
of 120 seconds. Railway draining is 90 seconds for backend roles and 30 seconds
for Next.js. Restart policy is ALWAYS: a worker recycles normally after one hour.
Jobs must remain idempotent; a forced termination can still cause a retry.

`/health` checks Next.js. Laravel `/up` checks boot and `/ready` checks the database
and configured cache. Readiness failures return a generic 503 without diagnostics.
Worker and scheduler Docker checks use recent loop/tick heartbeats. Scheduler
health may take a minute to become ready. These are liveness signals, not proof
that every job succeeded: monitor failed jobs and cleanup backlog as well.

## Local development

Keep the existing `infrastructure/compose.yaml` project identity and
`postgres_data` volume. Do not run `down -v` on the development stack. If another
PostgreSQL server uses port 5432, stop that service or choose a local port mapping
before starting Compose. Do not run host and Docker web/API servers on the same
ports simultaneously.

Use the existing ignored `apps/api/.env`. For a new checkout, copy `.env.example`
to `.env` and generate a local APP_KEY once. Do not overwrite an existing file.
From the repository root:

```sh
export LOCAL_UID=$(id -u)
export LOCAL_GID=$(id -g)
docker compose -f infrastructure/compose.yaml -f infrastructure/compose.dev.yaml build
docker compose -f infrastructure/compose.yaml -f infrastructure/compose.dev.yaml up -d postgres
docker compose -f infrastructure/compose.yaml -f infrastructure/compose.dev.yaml run --rm api php artisan migrate --no-interaction
docker compose -f infrastructure/compose.yaml -f infrastructure/compose.dev.yaml up -d
```

The development build matches your host UID/GID so non-root PHP and Node can
write bind-mounted cache/log files without changing host ownership. Repeat these
exports in each shell used for development Compose commands. Production images
retain the fixed UID/GID 10001.

The website is on localhost:3000 and API on localhost:8000. Source files are bind
mounted; Linux vendor/node_modules and Next.js output use separate named volumes.
After dependency changes run Composer/npm installation inside the development
containers to refresh these volumes. Local mail is logged, never sent.

## Isolated production-image tests

`compose.test.yaml` is a standalone project called `nought-integration`. Do not
combine it with the development Compose file. It owns separate PostgreSQL and
asset volumes, uses ports 3011/8011, and has two databases: `nought_one_e2e` and
`nought_one_test`. Its hard-coded credentials and key are test fixtures only.

```sh
docker compose -f infrastructure/compose.test.yaml --profile tools build
docker compose -f infrastructure/compose.test.yaml up -d --wait postgres
docker compose -f infrastructure/compose.test.yaml run --rm api php artisan migrate --force --no-interaction
docker compose -f infrastructure/compose.test.yaml run --rm phpunit
docker compose -f infrastructure/compose.test.yaml up -d --wait --wait-timeout 150
node infrastructure/tests/container-smoke.mjs
sh infrastructure/tests/shutdown.sh
```

The smoke test exercises APP_ENV=production and runtime configuration caching,
using the unmodified production API entrypoint with database
sessions/cache, CSRF, card CRUD, publication and server-side frontend fetching.
The shutdown test enqueues a five-second job, sends SIGTERM while it runs, and
requires completion and a clean worker exit. It also checks that web/API/scheduler
stop without SIGKILL. The queue probe refuses non-test databases.

The existing browser suite needs test-only notification capture and outage
simulation. Its override mounts a guarded test front controller; it is **never**
part of a production deployment. Its array cache prevents unrelated tests from
sharing rate-limit counters. Production throttling is not changed.

```sh
mkdir -p apps/web/tests/.runtime/assets apps/web/tests/.runtime/private apps/web/tests/.runtime/sessions
# Linux only, if required: give container UID 10001 write access to this disposable
# test directory. CI uses chmod -R 777 on this ignored, fake-account-only directory.
docker compose -f infrastructure/compose.test.yaml -f infrastructure/compose.e2e.yaml up -d --wait api
cd apps/web
npm ci
npx playwright install chromium
E2E_EXTERNAL_SERVERS=1 E2E_PHP_CONTAINER=nought-integration-api-1 npm run test:e2e
```

The host PHP/Next.js test workflow remains supported; omit both E2E environment
variables to use it. From the repository root, remove only the disposable stack:

```sh
docker compose -f infrastructure/compose.test.yaml down -v
```

## Railway provisioning

Create separate staging and production environments. In each, provision Railway
PostgreSQL plus four image-based services: `web`, `api`, `worker`, `scheduler`.
Keep them in the same region; start with one replica each. Only web/API receive
public domains. Do not expose PostgreSQL, workers or scheduler publicly. Do not
attach application volumes: durable uploads belong in object storage.

The files under `infrastructure/railway/` contain service-instance settings used
by `deploy.mjs`, not legacy `railway.json` auto-discovery files. The script uses
Railway's GraphQL API and waits for each service deployment to succeed. API goes
first so its pre-deploy migration completes before worker/scheduler promotion.
The three backend services receive the same immutable digest. Frontend releases
are independent and do not trigger backend releases.

Copy the example environment settings into Railway's variable store and supply
real secrets there. Replace database service references if your database is named
something other than `Postgres`. Preserve one stable APP_KEY across API, worker
and scheduler within an environment; staging and production need different keys.
Set `CONTAINER_ROLE=worker`/`scheduler` for operational clarity (the entrypoint also
records the role for its local health check). Never copy test credentials.

Configure registry read credentials for private GHCR packages. Configure these
GitHub environment values for `staging` and `production`:

- Secret `RAILWAY_API_TOKEN`: a Railway account/workspace API token accepted by
  bearer authentication, restricted to the deployment workspace where possible.
- Variables `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_WEB_SERVICE_ID`,
  `RAILWAY_API_SERVICE_ID`, `RAILWAY_WORKER_SERVICE_ID`,
  `RAILWAY_SCHEDULER_SERVICE_ID`.

Protect the production GitHub environment with required reviewers and allowed
release branches. Keep image auto-updates and source-repository auto-deploys off
for these image-based services. Do not trigger competing dashboard deployments
while a release workflow is running.

## Build once and release

The Container checks and images workflow builds Linux AMD64 images on GitHub's
Ubuntu runner, runs PHPUnit, runtime smoke/shutdown checks and desktop/mobile
browser tests, then publishes **those exact images** only when manually dispatched
with `publish=true`. Ordinary pushes and PRs only verify. It emits immutable GHCR
references in the workflow summary. No production secrets are available to builds.

Dispatch Deploy tested image with the component, environment and tested image
reference including `@sha256:...`. First deploy to staging, complete the checklist
below, then promote that same digest to production. For an initial launch, deploy
the backend before the web service. Backend migrations run once through the API's
pre-deploy command, not every container start. Use additive/backward-compatible
migrations so old and new services can overlap. Never automate destructive schema
rollback. Concurrent releases within an environment are serialized by GitHub.

Base images track Node 24/PHP 8.5 Debian bookworm and Composer 2. Rebuild regularly
for base security updates. Release reproducibility is by the published digest;
rebuilding the same source later can pick up newer base OS layers. The workflow
must pass again for the rebuilt image.

## Domains, Sanctum and internal requests

Example production domains are `app.nought.one` and `api.app.nought.one`; staging
can use `staging.nought.one` and `api.staging.nought.one`. This keeps cookie scopes
separate (`.app.nought.one` versus `.staging.nought.one`). Confirm domain ownership
and configure Railway TLS before launch. Unrelated platform-generated domains
are unsuitable for this shared-cookie Sanctum setup.

Set `API_BASE_URL` to the browser-reachable HTTPS API origin and `PUBLIC_SITE_URL`
to the website origin. Optional `API_INTERNAL_URL` is server-only, for example
`http://api.railway.internal:8080`; Laravel listens on IPv4 and IPv6. The frontend
continues to validate returned image URLs against the **public** API origin.
`FORCE_PUBLIC_URL=true` makes Laravel generate public HTTPS URLs even when Next.js
calls it over private HTTP. Runtime URLs are not baked into the frontend image.

Configure exact credentialed CORS origins, Sanctum hosts without schemes, secure
HttpOnly session cookies and SameSite=Lax. The shared XSRF cookie is intentionally
JavaScript-readable; the browser sends its decoded value in X-XSRF-TOKEN after
requesting `/sanctum/csrf-cookie`. Authentication and ownership remain backend
checks. Do not use wildcard CORS or disable CSRF to resolve deployment issues.

`TRUSTED_PROXIES=*` is suitable only behind controlled platform ingress: prevent
direct untrusted access to the origin. The application trusts forwarded client
IP/protocol/port, not forwarded host. On ECS configure the appropriate load
balancer/network trust boundary instead of copying this setting blindly.

## Private storage and external services

Create a private R2 bucket and bucket-scoped read/write credentials. Configure
`CARD_ASSETS_DISK=card_assets_s3`, the R2 endpoint, region `auto`, bucket and keys.
Keep public bucket access disabled. The S3 adapter throws on storage failures;
existing replacement/cleanup transactions remain intact. Images are streamed
through Laravel, which checks ownership or current publication on every request
and returns private/no-store cache controls. The scheduler retries failed cleanup.
Do not replace these URLs with public bucket URLs or long-lived signed URLs.

Existing local assets are **not automatically migrated**. Before importing a
local database into production, copy and verify every referenced object and then
update its disk reference in a controlled migration; retain originals until
verification succeeds. A clean production database does not need that migration.
R2-to-S3 migration can retain the `card_assets_s3` logical disk and object keys.

Production mail delivery is a separate launch prerequisite. The example uses the
existing SMTP transport; Railway restricts SMTP to eligible plans. An HTTPS mail
provider requires its own approved integration. Do not use the log mailer for real
password reset/verification emails in production. No email delivery was provisioned
or tested by this Docker change.

Enable PostgreSQL backups/PITR and rehearse restoration before launch. Railway
provisions the database, but backup configuration, restore checks and application
schema remain operational responsibilities. The example requires TLS; configure
certificate verification (`verify-full` with the appropriate CA/hostname) when
available for the chosen database endpoint. Never expose credentials in logs.

## Production verification and rollback

Before promoting a release:

1. Confirm image digests, non-root UIDs, health endpoints and APP_DEBUG=false.
2. Verify registration/login/logout and CSRF in an actual HTTPS browser, including
   blocked unrelated CORS origins and private routes when signed out.
3. Verify real recovery/verification delivery, correct frontend links and session
   revocation after reset. Check logs do not contain tokens or email contents.
4. Upload/replace avatar and logo; confirm private bucket objects, public access
   only while published, immediate revocation on unpublish, and owner-only private
   content. Simulate a storage failure and confirm the old image survives.
5. Verify link visibility/order, slug changes, QR website URLs and vCard downloads.
6. Redeploy API, worker and web independently. Sessions and objects must survive.
7. Process a real queued test job, check failed jobs, scheduler heartbeat and asset
   cleanup backlog. Railway HTTP deploy checks do not continuously monitor workers.
8. Configure ongoing external uptime monitoring, check resource usage and run a
   database restore drill. Bucket availability needs a separate controlled check;
   it is deliberately not queried on every HTTP readiness probe.

Keep the previous web/backend digests. Roll back the affected component to its
previous digest, then recheck the public and authenticated flows. Database schema
must remain compatible; restore data only through an explicitly reviewed recovery
procedure. Do not automatically reverse migrations when reverting a container.

## AWS ECS/Fargate migration

Use the same immutable images in ECS tasks (copy to ECR if desired): separate web,
API, worker and singleton scheduler services. Map HTTP traffic through an ALB,
configure task health checks/draining, keep PostgreSQL in RDS and uploads in S3.
Use Secrets Manager for APP_KEY/database secrets and an ECS task role for S3
credentials instead of static keys. Laravel's S3 client supports the default AWS
credential provider chain when static keys are absent. Keep private networking,
public canonical URLs, cookie scope and controlled one-off migrations unchanged.
No Kubernetes or production Compose orchestration is required.

References: [Railway image/start commands](https://docs.railway.com/builds/build-and-start-commands),
[health checks](https://docs.railway.com/deployments/healthchecks),
[deployment draining](https://docs.railway.com/deployments/deployment-teardown),
[service API](https://docs.railway.com/integrations/api/manage-services),
[database responsibilities](https://docs.railway.com/databases),
[Laravel S3 configuration](https://laravel.com/framework/docs/13.x/filesystem).

## Local verification record — 4 November 2026

- Production images built for ARM64 and AMD64; required PHP/Node runtimes started.
- PHPUnit passed on host and in Docker: 203 tests, 966 assertions.
- Desktop/mobile Playwright passed against Docker: 60 tests.
- Release orchestration tests: 4 passed (including failed API rollout and immutable image checks).
- Frontend lint, TypeScript checks and production builds passed.
- Compose validation, production-mode HTTP/session/CSRF smoke tests, non-root and
  image-content checks, worker in-flight shutdown and API/scheduler/web shutdown passed.
- Simulated PHP-FPM failure stopped the API container as intended.
- Composer audit reported no advisories after the approved symfony/mime patch.

Live Railway deployment, domain/TLS configuration, real mail delivery, R2 access,
backup restoration and production monitoring remain launch verification tasks.
No registry publication or live deployment was performed during implementation.
