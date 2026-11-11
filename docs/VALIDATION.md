# JavaScript migration verification

Current branch: `migration/javascript-assignment`. Verification uses synthetic records and isolated PostgreSQL; no university records were migrated and no public institutional deployment is claimed.

## Local checks

- Application backend, seed/import tools, tests, browser modules and browser tests are plain JavaScript. No authored `.ts`/`.tsx` files or direct TypeScript/React/Vite/Tailwind application dependencies remain.
- JavaScript syntax checks pass in backend and frontend. The application runs directly with Node and serves HTML/CSS/JS without compilation.
- **19 Node/Supertest/rule/import tests** pass against PostgreSQL: preserved attendance/auth/concurrency/correction/reporting behavior plus administrator provisioning, duplicate creation, enrollment, owned class creation and configurable thresholds.
- **6 browser journeys** pass: lecturer → mobile student → registrar report/PDF; offline reload and stale-code rejection with account isolation; valid pending acceptance after reconnection; and plain-form account/course/enrollment/class setup with the lecturer's own report; and server-synchronized Kampala dates, clean product wording and mobile navigation.
- **10 additional browser queue tests** pass: persisted Retry-After and repeated transient failures, lost responses, immutable attempts, permanent rejection, two-tab leases, deletion during replay, account switch/logout during refresh, successful renewal, legacy credential/data migration and expired-lease recovery. The sixth full journey verifies that a failed local save remains visible and sends no check-in.
- The documented Postman collection is executed with Newman, including success/invalid requests, captured IDs/tokens, example response shapes and error assertions. The final local run passed **53 requests and 176 assertions with zero failures**; `postman/verification-summary.json` records the sanitized totals. Existing saved response examples remain sanitized examples from the earlier verified run; the new originating-account rejection is covered by executable assertions.
- Additive database migration supplies a per-offering threshold with 1–100 bounds, retaining existing records and their 80% demo default.
- The earlier repeatable demo dataset and transactional local importer are retained as JavaScript commands.

The local database is PostgreSQL 18.6 running as a user-owned temporary cluster because this workstation has no Docker engine. Hosted CI uses PostgreSQL 16 and additionally checks packaged Compose startup, migrations, runtime seeding, served HTML/JS and authenticated API/database access.

## Reproduce

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm run check --prefix backend
npm run check --prefix frontend
# API tests clear the isolated sams_test database; never use real records.
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm run prisma:deploy --prefix backend
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm test --prefix backend
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm run seed --prefix backend
```

Start the backend against that test database with NODE_ENV=test and distinct JWT secrets, then run the collection:

```bash
npx --yes newman@6.2.3 run postman/SAMS.postman_collection.json \
  --env-var baseUrl=http://localhost:3000/api --bail
```

Install browser support from frontend using `npx playwright install chromium`. With the same test application running:

```bash
SAMS_E2E_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test \
  npm run test:e2e --prefix frontend
```

Defaults: one Express application on localhost:3000 for both frontend and API. SAMS_BASE_URL and SAMS_API_URL can override those origins. PLAYWRIGHT_EXECUTABLE_PATH can select an installed Chromium-compatible browser. E2E setup resets only synthetic demo live classes and refuses database names not ending `_test`.

## Boundaries

The collection creates test accounts/offerings/classes; run it only against a disposable database. Postman and browser test accounts are synthetic. Node syntax checks do not replace runtime validation/tests. Individual member contributions are excluded as requested. HoD excuse approval, bulk marking, verified institutional policy, public hosting, production identity recovery/revocation and official report approval remain outside this scoped delivery.
