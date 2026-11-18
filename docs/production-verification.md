# Production regression and persistence verification

Prepared 14 November 2026. Executed 15 November; final cleanup verified 16 November 2026.
Status: **completed with the limitations recorded below**.

## Scope and boundaries

Verify card functionality and persistence through independent redeployments of
production web, API, worker and scheduler. Production origins are
https://nought.one and https://api.nought.one.

Use an owner-approved signed-in account through the browser; do not request or
record its password, cookies or tokens. Create one clearly labelled disposable
card with a unique `qa-production-<timestamp>` slug and synthetic contact details.
Do not edit existing cards. Record the created card ID and exact asset IDs so
cleanup is limited to this run. A second owner-controlled account is needed if
live cross-account ownership checks are included; otherwise mark those untested.

Do not run the repository's PHPUnit, Playwright fixture bootstrap, migrations,
seeders or database reset commands against production. Do not modify production
storage credentials to simulate failure. Do not restart or redeploy PostgreSQL.
Backups and external monitoring remain deferred at the owner's request.

## Before execution

- Confirm the test account and a convenient redeployment window with the owner.
- Check for pending Railway changes and other active deployments; avoid applying
  unrelated staged changes.
- Record service deployment IDs, commit hashes, image digests and restart policies.
- Confirm the redeploy uses the intended existing release, not newer source code.
- Review API pre-deploy migration behavior; stop if new migrations would run.
- Verify web `/health` and API `/ready` return 200.
- Record aggregate queued/failed job and asset-cleanup counts, without user data.
- Confirm both background services run and use Always restart.
- Keep the same signed-in browser context throughout persistence testing.
- Use a separate signed-out context for public/private access checks.
- Store only sanitized evidence: timestamps, statuses, test IDs and screenshots
  without private account details. Do not save browser storage state or HAR files
  containing credentials.

## Functional baseline

| Check | Expected result | Result/evidence |
| --- | --- | --- |
| Create draft | Owner sees card; public URL unavailable | Passed — owner editor opened; public API returned 404. |
| Save profile | Values persist after reload | Passed — reload preserved values; saves succeeded after each service redeployment. |
| Required/invalid fields | Useful errors; typed input preserved | Partial — duplicate slug rejected and input preserved; full invalid-field matrix not repeated. |
| Unsaved edits | Navigation warning; cancel preserves edits | Passed — leaving triggered a warning; Cancel retained input. |
| Add/edit/order links | Changes persist in intended order | Partial — two links created and reordered; individual edit/delete not repeated. |
| Hide/show link | Public page includes only visible links | Partial — hidden link excluded from public API/page and vCard; show-again not repeated. |
| Upload avatar and logo | Images display; private R2 objects exist | Passed — both uploaded, displayed and served through Laravel. |
| Replace image | New image displays; replaced object cleaned up | Passed for avatar — served pixels matched replacement (80,80,80); logo replacement not repeated. Final R2 prefix empty after cleanup. |
| Publish | Public page works in signed-out context | Passed — unauthenticated HTTP request returned public data; browser rendered profile. |
| Change published slug | Warning shown; new URL works; old URL unavailable | Passed — confirmation warning; old API URL 404, new URL 200. |
| QR | Encodes current production website URL, not API or localhost | Passed — downloaded PNG pixel-for-pixel matched QR generated for the exact production website URL. |
| vCard | Downloads valid contact file using public information | Passed — downloaded vCard 4.0 with CRLF, public synthetic details and visible link only. |
| Desktop and mobile | Navigation/forms usable; no overflow | Partial — desktop editor used successfully; public card visually checked at 427×952. Full mobile editor flow not repeated. |
| Unpublish | Public card and its public asset URLs unavailable | Passed — public API and both previously captured asset URLs returned 404. |
| Republish | Public card and intended assets work again | Passed — public data and both assets returned 200. |
| Signed-out private access | API denies access to private card/asset endpoints | Partial — private card API returned 401; separate private asset request not repeated. |

