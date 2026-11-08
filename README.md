# nought.one

A digital business card platform for creating, publishing and sharing a personal
or professional profile. Built with Next.js and Laravel, with a minimal,
monochrome interface that works on desktop and mobile.

## Features

- Account registration, sign-in, password recovery and email verification.
- A dashboard for creating, editing and deleting cards.
- Profile details, custom slugs and explicit draft/published states.
- Links with labels, ordering and visibility controls.
- Private avatar and logo uploads with failure-safe replacement.
- Public card pages at `/c/<slug>`, QR sharing and downloadable vCard contacts.
- SEO and Open Graph metadata for published cards.
- Unsaved-change protection, keyboard interactions and accessible error feedback.

Unpublished cards and their private images are unavailable through public
endpoints. Authentication and card ownership are enforced by the Laravel API.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React, TypeScript, Tailwind CSS |
| API | Laravel 13, PHP 8.5, Laravel Sanctum |
| Database | PostgreSQL |
| Sessions, cache and queues | PostgreSQL-backed Laravel drivers |
| Packaging | Docker; Compose for local development and integration tests |
| Hosting | Railway, with independently deployable web and API services |
| File storage | Private local storage for development; S3-compatible storage support for deployment, including Cloudflare R2 |
| Tests | PHPUnit, Playwright and Node.js test runner |

Redis is not required by the current configuration. S3-compatible storage support
does not imply that a deployed bucket has been provisioned or existing files migrated.

## Repository layout

```text
apps/
  api/                  Laravel API, authentication, cards and private assets
  web/                  Next.js website, dashboard and card editor
infrastructure/
  compose*.yaml         Local development and isolated integration stacks
  railway/              Deployment scripts and service configuration
  tests/                Container and deployment checks
.github/workflows/      API, web, container CI and manual release workflows
docs/                   CI, Git workflow and deployment guides
```

Each application has its own dependency manifest and lockfile. There is no
root-level npm workspace or root `npm install` step.

## Quick start with Docker

Install Git and Docker with the Compose plugin. Docker provides PHP, Composer,
Node.js and PostgreSQL for this development path. Ports **3000**, **8000** and
**5432** must be available; stop any host servers using those ports first.

Clone the repository and use the integration branch:

```sh
git clone https://github.com/fuhoang/nought-one.git
cd nought-one
git switch develop
```

Run the following from the repository root. The helper function applies both
Compose files consistently; define it again when opening a new terminal.

```sh
# Preserve an existing local configuration.
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
fi

export LOCAL_UID=$(id -u)
export LOCAL_GID=$(id -g)
dc() {
  docker compose -f infrastructure/compose.yaml -f infrastructure/compose.dev.yaml "$@"
}

dc build
dc up -d postgres
```

**On a fresh checkout only**, generate the Laravel application key. Skip this
command if your existing `.env` already contains an `APP_KEY`; keep that key stable.

```sh
dc run --rm api php artisan key:generate --no-interaction
```

Create the development database tables and start the services:

```sh
dc run --rm api php artisan migrate --no-interaction
dc up -d
```

| Service | Local URL |
| --- | --- |
| Website | http://localhost:3000 |
| Register an account | http://localhost:3000/register |
| Laravel API | http://localhost:8000 |
| Web health | http://localhost:3000/health |
| API readiness | http://localhost:8000/ready |

Register your own local account, create a card and publish it to try the public
page. There is no required shared demo account. Local emails are written to
Laravel logs rather than sent to an inbox.

Useful development commands:

```sh
dc logs -f api web worker
dc run --rm api composer install
dc run --rm web npm ci
dc down
```

Source code is bind-mounted for development. Dependency directories use named
volumes; run the install commands after changing lockfiles. `dc down` preserves
the database volume. **Do not use `down -v` on the development stack** unless you
intend to delete its local data.

