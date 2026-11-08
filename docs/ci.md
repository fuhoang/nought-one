# Continuous integration

## Checks

| Workflow | Stable job name | Coverage |
| --- | --- | --- |
| `api-ci.yml` | `API checks` | PHP 8.5, Composer validation/locked install, PostgreSQL migrations, full PHPUnit suite, Pint check-only |
| `web-ci.yml` | `Web checks` | Node 24, cached npm locked install, ESLint, Next type generation/TypeScript, production build |
| `containers.yml` | `Container integration` | Production Docker builds, release-script unit tests, container health/non-root/smoke/shutdown checks, desktop/mobile Playwright tests |

All three run on PRs targeting `main` or `develop`, pushes to either branch and
manual dispatch. There are no path filters, so required checks cannot remain
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
CI gates Railway GitHub autodeployments for the staging web and API services
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

## Confirmed Railway settings (2026-11-08)

- Project: **Nought One**, environment: **Staging**.
- Both `web` and `api` use GitHub source `fuhoang/nought-one` and track `main`.
  Their root directories are `/apps/web` and `/apps/api`, respectively.
- **Wait for CI is enabled on both services.** The saved `source.checkSuites=true`
  values were read back and verified, and the owner confirmed them in the UI.
  Only those two settings changed; deployment branches and other environment
  configuration were preserved.
- A push or merge to `main` triggers the configured GitHub Actions workflows.
  Railway waits for those workflows before deploying; a failed workflow blocks
  that deployment. PR checks and post-merge push checks are separate runs.
  See [Railway Wait for CI](https://docs.railway.com/deployments/github-autodeploys).
- Automatic PR environments were confirmed disabled in the Railway UI before
  opening the CI PR. Opening PRs does not intentionally provision previews.
  Recheck this setting if project configuration changes.
- Web and API remain independently deployable services. The existing production
  environment's deployment metadata does not establish production launch readiness.
- Dockerfiles and `infrastructure/railway/` release configuration are in Git.
  Live GitHub-source deployments are distinct from the manual image-deployment
  workflow; having that workflow in the repository does not prove it was executed.
- `main` remains the GitHub default branch.

Future mapping, **not configured by this task**:

| Branch | Intended environment |
| --- | --- |
| `feature/*`, `bugfix/*` | CI only |
| `develop` | Staging |
| `release/*` | CI, optional explicitly approved preview |
| `main` | Production |

Moving staging to `develop`, enabling previews/CD, changing domains/variables,
creating production infrastructure or changing the active protections need separate
approval. Before production deployment work, verify image persistence across
redeploys and private S3-compatible storage. The staging-to-`develop` transition
and production launch remain future work.

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
were reported. Dependency upgrades are a separate follow-up, not part of this
CI change.

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