Leave the test card published with a saved profile, visible/hidden links, avatar
and logo for the persistence phase. Record exact values and asset identifiers.
Capture the public asset URL before unpublishing to test that same URL afterward.

## Independent redeployment sequence

Redeploy one service at a time: **Web → API → Worker → Scheduler**.
Wait for successful deployment and running instances before proceeding.

After every service redeployment:

1. Check web `/health` and API `/ready`.
2. Reload the existing signed-in browser session without logging in again.
3. Confirm `/api/v1/me` succeeds and the editor displays the saved card values.
4. Make and save a small edit to the disposable card; confirm no CSRF 419 error.
5. Check avatar/logo delivery through Laravel and the public card in the separate
   signed-out browser context. Confirm existing R2 asset IDs remain unchanged.
6. Check queue/failed-job/cleanup counts and new error logs.
7. For worker/scheduler, confirm the intended command and running process. After
   scheduler redeployment, allow a tick and verify heartbeat and cleanup activity.

A running worker alone does not prove queued-job execution or its one-hour restart.
Those remain separate follow-up checks unless explicitly exercised in this run.

| Redeployed service | Deployment ID/time | Session | Data/images | Health | Result |
| --- | --- | --- | --- | --- | --- |
| Web | `4ba5c167-8fcc-4fae-b90b-4915ac1a5c7c` / 15 Nov 2026 | Passed | Passed | 200 | Passed |
| API | `b9faf2eb-c10d-459b-9ea8-13fb89dffa3a` / 15 Nov 2026 | Passed | Passed | 200 | Passed |
| Worker | `dbc98503-e285-4c51-ac50-9dab4d1422fa` / 15 Nov 2026 | Passed | Passed | 200 | Passed; heartbeat 3 seconds |
| Scheduler | `bc9c0dd3-607e-4fa9-adf4-51c491dc428e` / 15 Nov 2026 | Inconclusive; browser signed in again | Passed | 200 | Data/health passed; heartbeat 17 seconds |

## Stop conditions and cleanup

Stop further redeployments if a health check fails, authentication is unexpectedly
lost, saved data/images disappear, or new application errors occur. Record the
failure and affected deployment. Do not automatically roll back database schemas,
restore a database, change secrets or modify unrelated services. Assess an
application rollback against the captured previous deployment first.

On success, delete only this run's test card through the application. Confirm its
public URL is unavailable and its recorded image objects are removed. If cleanup
is delayed, inspect the retry record instead of deleting arbitrary R2 objects.
Do not delete an existing user account or reset its password.

Report each check as passed, failed or not tested; distinguish user-observed
results from independently collected evidence. Record any temporary resources
left behind. A passing run does not replace backups, monitoring or a rollback drill.

## Execution evidence and limitations

- Disposable card: `01a1de11-fba7-708a-b7cc-01010259c26b`, initially
  `qa-production-20261115`, then `qa-production-20261115-verified`.
  Existing user cards were not edited.
- All four redeployments used the existing release, without `--from-source`.
  Baseline commit: `cd0ce45c9fc8bcdc64f90e98e01adfe55bd02352`.
  No pending migration or staged configuration patch was found. PostgreSQL was
  not redeployed.
- The same authenticated editor survived web, API and worker redeployments, with
  successful saves after each. During the interruption before final scheduler
  verification, the browser was observed signing in again. Scheduler session
  continuity is therefore inconclusive, not a demonstrated deployment failure.
  Saving after the new sign-in succeeded.
- Across API, worker and scheduler redeployments, image IDs and SHA-256 hashes
  remained stable: avatar `4515c2c2fde731df2120367171855302940e2603e031b0a10f7009e758377de3`,
  logo `a7bca374ff4e51010e4266b3c9bb8babfdc4397364f71161e131f9005de3e4ae`.
  Responses used `private, no-store, max-age=0`. Asset replacement intentionally
  preserves the asset ID while changing its storage key and bytes.
