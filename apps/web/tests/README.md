# Public card tests

From `apps/web`, install dependencies with `npm ci` and Chromium with
`npx playwright install chromium`. The harness requires the API's Composer
dependencies, PHP with GD and PostgreSQL support, and a running PostgreSQL server.
Credentials are read from the existing ignored `apps/api/.env.testing` file.
The database role must be able to create `nought_one_e2e`, or that database must
already exist and be accessible to that role. Do not use cached Laravel config
when running these tests.

```sh
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Playwright starts isolated servers on ports 3011 and 8011, migrates only
`nought_one_e2e`, and stores sessions and images under ignored `tests/.runtime`.
It never uses the development card database. Each test creates a unique account
and card and removes its card afterward; test accounts remain in the isolated
database. Test servers shut down automatically when the run finishes.

Coverage includes desktop and mobile Chromium, automated accessibility scans,
keyboard interaction, clipboard fallback, vCard escaping and UTF-8 folding,
QR contents, metadata, publication and slug changes, hidden links, image
replacement, and API outage recovery. Screenshots and failure traces are under
`test-results`; the HTML report is under `playwright-report` (both ignored).

Real-device contact importing and Safari are not covered by this suite.

# Local preview

Run Laravel on port 8000 and `npm run dev` here. Open
`http://localhost:3000/c/<published-slug>`. The root route remains the existing
starter page. See `.env.example` for API and website origin settings. For a
phone or deployed site, set reachable origins and a matching Laravel `APP_URL`;
QR codes and canonical links use `PUBLIC_SITE_URL`.

Public card data is fetched afresh on server requests. Downloads recheck
publication and use no-store responses. Existing open pages and files already
downloaded cannot be remotely withdrawn; third-party social preview caches are
outside the application's control. Next.js streamed unavailable pages may carry
HTTP 200 with `noindex`; download and image routes return HTTP 404 for missing
or unpublished cards.
