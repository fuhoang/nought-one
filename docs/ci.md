# Continuous integration

## Checks

| Workflow | Stable job name | Coverage |
| --- | --- | --- |
| `api-ci.yml` | `API checks` | PHP 8.5, Composer validation/locked install, PostgreSQL migrations, full PHPUnit suite, Pint check-only |
| `web-ci.yml` | `Web checks` | Node 24, cached npm locked install, ESLint, Next type generation/TypeScript, production build |
| `containers.yml` | `Container integration` | Production Docker builds, release-script unit tests, container health/non-root/smoke/shutdown checks, desktop/mobile Playwright tests |

All three run on PRs targeting `main` or `develop`, pushes to either branch and
manual dispatch. API and Web CI also run on pushes to `feature/**`, providing
PHPUnit/Pint and frontend lint/type/build feedback before a PR is opened.
Container integration, including browser tests, waits until the PR is opened
for feature branches. Committing locally does not trigger GitHub Actions; pushing does.

Push and PR runs remain separate: push checks test the branch commit, while PR
checks test GitHub's proposed merge with the target branch. An open feature PR
therefore receives both API/Web runs on subsequent pushes. This intentionally
retains merge validation without API lookups, extra permissions or skipped required
checks. There are no path filters, so required checks cannot remain
pending because only shared configuration or documentation changed. Superseded
CI runs are cancelled per workflow and PR/ref. Manual container runs are not
cancelled because an explicitly requested publication may be in progress.

The API workflow uses a disposable PostgreSQL 17 service with the database name
`nought_one_test`, matching the test suite's safety guard. Its credentials are
CI-only literals, not repository secrets. `.env.testing` and a random application
key are generated on the fresh runner. Sessions/cache/mail use array drivers and
queues run synchronously. No staging or production database is used. Composer's
download cache is keyed by the lockfile; dependencies are installed from that
lockfile on every run.

Web CI uses npm and the committed `apps/web/package-lock.json`. The cache stores
npm downloads, not `node_modules`. `API_BASE_URL=http://127.0.0.1:8000` and
`PUBLIC_SITE_URL=http://localhost:3000` are safe configuration placeholders for
the build, not live endpoints. No API server is needed for this build. Production
runtime URLs must still be configured separately in Railway. Build font fetching
and dependency installation require internet access.

PR jobs receive only `contents: read`; checkouts do not persist credentials.
Actions used by these CI workflows are pinned to immutable SHAs. Updates should
be reviewed deliberately, including their upstream release notes. No application
secrets are required. `pull_request_target` is not used.

## Existing manual release tools

Ordinary container CI no longer repeats native lint/typecheck/PHPUnit steps.
Manual publishing still runs these checks before exporting images, preserving
the existing release checks even when dispatched independently. Production
image builds and end-to-end tests remain in the container workflow. Manual
`publish=true` dispatch exports the exact tested images to a one-day artifact and
passes them to a separate publishing job with `packages: write`. PRs cannot run
that job, upload release images or deploy. Publishing was not executed as part
of this change. Allow for temporary artifact storage when using this option.

The existing `deploy.yml` remains manually dispatched and unchanged. It deploys
approved immutable image digests using protected environment configuration;
see [deployment documentation](deployment.md). CI does not invoke it. Repository
CI gates Railway GitHub autodeployments for the configured application services
through their enabled Wait for CI settings. This does not turn the manual
image-deployment workflow into an automatic release workflow.

## Local checks

From `apps/api`, with PHP 8.5 and the required PostgreSQL/GD/mbstring/XML extensions:

```sh
composer validate --strict
composer install --prefer-dist --no-interaction
# Configure .env.testing for a LOCAL PostgreSQL database named nought_one_test.
# Never copy staging/production credentials. Set APP_ENV=testing and DB_URL=.
php artisan key:generate --env=testing
php artisan migrate --env=testing --force --no-interaction
vendor/bin/phpunit
vendor/bin/pint --test
```

Keep `.env.testing` ignored. Check the host and database before migrations; use
only a disposable test database. Do not overwrite an existing local test config.
CI creates its config only on its fresh runner. The test suite independently
rejects any database name other than `nought_one_test`.

From `apps/web`, with Node 24:

```sh
npm ci
npm run lint
npm run typecheck
API_BASE_URL=http://127.0.0.1:8000 PUBLIC_SITE_URL=http://localhost:3000 npm run build
```