- QR verification compared the downloaded PNG to a QR generated for
  `https://nought.one/c/qa-production-20261115-verified`; pixels matched exactly.
  An independent scanner was not used.
- Reserved slug enforcement was not demonstrated: `dashboard` was accepted as a
  card slug under `/c/`. Duplicate slug validation did reject an existing slug.
  Review the reserved-slug requirement separately; no application code was changed.
- Cross-account ownership, forced storage/API failures, individual asset deletion,
  a real queued job, worker one-hour restart, full mobile editor coverage and
  exhaustive error-log review were not exercised in this run. No production
  credentials or infrastructure settings were changed to inject failures.

## Final cleanup — 16 November 2026

The disposable card was deleted through the editor. The dashboard returned to its
one pre-existing card. Read-only checks confirmed:

- Test card rows: **0**; test asset rows: **0**.
- Objects under the exact test-card R2 prefix: **0**, including replaced images.
- Queued jobs: **0**; failed jobs: **0**; asset cleanup backlog: **0**.
- Test public API and both public image URLs: **404**.
- Web `/health` and API `/ready`: **200**.

The deleted public website route returns HTTP 200 with the unavailable-page
content (streamed Next.js response); it does not expose the deleted profile.
No live test card or R2 objects remain. Synthetic QR/vCard downloads may remain
in the local Downloads folder. Backups and monitoring remain deferred.

## Background-job verification — 17 November 2026

- Production uses the database queue and database cache. Worker and scheduler
  start commands select their correct roles; both Railway restart policies are
  `ALWAYS`. Their heartbeats were fresh (0–2 seconds).
- A harmless queued cache-marker job was first validated in the isolated Docker
  stack, then enqueued through the production API container. The production worker
  completed it asynchronously. The marker was removed afterward; queued jobs,
  failed jobs and asset cleanup backlog were all zero.
- Natural hourly worker recycling was observed: process age advanced to 3,547
  seconds, then reset to 11 seconds with a one-second heartbeat age, without a
  manual restart or redeploy. Deployment `8c380ddc-766a-4412-ba2a-1b243386908d`
  remained successful. A second queued marker job completed after recycling;
  its marker was removed and all three backlog counts remained zero.
- Existing `CardAssetFailureTest` coverage passed in the isolated PostgreSQL test
  environment: **14 tests, 86 assertions**. This includes durable retry after
  replacement, individual asset deletion and parent card deletion failures,
  abandoned upload cleanup, and preserving retry records when cleanup fails.
- The existing isolated queue probe completed its in-flight job during worker
  shutdown; the worker exited with code 0 and restarted successfully. The disposable
  integration stack and its volumes were removed after verification.
- Production storage failures were not injected. Cleanup retry evidence is from
  automated tests with simulated storage failures, not a live R2 outage. No email
  was sent and no user records, production configuration or deployments changed.

## Editor regression follow-up — 17 November 2026

- Complete Laravel suite: **221 tests, 1,110 assertions passed**, including
  cross-account card, link and private asset authorization and publication checks.
- Production-build editor browser suite: **18 tests passed** across desktop Chrome
  and Pixel 7 emulation. Coverage includes a second authenticated account receiving
  404 for another owner's card, draft creation/deletion, profile editing, unsaved
  navigation protection, session expiry/recovery, publication and URL changes,
  link ordering/visibility, avatar/logo replacement, and image deletion.
- Added server-error coverage verifies profile input survives an HTTP 503 response
  without automatic write retries. A logo replacement HTTP 500 preserves the old
  bytes and succeeds on explicit retry. Existing tests cover network failures,
  validation errors and CSRF recovery. Failures were injected only in local tests.
- Desktop/mobile screenshots were reviewed; overflow assertions and the existing
  editor/dialog accessibility scans passed. Mobile coverage is browser emulation,
  not a physical-device test.