See the [deployment guide](docs/deployment.md#local-development) for further
Docker details and the separate production-image test stack.

## Configuration

Keep credentials in ignored environment files or Railway variables, never in
committed files. Start from [the API example](apps/api/.env.example) and
[the web example](apps/web/.env.example).

| Variable | Purpose |
| --- | --- |
| `API_BASE_URL` | Browser-reachable Laravel origin used by the frontend |
| `API_INTERNAL_URL` | Optional server-only API origin for internal networking |
| `PUBLIC_SITE_URL` | Website origin used for canonical URLs, QR codes and contact downloads |
| `APP_URL` / `FRONTEND_URL` | Laravel and website origins used by the backend |
| `CORS_ALLOWED_ORIGINS` | Frontend origins allowed to call Laravel |
| `SANCTUM_STATEFUL_DOMAINS` | Frontend hosts, including local ports, using session authentication |
| `SESSION_DOMAIN` / `SESSION_SECURE_COOKIE` | Cookie scope and HTTPS behaviour |
| `CARD_ASSETS_DISK` | Private image storage disk |

Development Compose supplies the local PostgreSQL connection and service URLs,
including the internal API hostname. Its overrides take precedence over matching
values in `apps/api/.env`; that example file alone defaults to SQLite. The Docker
web service receives its URLs from Compose and does not require `.env.local`.
For host-based frontend development, copy the web example to `.env.local` and
configure the API separately.

Use `localhost` consistently for local browser access. For phone testing, use
reachable origins instead: a QR code containing `localhost` points to the phone
itself, not your development machine. Production subdomains also need matching
CORS, Sanctum and cookie settings; follow the deployment guide before deploying.

## Testing and CI

GitHub Actions runs on pull requests targeting `develop` or `main`, and pushes
to either branch. The suites below passed during the GitFlow/CI implementation;
test counts describe that baseline rather than a live status badge.

| CI job | Checks |
| --- | --- |
| API checks | Composer validation and locked install, isolated PostgreSQL migrations, 203 PHPUnit tests and Pint check-only |
| Web checks | Locked npm install, ESLint, TypeScript validation and production build |
| Container integration | Production Docker builds, four deployment-script tests, health/non-root/HTTP/shutdown checks and 60 Playwright executions across desktop and mobile |

The Laravel suite is primarily API feature testing; its `Unit` directory currently
contains the default example test. The Playwright suite includes two unit-style
vCard tests alongside browser and API integration scenarios. There is no separate
Jest/Vitest or React component-test suite yet.

For host-based checks, use PHP 8.5 with the required extensions, Composer, Node.js
24 and a dedicated local PostgreSQL test database:

```sh
# From apps/api, after configuring a LOCAL .env.testing and test database:
composer validate --strict
vendor/bin/phpunit
vendor/bin/pint --test

# From apps/web, after npm ci:
npm run lint
npm run typecheck
npm run build
```

Do not point tests at development card data, staging or production databases.
See [CI setup and troubleshooting](docs/ci.md) for complete prerequisites and
[the browser testing guide](apps/web/tests/README.md) for Playwright commands.
The [isolated Docker test procedure](docs/deployment.md#isolated-production-image-tests)
provides separate databases, volumes and ports for integration tests.

## Development workflow

Start `feature/*` and `bugfix/*` branches from `develop` and open PRs back into
`develop`. Promote reviewed releases to `main`; keep release and hotfix changes
synchronized across both long-lived branches. Run the relevant checks before
requesting review.

See [the Git workflow guide](docs/git-workflow.md) for release conventions,
semantic version tags and active branch protections. Both `main` and `develop`
require PRs and passing API, web and container checks, including for administrators.
Mandatory approvals are zero for the solo-maintainer workflow.

## Deployment

The deployment design uses separate web, API, queue worker and scheduler services,
with Railway-managed PostgreSQL and persistent private object storage. The three
backend roles share one Laravel image. Docker Compose is for local use, not for
orchestrating Railway production services.

Staging currently tracks `main`. The future `develop` → staging and `main` →
production mapping requires a separately approved Railway configuration change.
Railway **Wait for CI** is enabled and verified for both staging `web` and `api`
services, gating their GitHub autodeployments on successful checks. The manual image-publishing and deployment
workflows are separate from ordinary PR checks.

See [deployment, environment configuration and release procedures](docs/deployment.md).
Verify persistent image storage across redeploys before treating a deployment as
production-ready.

## Further reading

- [CI commands, security and troubleshooting](docs/ci.md)
- [Branching, pull requests, releases and hotfixes](docs/git-workflow.md)
- [Docker and Railway deployment](docs/deployment.md)
- [Browser tests and their limitations](apps/web/tests/README.md)