From the repository root:

```sh
node --test infrastructure/tests/deploy.test.mjs
# Full production container and browser checks: follow containers.yml and
# the isolated Docker integration procedure in docs/deployment.md.
```

Run `actionlint .github/workflows/*.yml` when changing workflow syntax.

## Diagnosing failures

Open the failing check in the PR, inspect its first failed step and reproduce
that command with matching PHP/Node versions and lockfiles. Composer validation
failures indicate manifest/lock drift; fix intentionally, never run an unreviewed
update merely to unblock CI. For database failures, check PostgreSQL health and
the test database name. For lint/type/build failures, fix the underlying issue;
do not skip checks or weaken assertions. For browser failures, download the
`browser-test-results` artifact, inspect traces and container logs, and reproduce
with the isolated Compose setup. Treat network/package registry outages as
infrastructure failures and rerun after resolving them. Required checks must
match the job names above, not workflow filenames.

## Railway deployment mapping — reviewed 18 November 2026

| Branch | Environment | Application services |
| --- | --- | --- |
| Feature/fix/docs branches | CI only | No deployment intended |
| `develop` | Staging | web and API |
| `main` | Production | web, API, worker and scheduler |

Railway service metadata confirms the latest successful deployments use the
branches above. Application roots are `/apps/web` and `/apps/api`; each environment
has managed PostgreSQL. Staging has no separate worker or scheduler today.

Wait for CI was enabled for the GitHub-source application services during setup.
PR checks and post-merge push checks are separate runs. The branch mapping was
read back during this review; CI gating and PR-environment settings were not
changed or independently reverified in this review. Automatic PR environments
were previously confirmed disabled. Recheck gating/settings before changing the
release process. `main` remains the repository's default branch.

Live GitHub-source deployments build the Dockerfiles in Railway. Manual image
publication and `deploy.yml` remain separate, explicitly dispatched tools; the
presence of those workflows does not mean production uses their GHCR digests.
See [deployment details](deployment.md) and the
[verification record and remaining roadmap](production-verification.md#remaining-roadmap).

## Implementation verification

Local verification on 2026-11-06 passed Composer validation and locked install,
all 203 PHPUnit tests (966 assertions), Pint check-only, npm locked install,
ESLint, TypeScript checks, the production Next.js build, four release-script
unit tests and actionlint 1.7.12 validation of all workflows. Both production
Docker images built successfully. Container health, non-root execution, HTTP
smoke checks and graceful shutdown checks passed. All 60 Playwright tests
passed across desktop and mobile; the disposable integration stack was removed.

The 2026-11-06 audit of the frontend lockfile reported eight moderate findings in the
ESLint/TypeScript-ESLint chain through minimatch; no high or critical findings
were reported. This is historical evidence; the 17 November dependency update and remaining
picomatch advisory are recorded in [production verification](production-verification.md).

Hosted verification is complete. [PR #1](https://github.com/fuhoang/nought-one/pull/1)
merged the CI changes into `develop`; [PR #2](https://github.com/fuhoang/nought-one/pull/2)
promoted them to `main`. All three workflows passed on both PRs. The README
followed through merged [PR #3](https://github.com/fuhoang/nought-one/pull/3) and
[PR #4](https://github.com/fuhoang/nought-one/pull/4), also with passing CI.

Verified hosted runs for the CI promotion:

- [API checks](https://github.com/fuhoang/nought-one/actions/runs/42504508521)
- [Web checks](https://github.com/fuhoang/nought-one/actions/runs/42504508545)
- [Container integration](https://github.com/fuhoang/nought-one/actions/runs/42504508539)

Manual image publishing was correctly skipped during PR runs. These are recorded
successful runs, not a claim that every future commit has passed.

After successful hosted checks, branch protections were enabled and read back on
both `main` and `develop`: PRs, all three checks, up-to-date branches and resolved
conversations are required, including for administrators. Force pushes and branch
deletion are disabled; mandatory approvals are zero for the solo maintainer.
See [the active protection rules](git-workflow.md#active-branch-protection).

Staging web `/health` and API `/up` and `/ready` returned HTTP 200 during the
original CI implementation verification. This is historical evidence, not ongoing
uptime monitoring or confirmation of production readiness.