- The owner selected explicit reservation of application-route names. New cards
  and slug changes now reject `api`, `c`, `dashboard`, `email`, `forgot-password`,
  `health`, `login`, `logout`, `ready`, `register`, `reset-password`, `sanctum`, `up`
  and `verify-email` with a field-level 422 response. Exact names are reserved;
  names such as `dashboard-studio` remain valid. Existing reserved slugs retain
  their URLs and can still be saved unchanged; moving away releases that exception.
- Lint, TypeScript, PHP formatting and production build passed. The first build
  stopped after showing a Next.js security advisory; its requested retry passed.
  An audit confirmed moderate Next.js and lint-toolchain advisories. Dependencies
  were not upgraded in this change.
- Live scheduler-redeployment session continuity passed after the owner signed in.
  Production scheduler deployment `a72117fd-3f9e-403b-befc-56d59fff8db0` succeeded
  using the same image digest as its predecessor
  (`sha256:0ab6c08cca3f9930f3094a99385de27e9ba659cf96fa326133f01adf756d6078`).
  The dashboard remained authenticated before and after a full reload, displaying
  the existing card and Sign out control without another login. The scheduler
  heartbeat was 34 seconds old. Only the scheduler was redeployed; no cards were
  edited and no authentication cookies or credentials were extracted.

## Frontend dependency security review — 17 November 2026

- Updated Next.js and `eslint-config-next` from 16.4.3 to 16.4.6. Refreshed
  `typescript-eslint` from 8.71.2 to 8.73.0, which uses minimatch 11.0.9 for its
  affected dependency path. No application behavior or dependency overrides changed.
- `npm audit --omit=dev` reports **zero vulnerabilities**. The reported Next.js
  cache-disclosure and minimatch advisories are resolved in the installed tree.
- The full audit still reports **14 high-severity affected development packages**,
  all propagated from one underlying picomatch ReDoS advisory:
  [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
  At review time, the advisory lists all releases through 4.0.7 as affected and
  no patched release; npm also lists 4.0.7 as latest. This remains open pending an
  upstream fix. The audit's proposed Next.js ESLint configuration downgrade was
  not applied, and no audit suppression was added.
- Validation passed: frontend lint, TypeScript checks, production build and the
  complete **74-test desktop/mobile browser suite** against isolated local services.
  The production build no longer stops for the previously reported Next.js advisory.

## Remaining roadmap

Status reviewed 18 November 2026. PRs #17–#22 promoted the background-job report,
editor regression/slug changes and frontend security updates through `develop`
to `main`. Documentation and Git maintenance are prepared on a separate branch;
their publication remains pending PR review.

| Task | Status / remaining work |
| --- | --- |
| Domain, email and private images | Verified: apex/www routing, Resend recovery/verification and private R2 storage |
| Background processing | Verified: real queued jobs, automatic hourly recycling, graceful shutdown and isolated cleanup failure retries |
| Editor/ownership regression | Passed: 221 Laravel tests / 1,110 assertions and desktop/mobile coverage; reserved application-route slugs enforced with existing-URL compatibility |
| Frontend security update | Merged: Next.js 16.4.6, patched minimatch path; 74 browser tests passed, runtime audit clear at last check |
| Development dependency advisory | Open: picomatch GHSA-fc5q-39xc-vjpf had no patch at the 17 November review; recheck upstream availability |
| Rollback rehearsal | Staging API rollback/restoration passed on 17 November; frontend rollback and authenticated continuity during rollback remain |
| Backups/PITR and isolated restoration | Deferred by owner; not enabled or claimed verified |
| External uptime monitoring | Deferred by owner; provider and alerts not configured |

The staging API rehearsal used the previous compatible backend image, checked
health/readiness, unauthenticated 401 and CSRF/CORS, then restored the original
image in deployment `ba76fac1-76ea-43b0-967d-4347d6415783`. It did not reverse
migrations or change production. Later normal releases supersede that deployment.

Mobile checks use browser emulation; failure injection uses isolated test
services. These results do not claim physical-device testing or a live R2 outage.
