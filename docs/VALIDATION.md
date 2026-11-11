# Verification record

Executed on 11 November 2026 against the implementation branch. Test data is synthetic. No real university deployment or student record migration was performed.

## Executed successfully

- Backend strict TypeScript checks, including seed, importer and tests; production compilation.
- Frontend strict TypeScript checks and production Vite build; clean lockfile-based installation.
- SQL migration applied to separate local PostgreSQL databases. PostgreSQL 18.6 was run as an isolated user-owned local process because Docker is absent on this workstation; CI targets PostgreSQL 16.
- **15 backend tests:** authentication and role/ownership boundaries; validation; completed/future/zero-session reporting; active-class selection and code-secret omission; enrolled versus unenrolled check-in; six concurrent submissions creating one attendance record; authoritative rotation/stop; correction reasons/history/late counting; completion/cancellation; refresh-token type/profile; empty/multi-page PDF output; import validation, repeatability and transactional rollback; stale/offline code rejection; exact 80% and expiry boundaries; Kampala dates.
- **3 browser journeys** using Playwright and local Brave/Chromium: lecturer opens a class, mobile student checks in, lecturer completes it, student sees the updated summary, registrar filters and downloads PDF; offline app reload with cached user-scoped classes, expired attempt rejection and account isolation; valid pending submission accepted after reconnection.
- A populated 46-student report rendered into three A4 PNG pages. All pages inspected: repeated headers, bounded columns, readable rows and page numbering; no clipping observed.
- Demo seed repeatability: counts unchanged after a repeated run (7 users, 2 offerings, 14 classes, 10 enrollments, 50 attendance records).
- Import CLI smoke test against the isolated test database.
- npm dependency audits: zero reported vulnerabilities in both applications at verification time.

## Reproduce browser tests

Use a separate database named `sams_test`. API tests deliberately clear it. E2E setup resets only `demo:*:live:*` fixture classes, so **never point these commands at real records**. Apply migrations, run backend tests, and then run the demo seed against that database.

Start the backend with DATABASE_URL pointing to that database, NODE_ENV=test, and distinct JWT secrets of 32+ characters. Build the frontend with NODE_ENV=production (so offline support is included), then start Vite preview. Defaults are API port 3000 and frontend port 5173. Install browser support from frontend with `npx playwright install chromium`, then:

```bash
SAMS_E2E_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test \
  npm run test:e2e --prefix frontend
```

Optional: SAMS_BASE_URL and SAMS_API_URL override the frontend/API origins. Set API_PROXY_TARGET when Vite preview should proxy to a different API port. PLAYWRIGHT_EXECUTABLE_PATH can select an installed Chromium-compatible browser. The E2E guard rejects database names not ending in `_test`.

## Boundaries

Docker/Compose cannot be executed on this workstation because no Docker engine/CLI is installed. The GitHub workflow installs dependencies, applies migrations, runs API/browser tests and builds both container images. Its remote result must be checked after pushing; inclusion of the workflow alone is not evidence of success.

No SSO, account recovery, refresh-token revocation, official Appendix D approval, retention policy certification, fee/coursework integration, real timetable reconciliation or public hosting is claimed. Those are explicitly outside the scoped classroom prototype. Offline sync requires the application to be open; rejected attempts require lecturer review, never automatic backdating.
